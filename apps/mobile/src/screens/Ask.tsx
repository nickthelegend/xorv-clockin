/**
 * Ask — post a job to the network. The phone runs the matcher the broker used
 * to run (live → reputation → bond → price), the buyer signs once, and the
 * price moves into an escrow vault owned by the job account.
 */
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { fmtSkr, isLive, MAX_PROMPT, postJobIx, Provider, reputation } from '../chain';
import { SKR_LABEL } from '../config';
import { useData } from '../data';
import { Button, C, Card, Dot, Label, Pill, Row, T } from '../ui';
import { humanError, useWallet } from '../wallet';
import { rememberSig } from './Jobs';
import { PublicKey } from '@solana/web3.js';

const SUGGESTIONS = [
  'Explain what a Solana PDA is like I\'m five.',
  'Write a regex that matches a Solana base58 address.',
  'Review this tweet for clarity: "gm, shipping on Seeker today"',
  'Give me a 3-step plan to learn Anchor this week.',
];

export default function Ask({ onPosted, onToast }: { onPosted: (job: PublicKey) => void; onToast: (m: string, k?: 'ok' | 'err') => void }) {
  const { publicKey, send } = useWallet();
  const { providers, skr, now, refresh, config } = useData();
  const [prompt, setPrompt] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = now();

  const live = useMemo(() => providers.filter((p) => isLive(p, t)), [providers, t]);
  const chosen: Provider | undefined =
    providers.find((p) => p.address.toBase58() === picked && p.active) ?? live[0] ?? providers.find((p) => p.active);
  const price = chosen?.price ?? 0n;
  const enough = skr >= price;
  const bytes = new TextEncoder().encode(prompt).length;

  async function post() {
    if (!publicKey || !chosen || !prompt.trim()) return;
    setBusy(true);
    try {
      const nonce = BigInt(Date.now());
      const { ix, job } = postJobIx(publicKey, chosen.authority, nonce, prompt.trim(), price);
      const sig = await send([ix]);
      await rememberSig(job.toBase58(), 'posted', sig);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToast(`Paid ${fmtSkr(price)} ${SKR_LABEL} into escrow`, 'ok');
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
    <View style={{ gap: 14 }}>
      <View>
        <T size={28} weight="800">
          Ask the network
        </T>
        <T size={14} c={C.fg2} style={{ marginTop: 4, lineHeight: 20 }}>
          A real coding agent on someone's machine answers. You pay only when the answer arrives.
        </T>
      </View>

      <Card style={{ padding: 0 }}>
        <TextInput
          value={prompt}
          onChangeText={(v) => setPrompt(v)}
          placeholder="What do you need done?"
          placeholderTextColor={C.fg4}
          multiline
          maxLength={MAX_PROMPT}
          style={{ color: C.fg, fontSize: 17, minHeight: 130, padding: 18, textAlignVertical: 'top' }}
          accessibilityLabel="Job prompt"
        />
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 }}>
          <T size={11} c={C.fg4}>
            Public on-chain · don't paste secrets
          </T>
          <T size={11} c={bytes > MAX_PROMPT - 40 ? C.warn : C.fg4} m>
            {bytes}/{MAX_PROMPT}
          </T>
        </Row>
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SUGGESTIONS.map((sug) => (
          <Pressable
            key={sug}
            onPress={() => {
              Haptics.selectionAsync();
              setPrompt(sug);
            }}
            style={{ borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 260 }}
          >
            <T size={13} c={C.fg2} numberOfLines={1}>
              {sug}
            </T>
          </Pressable>
        ))}
      </ScrollView>

      <Label style={{ marginTop: 6 }}>Provider · ranked on-chain</Label>
      {providers.length === 0 ? (
        <Card>
          <T c={C.fg2}>No provider nodes have registered on this cluster yet.</T>
          <T size={12} c={C.fg3} style={{ marginTop: 6 }}>
            Run one: pnpm --filter @xorv/solana node
          </T>
        </Card>
      ) : (
        providers.slice(0, 4).map((p) => {
          const on = isLive(p, t);
          const sel = chosen?.address.equals(p.address);
          return (
            <Card key={p.address.toBase58()} onPress={() => setPicked(p.address.toBase58())} style={sel ? { borderColor: C.fg } : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row style={{ gap: 8, flex: 1 }}>
                  <Dot color={on ? C.live : C.fg4} />
                  <T weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {p.name}
                  </T>
                  <Pill>{p.model || 'agent'}</Pill>
                </Row>
                <T weight="700">
                  {fmtSkr(p.price)} {SKR_LABEL}
                </T>
              </Row>
              <T size={12} c={C.fg3} style={{ marginTop: 8 }}>
                {Math.round(reputation(p) * 100)}% reputation · {p.completed} done · {p.failed} failed · {fmtSkr(p.bond)} {SKR_LABEL} bonded
                {on ? '' : ' · offline'}
              </T>
            </Card>
          );
        })
      )}

      <Button
        title={
          !chosen
            ? 'No provider available'
            : !enough
              ? `Need ${fmtSkr(price)} ${SKR_LABEL} — clock in first`
              : `Pay ${fmtSkr(price)} ${SKR_LABEL} & ask`
        }
        onPress={post}
        busy={busy}
        disabled={!chosen || !prompt.trim() || !enough}
        style={{ marginTop: 6 }}
      />
      {chosen && config && (
        <T size={12} c={C.fg3} style={{ textAlign: 'center', lineHeight: 18 }}>
          Escrowed until delivered. No answer in {Math.round(config.jobTimeout / 60)} min → full refund + {config.slashBps / 100}% of the
          provider's bond, claimable by you.
        </T>
      )}
    </View>
  );
}
