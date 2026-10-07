import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { SKR_LABEL } from '../config';
import { Button, C, Mark, Notice, T } from '../ui';
import { humanError, NO_WALLET, useWallet } from '../wallet';

export default function Connect({ onToast, onExplain }: { onToast: (m: string, k?: 'ok' | 'err') => void; onExplain: () => void }) {
  const { connectMwa, useDevWallet, mwaAvailable } = useWallet();
  const [busy, setBusy] = useState<'mwa' | 'dev' | null>(null);
  const [noWallet, setNoWallet] = useState(false);

  async function go(kind: 'mwa' | 'dev') {
    setBusy(kind);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (kind === 'mwa') await connectMwa();
      else await useDevWallet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const msg = humanError(e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (kind === 'mwa' && msg === NO_WALLET) setNoWallet(true);
      else onToast(msg, 'err');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: 'space-between', paddingTop: 32 }}>
      <View>
        <Mark size={60} />
        <T size={44} weight="800" style={{ marginTop: 28, lineHeight: 48 }} maxFontSizeMultiplier={1.3}>
          Clock in.{'\n'}Ask anything.{'\n'}Pay on delivery.
        </T>
        <T size={17} c={C.fg2} style={{ marginTop: 18, lineHeight: 25 }}>
          Earn {SKR_LABEL} every day you clock in, spend it on AI jobs that run on other people's Claude Code, and only
          pay for answers that actually arrive.
        </T>
        <Pressable
          onPress={onExplain}
          accessibilityRole="button"
          accessibilityLabel="How it works"
          hitSlop={8}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 8, opacity: pressed ? 0.6 : 1 })}
        >
          <T size={16} weight="600" style={{ textDecorationLine: 'underline' }}>
            How it works
          </T>
        </Pressable>
      </View>

      <View style={{ gap: 12, paddingBottom: 8 }}>
        {noWallet && (
          <Notice
            tone="warn"
            title="Install a Solana wallet"
            body="No Mobile Wallet Adapter wallet is on this device. On a Seeker, Seed Vault is built in. Elsewhere, install Phantom or Solflare and set it to devnet, or continue with the dev wallet."
          />
        )}
        {mwaAvailable ? (
          <>
            <Button title="Connect wallet" onPress={() => go('mwa')} busy={busy === 'mwa'} />
            <Button title="Use a dev wallet (devnet only)" kind="ghost" onPress={() => go('dev')} busy={busy === 'dev'} />
            <T size={13} c={C.fg3} style={{ textAlign: 'center' }}>
              Seed Vault or any Mobile Wallet Adapter wallet
            </T>
          </>
        ) : (
          <>
            <Button title="Continue with a dev wallet" onPress={() => go('dev')} busy={busy === 'dev'} />
            <T size={13} c={C.fg3} style={{ textAlign: 'center', lineHeight: 19 }}>
              {Platform.OS === 'ios'
                ? 'Mobile Wallet Adapter is Android-only. On a Seeker this button is "Connect wallet" (Seed Vault). The dev wallet is a devnet-only key that stays on this device.'
                : 'The dev wallet is a devnet-only key that stays on this device.'}
            </T>
          </>
        )}
      </View>
    </View>
  );
}
