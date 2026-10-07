import { Buffer } from 'buffer';
/**
 * Ask — post a job to the network. The phone runs the matcher the broker used
 * to run (live → reputation → bond → price), the buyer signs once, and the
 * price moves into an escrow vault owned by the job account.
 */
import { PublicKey } from '@solana/web3.js';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { fmtSkr, isLive, MAX_PROMPT, postJobIx, Provider, reputation } from '../chain';
import { SKR_LABEL } from '../config';
import { useData } from '../data';
import { Badge, Button, C, Card, Label, Notice, Row, Skeleton, T } from '../ui';
import { humanError, useWallet } from '../wallet';
import { rememberSig } from './Jobs';

const SUGGESTIONS = [
  'Explain a Solana PDA like I\'m five.',
  'Write a regex for a Solana address.',
  'Tighten this tweet: "gm, shipping on Seeker today"',
  'A 3-step plan to learn Anchor this week.',
];

export default function Ask({
  onPosted,
  onToast,
  onClockIn,
}: {
  onPosted: (job: PublicKey) => void;
  onToast: (m: string, k?: 'ok' | 'err') => void;
  onClockIn: () => void;
}) {
  const { publicKey, send } = useWallet();
  const { providers, skr, now, refresh, config, loading, error } = useData();
  const [prompt, setPrompt] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = now();

  const live = useMemo(() => providers.filter((p) => isLive(p, t)), [providers, t]);
  const chosen: Provider | undefined =
    providers.find((p) => p.address.toBase58() === picked && p.active) ?? live[0] ?? providers.find((p) => p.active);
  const chosenLive = !!chosen && isLive(chosen, t);
  const price = chosen?.price ?? 0n;
  const enough = skr >= price;
  const bytes = Buffer.byteLength(prompt, 'utf8');
  const near = bytes > MAX_PROMPT - 60;
  const minutes = Math.round((config?.jobTimeout ?? 600) / 60);
  const slashPct = (config?.slashBps ?? 2000) / 100;
  const slashAmt = chosen ? (chosen.bond * BigInt(config?.slashBps ?? 2000)) / 10_000n : 0n;

  async function post() {
    if (!publicKey || !chosen || !prompt.trim()) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const nonce = BigInt(Date.now());
      const { ix, job } = postJobIx(publicKey, chosen.authority, nonce, prompt.trim(), price);
      const sig = await send([ix]);
      await rememberSig(job.toBase58(), 'posted', sig);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToast(`${fmtSkr(price)} ${SKR_LABEL} is in escrow`, 'ok');
      setPrompt('');
      await refresh();
      onPosted(job);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      onToast(humanError(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <View>
        <T size={30} weight="800">
          Ask the network
        </T>
        <T size={15} c={C.fg2} style={{ marginTop: 6, lineHeight: 22 }}>
          A coding agent on someone's machine answers. You pay only when the answer arrives.
        </T>
      </View>

      <View
        style={{
          backgroundColor: C.surface,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: focused ? C.line3 : C.line,
        }}
      >
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="What do you need done?"
          placeholderTextColor={C.fg3}
          multiline
          maxLength={MAX_PROMPT}
          selectionColor={C.fg}
          style={{ color: C.fg, fontSize: 17, lineHeight: 24, minHeight: 132, padding: 18, paddingBottom: 8, textAlignVertical: 'top' }}
          accessibilityLabel="Job prompt"
          accessibilityHint="Prompts are stored on-chain and are public"
        />
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 14, gap: 12 }}>
          <T size={12} c={C.fg3} style={{ flex: 1 }}>
            Public on-chain. Don't paste secrets.
          </T>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 3,
              backgroundColor: near ? 'rgba(251,191,36,0.12)' : C.surface2,
            }}
          >
            <T size={12} m c={near ? C.warn : C.fg2}>
              {bytes}/{MAX_PROMPT}
            </T>
          </View>
        </Row>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SUGGESTIONS.map((sug) => (
          <Pressable
            key={sug}
            accessibilityRole="button"
            accessibilityLabel={`Use example: ${sug}`}
            onPress={() => {
              Haptics.selectionAsync();
              setPrompt(sug);
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: prompt === sug ? C.fg : C.line2,
              backgroundColor: pressed ? C.surface2 : 'transparent',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <T size={14} c={prompt === sug ? C.fg : C.fg2}>
              {sug}
            </T>
          </Pressable>
        ))}
      </View>

      <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <Label>Who answers</Label>
        <T size={12} c={C.fg3}>
          ranked from on-chain records
        </T>
      </Row>
      {loading && providers.length === 0 ? (
        <Skeleton h={92} r={18} />
      ) : providers.length === 0 ? (
        <Notice
          title="No provider nodes yet"
          body={
            error
              ? 'The network is unreachable right now, so providers can\'t be listed. Pull down to retry.'
              : 'Nobody has registered a node on this cluster. Anyone with Claude Code can run one: pnpm --filter @xorv/solana node'
          }
        />
      ) : (
        providers.slice(0, 4).map((p) => {
          const on = isLive(p, t);
          const sel = chosen?.address.equals(p.address);
          return (
            <Card
              key={p.address.toBase58()}
              onPress={() => setPicked(p.address.toBase58())}
              style={sel ? { borderColor: C.fg } : undefined}
            >
              <Row style={{ justifyContent: 'space-between', gap: 10 }}>
                <T size={17} weight="700" numberOfLines={1} style={{ flex: 1 }}>
                  {p.name}
                </T>
                <T size={17} weight="800">
                  {fmtSkr(p.price)} {SKR_LABEL}
                </T>
              </Row>
              <Row style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Badge tone={on ? 'live' : 'neutral'}>{on ? 'Live' : 'Offline'}</Badge>
                <Badge tone="neutral" dot={false}>
                  {p.model || 'agent'}
                </Badge>
              </Row>
              <T size={13} c={C.fg2} style={{ marginTop: 10 }}>
                {Math.round(reputation(p) * 100)}% reputation · {p.completed} done · {p.failed} failed · {fmtSkr(p.bond)} {SKR_LABEL} bonded
              </T>
            </Card>
          );
        })
      )}
      {providers.length > 0 && live.length === 0 && (
        <Notice
          tone="warn"
          title="No node is live right now"
          body={`You can still post. If nobody answers within ${minutes} min you get your ${SKR_LABEL} back, plus ${slashPct}% of the provider's bond.`}
        />
      )}

      {chosen && (
        <Card style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size={15} c={C.fg2}>
              You pay into escrow
            </T>
            <T size={15} weight="700">
              {fmtSkr(price)} {SKR_LABEL}
            </T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size={15} c={C.fg2}>
              Released to {chosen.name.length > 16 ? chosen.name.slice(0, 15) + '…' : chosen.name}
            </T>
            <T size={15} weight="600">
              on delivery
            </T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size={15} c={C.fg2}>
              No answer in {minutes} min
            </T>
            <T size={15} weight="600">
              all back + {fmtSkr(slashAmt)} extra
            </T>
          </Row>
        </Card>
      )}

      {chosen && !enough ? (
        <Button title={`Clock in to earn ${SKR_LABEL}`} onPress={onClockIn} />
      ) : (
        <Button
          title={!chosen ? 'No provider available' : `Pay ${fmtSkr(price)} ${SKR_LABEL} & ask`}
          onPress={post}
          busy={busy}
          disabled={!chosen || !prompt.trim()}
        />
      )}
      {chosen && !enough && (
        <T size={13} c={C.fg3} style={{ textAlign: 'center' }}>
          You have {fmtSkr(skr)} {SKR_LABEL}; this job costs {fmtSkr(price)}.
        </T>
      )}
      {chosen && !chosenLive && enough && (
        <T size={13} c={C.fg3} style={{ textAlign: 'center' }}>
          {chosen.name} is offline. Pick a live node for a fast answer.
        </T>
      )}
    </View>
  );
}
