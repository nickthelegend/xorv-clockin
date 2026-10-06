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
import { Linking, View } from 'react-native';
import { closeJobIx, fmtSkr, hex, Job, refundIx, short, STATUS } from '../chain';
import { CLUSTERS, SKR_LABEL } from '../config';
import { useData } from '../data';
import { Button, C, Card, Divider, Dot, Label, Pill, Row, T } from '../ui';
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

export function statusOf(j: Job, now: number): { label: string; color: string } {
  switch (j.status) {
    case STATUS.DELIVERED:
      return { label: 'Delivered', color: C.live };
    case STATUS.REFUNDED:
      return { label: 'Refunded', color: C.warn };
    case STATUS.REJECTED:
      return { label: 'Declined · refunded', color: C.warn };
    default:
      return now > j.deadline ? { label: 'Expired · claim refund', color: C.fail } : { label: 'In escrow · running', color: C.fg };
  }
}

const ago = (sec: number) =>
  sec < 60 ? `${sec}s ago` : sec < 3600 ? `${Math.floor(sec / 60)}m ago` : sec < 86400 ? `${Math.floor(sec / 3600)}h ago` : `${Math.floor(sec / 86400)}d ago`;

export function JobsList({ onOpen }: { onOpen: (job: PublicKey) => void }) {
  const { jobs, now } = useData();
  const t = now();
  return (
    <View style={{ gap: 12 }}>
      <T size={28} weight="800">
        Your jobs
      </T>
      {jobs.length === 0 && (
        <Card>
          <T c={C.fg2}>Nothing yet. Every job you post shows up here with its escrow state.</T>
        </Card>
      )}
      {jobs.map((j) => {
        const st = statusOf(j, t);
        return (
          <Card key={j.address.toBase58()} onPress={() => onOpen(j.address)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ gap: 8 }}>
                <Dot color={st.color} />
                <T size={12} weight="600" c={st.color}>
                  {st.label}
                </T>
              </Row>
              <T size={12} c={C.fg3}>
                {ago(Math.max(0, t - j.createdAt))}
              </T>
            </Row>
            <T weight="600" style={{ marginTop: 10 }} numberOfLines={2}>
              {j.prompt}
            </T>
            {j.status === STATUS.DELIVERED && (
              <T size={13} c={C.fg2} style={{ marginTop: 6 }} numberOfLines={2}>
                {j.result}
              </T>
            )}
            <T size={12} c={C.fg3} style={{ marginTop: 8 }}>
              {fmtSkr(j.amount)} {SKR_LABEL}
              {j.slashed > 0n ? ` · +${fmtSkr(j.slashed)} slashed to you` : ''}
            </T>
          </Card>
        );
      })}
    </View>
  );
}

