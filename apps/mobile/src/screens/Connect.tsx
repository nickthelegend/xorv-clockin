import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { SKR_LABEL } from '../config';
import { Button, C, Card, Label, Mark, T } from '../ui';
import { humanError, NO_WALLET, useWallet } from '../wallet';

export default function Connect({ onToast }: { onToast: (m: string, k?: 'ok' | 'err') => void }) {
  const { connectMwa, useDevWallet, mwaAvailable } = useWallet();
  const [busy, setBusy] = useState<'mwa' | 'dev' | null>(null);
  const [noWallet, setNoWallet] = useState(false);

  async function go(kind: 'mwa' | 'dev') {
    setBusy(kind);
    try {
      if (kind === 'mwa') await connectMwa();
      else await useDevWallet();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const msg = humanError(e);
      if (kind === 'mwa' && msg === NO_WALLET) setNoWallet(true);
      else onToast(msg, 'err');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: 'space-between', paddingTop: 40 }}>
      <View>
        <Mark size={64} />
        <T size={44} weight="800" style={{ marginTop: 28, lineHeight: 48 }}>
          Clock in.{'\n'}Ask anything.{'\n'}Pay on delivery.
        </T>
        <T size={16} c={C.fg2} style={{ marginTop: 18, lineHeight: 24 }}>
          Xorv is a network of people renting out the Claude Code they already pay for. Clock in daily to earn {SKR_LABEL},
          spend it on real AI jobs, and let a Solana escrow make sure you only pay for answers that arrive.
        </T>
      </View>

      <View style={{ gap: 12, paddingBottom: 12 }}>
        {noWallet && (
          <Card style={{ borderColor: C.warn }}>
            <T weight="600">Install a Solana wallet</T>
            <T size={13} c={C.fg2} style={{ marginTop: 6, lineHeight: 19 }}>
              No Mobile Wallet Adapter wallet is installed. On a Seeker, Seed Vault is built in. Elsewhere, install
              Phantom or Solflare and switch it to devnet, or continue with the dev wallet below.
            </T>
          </Card>
        )}
        {mwaAvailable && (
          <Button title="Connect wallet" onPress={() => go('mwa')} busy={busy === 'mwa'} />
        )}
        <Button
          title={mwaAvailable ? 'Use a dev wallet instead' : 'Use dev wallet'}
          kind={mwaAvailable ? 'ghost' : 'primary'}
          onPress={() => go('dev')}
          busy={busy === 'dev'}
        />
        <Label style={{ textAlign: 'center', marginTop: 4 }}>
          {mwaAvailable
            ? 'Seed Vault · any Mobile Wallet Adapter wallet'
            : `${Platform.OS === 'ios' ? 'iOS has no Mobile Wallet Adapter' : 'No MWA'} · dev wallet is devnet-only`}
        </Label>
      </View>
    </View>
  );
}
