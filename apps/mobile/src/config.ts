import { Platform } from 'react-native';

export type ClusterId = 'devnet' | 'localnet';

export const CLUSTERS: Record<ClusterId, { label: string; rpc: string; explorer: (sig: string) => string }> = {
  devnet: {
    label: 'Solana devnet',
    rpc: 'https://api.devnet.solana.com',
    explorer: (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  },
  localnet: {
    // The developer's solana-test-validator (solana/scripts/localnet-dev.sh).
    label: 'Local validator (dev)',
    rpc: Platform.OS === 'android' ? 'http://10.0.2.2:4510' : 'http://127.0.0.1:4510',
    explorer: (sig) =>
      `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent('http://127.0.0.1:4510')}`,
  },
};

export const DEFAULT_CLUSTER: ClusterId =
  (process.env.EXPO_PUBLIC_CLUSTER as ClusterId | undefined) ?? 'devnet';

// MWA identity: the icon path is resolved relative to `uri` and must exist there.
export const APP_IDENTITY = {
  name: 'Xorv',
  uri: 'https://xorv.vercel.app',
  icon: 'brand/xorv-mark.svg',
};

/** Honest labelling: on devnet the token is not SKR, it is our stand-in. */
export const SKR_LABEL = 'tSKR';
export const SKR_LONG_LABEL = 'tSKR · devnet stand-in for SKR';