export function JobDetail({ job, onBack, onToast }: { job: PublicKey; onBack: () => void; onToast: (m: string, k?: 'ok' | 'err') => void }) {
  const { jobs, providers, now, refresh } = useData();
  const { send, publicKey, cluster } = useWallet();
  const [sigs, setSigs] = useState<Sigs>({});
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    loadSigs().then(setSigs);
    const i = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const j = jobs.find((x) => x.address.equals(job));
  const t = now();
  if (!j)
    return (
      <View style={{ gap: 12 }}>
        <Button title="← Back" kind="ghost" onPress={onBack} style={{ height: 40, alignSelf: 'flex-start' }} />
        <T c={C.fg2}>Loading job… (closed jobs disappear from chain once their rent is reclaimed)</T>
      </View>
    );
  const st = statusOf(j, t);
  const prov = providers.find((p) => p.address.equals(j.provider));
  const left = j.deadline - t;
  const my = sigs[j.address.toBase58()] ?? {};
  const open = (sig: string) => Linking.openURL(CLUSTERS[cluster].explorer(sig));

  async function claimRefund() {
    setBusy(true);
    try {
      const sig = await send([refundIx(publicKey!, j!)]);
      await rememberSig(j!.address.toBase58(), 'refund', sig);
      setSigs(await loadSigs());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToast('Refunded — plus the provider\'s slashed bond', 'ok');
      refresh();
    } catch (e) {
      onToast(humanError(e), 'err');
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    setBusy(true);
    try {
      await send([closeJobIx(publicKey!, j!.address)]);
      onToast('Job closed — rent returned to you', 'ok');
      await refresh();
      onBack();
    } catch (e) {
      onToast(humanError(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  const steps: { label: string; done: boolean; sub?: string }[] = [
    { label: `Paid ${fmtSkr(j.amount)} ${SKR_LABEL} into escrow`, done: true, sub: short(j.address, 6) },
    {
      label: prov ? `Matched to ${prov.name}` : 'Matched',
      done: true,
      sub: prov ? `${prov.model} · ${fmtSkr(prov.bond)} ${SKR_LABEL} bonded` : undefined,
    },
    j.status === STATUS.DELIVERED
      ? { label: 'Answer delivered · escrow released to provider', done: true }
      : j.status === STATUS.FUNDED
        ? { label: left > 0 ? `Running · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} until refundable` : 'Deadline passed', done: false }
        : {
            label: j.status === STATUS.REJECTED ? 'Provider declined · refunded instantly' : `Refunded + ${fmtSkr(j.slashed)} ${SKR_LABEL} from the bond`,
            done: true,
          },
  ];

  return (
    <View style={{ gap: 14 }}>
      <Button title="← Jobs" kind="ghost" onPress={onBack} style={{ height: 40, alignSelf: 'flex-start' }} />
      <Pill color={st.color} border={st.color}>
        {st.label}
      </Pill>
      <T size={22} weight="700" style={{ lineHeight: 28 }}>
        {j.prompt}
      </T>

      <Card>
        {steps.map((s, i) => (
          <Row key={i} style={{ alignItems: 'flex-start', gap: 12, marginBottom: i < steps.length - 1 ? 14 : 0 }}>
            <View style={{ marginTop: 5 }}>
              <Dot color={s.done ? C.fg : C.fg4} size={10} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="600" c={s.done ? C.fg : C.fg2}>
                {s.label}
              </T>
              {s.sub ? (
                <T size={12} c={C.fg3} m style={{ marginTop: 2 }}>
                  {s.sub}
                </T>
              ) : null}
            </View>
          </Row>
        ))}
      </Card>

      {j.status === STATUS.DELIVERED && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>Answer</Label>
            <Pill color={j.hashVerified ? C.live : C.fail} border={j.hashVerified ? 'rgba(74,222,128,0.35)' : C.fail}>
              {j.hashVerified ? '✓ sha-256 matches chain' : '✗ hash mismatch'}
            </Pill>
          </Row>
          <T size={15} style={{ marginTop: 12, lineHeight: 22 }} selectable>
            {j.result}
          </T>
          <Divider />
          <T size={11} c={C.fg3} m selectable>
            sha256 {hex(j.resultHash)}
          </T>
          <Button
            title="Copy answer"
            kind="ghost"
            onPress={async () => {
              await Clipboard.setStringAsync(j.result);
              onToast('Copied', 'ok');
            }}
            style={{ marginTop: 12, height: 44 }}
          />
        </Card>
      )}

      {j.status === STATUS.FUNDED && left <= 0 && (
        <Button title="Claim refund + slashed bond" onPress={claimRefund} busy={busy} />
      )}
      {j.status === STATUS.FUNDED && left > 0 && (
        <T size={12} c={C.fg3} style={{ textAlign: 'center' }}>
          The provider polls the chain every few seconds. Most answers land in under a minute.
        </T>
      )}

      <Card>
        <Label>On-chain</Label>
        {my.posted ? (
          <T size={13} c={C.fg2} style={{ marginTop: 8 }} onPress={() => open(my.posted!)}>
            Escrow funded · {short(my.posted, 8)} ↗
          </T>
        ) : null}
        {my.refund ? (
          <T size={13} c={C.fg2} style={{ marginTop: 8 }} onPress={() => open(my.refund!)}>
            Refund · {short(my.refund, 8)} ↗
          </T>
        ) : null}
        <T size={12} c={C.fg3} m style={{ marginTop: 8 }} selectable>
          job {j.address.toBase58()}
        </T>
      </Card>

      {j.status !== STATUS.FUNDED && (
        <Button title="Close job · reclaim rent" kind="ghost" onPress={close} busy={busy} />
      )}
    </View>
  );
}
