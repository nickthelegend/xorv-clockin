/**
 * Jobs — the buyer's ledger, and the detail view where the escrow's promise is
 * visible: funded → delivered (hash re-checked on this phone) or → refunded
 * with the slash.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PublicKey } from '@solana/web3.js';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { closeJobIx, fmtSkr, hex, Job, refundIx, short, STATUS } from '../chain';
import { CLUSTERS, SKR_LABEL } from '../config';
import { useData } from '../data';
import { Badge, Button, C, Card, ChainRow, Dot, Label, Notice, Row, Skeleton, T, Tone } from '../ui';
import { humanError, useWallet } from '../wallet';

const SIGS = 'xorv.sigs.v1';
type Sigs = Record<string, { posted?: string; refund?: string }>;

export async function rememberSig(job: string, kind: 'posted' | 'refund', sig: string) {
  const raw = await AsyncStorage.getItem(SIGS);
  const all: Sigs = raw ? JSON.parse(raw) : {};
  all[job] = { ...all[job], [kind]: sig };
  await AsyncStorage.setItem(SIGS, JSON.stringify(all));
}
async function loadSigs(): Promise<Sigs> {
  const raw = await AsyncStorage.getItem(SIGS);
  return raw ? JSON.parse(raw) : {};
}

export function statusOf(j: Job, now: number): { label: string; tone: Tone } {
  switch (j.status) {
    case STATUS.DELIVERED:
      return { label: 'Delivered', tone: 'live' };
    case STATUS.REFUNDED:
      return { label: 'Refunded', tone: 'warn' };
    case STATUS.REJECTED:
      return { label: 'Declined · refunded', tone: 'warn' };
    default:
      return now > j.deadline ? { label: 'Expired · refund ready', tone: 'fail' } : { label: 'In escrow', tone: 'neutral' };
  }
}

const ago = (sec: number) =>
  sec < 60 ? `${sec}s ago` : sec < 3600 ? `${Math.floor(sec / 60)}m ago` : sec < 86400 ? `${Math.floor(sec / 3600)}h ago` : `${Math.floor(sec / 86400)}d ago`;

export function JobsList({ onOpen, onAsk }: { onOpen: (job: PublicKey) => void; onAsk: () => void }) {
  const { jobs, now, loading } = useData();
  const t = now();
  return (
    <View style={{ gap: 12 }}>
      <T size={30} weight="800">
        Your jobs
      </T>
      {loading && jobs.length === 0 ? (
        <>
          <Skeleton h={110} r={18} />
          <Skeleton h={110} r={18} />
        </>
      ) : jobs.length === 0 ? (
        <Notice
          title="No jobs yet"
          body="Every job you post lands here with its escrow state: in escrow, delivered with a verified hash, or refunded."
          action={{ title: 'Ask the network', onPress: onAsk }}
        />
      ) : (
        jobs.map((j) => {
          const st = statusOf(j, t);
          return (
            <Card key={j.address.toBase58()} onPress={() => onOpen(j.address)}>
              <Row style={{ justifyContent: 'space-between', gap: 10 }}>
                <Badge tone={st.tone}>{st.label}</Badge>
                <T size={13} c={C.fg3}>
                  {ago(Math.max(0, t - j.createdAt))}
                </T>
              </Row>
              <T size={16} weight="700" style={{ marginTop: 12, lineHeight: 22 }} numberOfLines={2}>
                {j.prompt}
              </T>
              {j.status === STATUS.DELIVERED && (
                <T size={14} c={C.fg2} style={{ marginTop: 6, lineHeight: 20 }} numberOfLines={2}>
                  {j.result}
                </T>
              )}
              <T size={13} c={C.fg3} style={{ marginTop: 10 }}>
                {fmtSkr(j.amount)} {SKR_LABEL}
                {j.slashed > 0n ? ` · +${fmtSkr(j.slashed)} from the bond` : ''}
              </T>
            </Card>
          );
        })
      )}
    </View>
  );
}

const PREVIEW_LINES = 7;

export function JobDetail({ job, onBack, onToast }: { job: PublicKey; onBack: () => void; onToast: (m: string, k?: 'ok' | 'err') => void }) {
  const { jobs, providers, now, refresh } = useData();
  const { send, publicKey, cluster } = useWallet();
  const [sigs, setSigs] = useState<Sigs>({});
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    loadSigs().then(setSigs);
    const i = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const j = jobs.find((x) => x.address.equals(job));
  const t = now();

  const back = (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onBack();
      }}
      accessibilityRole="button"
      accessibilityLabel="Back to jobs"
      hitSlop={8}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path d="M15 5l-7 7 7 7" stroke={C.fg2} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <T size={16} weight="600" c={C.fg2}>
        Jobs
      </T>
    </Pressable>
  );

  if (!j)
    return (
      <View style={{ gap: 12 }}>
        {back}
        <Skeleton h={28} w="60%" />
        <Skeleton h={160} r={18} />
        <T size={13} c={C.fg3}>
          Loading the job account… (a closed job disappears from chain once its rent is reclaimed)
        </T>
      </View>
    );

  const st = statusOf(j, t);
  const prov = providers.find((p) => p.address.equals(j.provider));
  const left = j.deadline - t;
  const my = sigs[j.address.toBase58()] ?? {};
  const openTx = (sig: string) => Linking.openURL(CLUSTERS[cluster].explorer(sig));
  const openAddr = (a: string) => Linking.openURL(CLUSTERS[cluster].address(a));
  const copy = async (v: string) => {
    await Clipboard.setStringAsync(v);
    onToast('Copied', 'ok');
  };

  async function claimRefund() {
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const sig = await send([refundIx(publicKey!, j!)]);
      await rememberSig(j!.address.toBase58(), 'refund', sig);
      setSigs(await loadSigs());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToast('Refunded, plus a slice of the provider\'s bond', 'ok');
      refresh();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      onToast(humanError(e), 'err');
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    setBusy(true);
    try {
      await send([closeJobIx(publicKey!, j!.address)]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToast('Job closed · rent returned to you', 'ok');
      await refresh();
      onBack();
    } catch (e) {
      onToast(humanError(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const steps: { label: string; done: boolean; sub?: string }[] = [
    { label: `Paid ${fmtSkr(j.amount)} ${SKR_LABEL} into escrow`, done: true },
    { label: prov ? `Matched to ${prov.name}` : 'Matched', done: true, sub: prov ? `${prov.model} · ${fmtSkr(prov.bond)} ${SKR_LABEL} bonded` : undefined },
    j.status === STATUS.DELIVERED
      ? { label: 'Answer delivered · escrow released', done: true }
      : j.status === STATUS.FUNDED
        ? left > 0
          ? { label: 'Waiting for the answer', done: false, sub: `Refundable in ${mmss(left)}` }
          : { label: 'Deadline passed', done: false, sub: 'You can claim a refund now' }
        : {
            label: j.status === STATUS.REJECTED ? 'Provider declined · refunded' : `Refunded + ${fmtSkr(j.slashed)} ${SKR_LABEL} from the bond`,
            done: true,
          },
  ];

  return (
    <View style={{ gap: 16 }}>
      {back}
      <Badge tone={st.tone}>{st.label}</Badge>
      <T size={24} weight="800" style={{ lineHeight: 30 }}>
        {j.prompt}
      </T>

      <Card>
        {steps.map((s, i) => (
          <Row key={i} style={{ alignItems: 'flex-start', gap: 14 }}>
            <View style={{ alignItems: 'center', width: 12, alignSelf: 'stretch' }}>
              <View style={{ marginTop: 6 }}>
                <Dot color={s.done ? C.fg : C.fg4} size={10} />
              </View>
              {i < steps.length - 1 && <View style={{ width: 1, flex: 1, backgroundColor: C.line2, marginTop: 4 }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: i < steps.length - 1 ? 16 : 0 }}>
              <T size={16} weight="600" c={s.done ? C.fg : C.fg2}>
                {s.label}
              </T>
              {s.sub ? (
                <T size={13} c={C.fg3} style={{ marginTop: 3 }}>
                  {s.sub}
                </T>
              ) : null}
            </View>
          </Row>
        ))}
      </Card>

      {j.status === STATUS.DELIVERED && (
        <Card>
          <Row style={{ justifyContent: 'space-between', gap: 10 }}>
            <Label>Answer</Label>
            <Badge tone={j.hashVerified ? 'live' : 'fail'}>{j.hashVerified ? 'Hash verified on this phone' : 'Hash mismatch'}</Badge>
          </Row>
          <T
            size={16}
            style={{ marginTop: 14, lineHeight: 24 }}
            selectable
            numberOfLines={expanded ? undefined : PREVIEW_LINES}
            onTextLayout={(e) => {
              if (!expanded && e.nativeEvent.lines.length >= PREVIEW_LINES) setOverflows(true);
            }}
          >
            {j.result}
          </T>
          <Row style={{ gap: 10, marginTop: 14 }}>
            {(overflows || expanded) && (
              <Button
                title={expanded ? 'Show less' : 'Read more'}
                kind="ghost"
                onPress={() => setExpanded((x) => !x)}
                style={{ flex: 1, height: 46 }}
              />
            )}
            <Button title="Copy answer" kind="ghost" onPress={() => copy(j.result)} style={{ flex: 1, height: 46 }} />
          </Row>
        </Card>
      )}

      {j.status === STATUS.FUNDED && left <= 0 && <Button title="Claim refund + slashed bond" onPress={claimRefund} busy={busy} />}
      {j.status === STATUS.FUNDED && left > 0 && (
        <T size={13} c={C.fg3} style={{ textAlign: 'center', lineHeight: 19 }}>
          The provider's node polls the chain every few seconds. Most answers land in under a minute.
        </T>
      )}

      <Card style={{ paddingVertical: 10 }}>
        <Label style={{ marginTop: 6, marginBottom: 4 }}>On-chain</Label>
        {my.posted && <ChainRow label="Escrow funded (tx)" value={my.posted} short={short(my.posted, 6)} onCopy={copy} onOpen={() => openTx(my.posted!)} />}
        {my.refund && <ChainRow label="Refund (tx)" value={my.refund} short={short(my.refund, 6)} onCopy={copy} onOpen={() => openTx(my.refund!)} />}
        <ChainRow label="Job account" value={j.address.toBase58()} short={short(j.address, 6)} onCopy={copy} onOpen={() => openAddr(j.address.toBase58())} />
        {prov && <ChainRow label={`Provider · ${prov.name}`} value={prov.authority.toBase58()} short={short(prov.authority, 6)} onCopy={copy} onOpen={() => openAddr(prov.authority.toBase58())} />}
        {j.status === STATUS.DELIVERED && <ChainRow label="Answer SHA-256" value={hex(j.resultHash)} short={`${hex(j.resultHash).slice(0, 10)}…${hex(j.resultHash).slice(-6)}`} onCopy={copy} />}
      </Card>

      {j.status !== STATUS.FUNDED && <Button title="Close job · reclaim rent" kind="ghost" onPress={close} busy={busy} />}
    </View>
  );
}
