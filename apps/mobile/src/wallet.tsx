/**
 * Two wallets, one interface.
 *
 *  - **Mobile Wallet Adapter** (Android): the primary path. Seed Vault on a
 *    Seeker, or any MWA wallet (Phantom, Solflare, Mock MWA Wallet). The auth
 *    token is cached in SecureStore so a daily open costs no wallet prompt
 *    until the user actually signs.
 *  - **Dev wallet** (iOS simulator, or Android with no MWA wallet installed):
 *    a keypair generated on the device, kept in SecureStore, labelled as
 *    devnet-only everywhere it appears.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { APP_IDENTITY, CLUSTERS, ClusterId, DEFAULT_CLUSTER } from './config';

type Kind = 'mwa' | 'dev';

interface WalletState {
  ready: boolean;
  kind: Kind | null;
  publicKey: PublicKey | null;
  cluster: ClusterId;
  connection: Connection;
  mwaAvailable: boolean;
  connectMwa: () => Promise<void>;
  useDevWallet: () => Promise<void>;
  disconnect: () => Promise<void>;
  setCluster: (c: ClusterId) => Promise<void>;
  /** Build a v0 tx from `ixs`, sign with the active wallet, send, confirm. */
  send: (ixs: TransactionInstruction[]) => Promise<string>;
  airdrop: () => Promise<string>;
}

const Ctx = createContext<WalletState | null>(null);
export const useWallet = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWallet outside WalletProvider');
  return v;
};

const DEV_KEY = 'xorv.devwallet.v1';
const MWA_TOKEN = 'xorv.mwa.token';
const MWA_ADDR = 'xorv.mwa.address';
const KIND = 'xorv.wallet.kind';
const CLUSTER = 'xorv.cluster';

async function loadDevKeypair(create: boolean): Promise<Keypair | null> {
  const raw = await SecureStore.getItemAsync(DEV_KEY);
  if (raw) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  if (!create) return null;
  const kp = Keypair.generate();
  await SecureStore.setItemAsync(DEV_KEY, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

/** Imported lazily: on iOS the native module doesn't exist and a static import throws. */
async function mwa() {
  return await import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [dev, setDev] = useState<Keypair | null>(null);
  const [cluster, setClusterState] = useState<ClusterId>(DEFAULT_CLUSTER);
  const mwaAvailable = Platform.OS === 'android';

  const connection = useMemo(() => new Connection(CLUSTERS[cluster].rpc, 'confirmed'), [cluster]);
  // MWA wallets only know public clusters; the local validator is reached with the dev wallet.
  const chain = 'solana:devnet' as const;

  // Restore the last session without prompting.
  useEffect(() => {
    (async () => {
      try {
        const c = (await AsyncStorage.getItem(CLUSTER)) as ClusterId | null;
        if (c && CLUSTERS[c]) setClusterState(c);
        const k = (await AsyncStorage.getItem(KIND)) as Kind | null;
        if (k === 'dev') {
          const kp = await loadDevKeypair(false);
          if (kp) {
            setDev(kp);
            setPublicKey(kp.publicKey);
            setKind('dev');
          }
        } else if (k === 'mwa') {
          const addr = await SecureStore.getItemAsync(MWA_ADDR);
          if (addr) {
            setPublicKey(new PublicKey(addr));
            setKind('mwa');
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const authorize = useCallback(
    async (wallet: any): Promise<PublicKey> => {
      const cached = await SecureStore.getItemAsync(MWA_TOKEN);
      let auth;
      try {
        auth = await wallet.authorize({ chain, identity: APP_IDENTITY, auth_token: cached ?? undefined });
      } catch (e) {
        if (!cached) throw e;
        await SecureStore.deleteItemAsync(MWA_TOKEN);
        auth = await wallet.authorize({ chain, identity: APP_IDENTITY });
      }
      await SecureStore.setItemAsync(MWA_TOKEN, auth.auth_token);
      // MWA returns the address base64-encoded.
      const pk = new PublicKey(Buffer.from(auth.accounts[0].address, 'base64'));
      await SecureStore.setItemAsync(MWA_ADDR, pk.toBase58());
      return pk;
    },
    [chain],
  );

  const connectMwa = useCallback(async () => {
    if (!mwaAvailable) throw new Error('Mobile Wallet Adapter is Android-only');
    const { transact } = await mwa();
    const pk = await transact(authorize);
    await AsyncStorage.setItem(KIND, 'mwa');
    setPublicKey(pk);
    setKind('mwa');
  }, [authorize, mwaAvailable]);

  const useDevWallet = useCallback(async () => {
    const kp = await loadDevKeypair(true);
    await AsyncStorage.setItem(KIND, 'dev');
    setDev(kp);
    setPublicKey(kp!.publicKey);
    setKind('dev');
  }, []);

  const disconnect = useCallback(async () => {
    await AsyncStorage.removeItem(KIND);
    if (kind === 'mwa') {
      const token = await SecureStore.getItemAsync(MWA_TOKEN);
      await SecureStore.deleteItemAsync(MWA_TOKEN);
      await SecureStore.deleteItemAsync(MWA_ADDR);
      if (token && mwaAvailable) {
        try {
          const { transact } = await mwa();
          await transact((w: any) => w.deauthorize({ auth_token: token }));
        } catch {
          /* wallet gone — nothing to revoke */
        }
      }
    }
    setKind(null);
    setPublicKey(null);
  }, [kind, mwaAvailable]);

  const setCluster = useCallback(async (c: ClusterId) => {
    await AsyncStorage.setItem(CLUSTER, c);
    setClusterState(c);
  }, []);

  const send = useCallback(
    async (ixs: TransactionInstruction[]) => {
      if (!publicKey || !kind) throw new Error('Connect a wallet first');
      const all = [ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }), ...ixs];
      const { context, value: bh } = await connection.getLatestBlockhashAndContext('confirmed');
      const build = (payer: PublicKey) =>
        new VersionedTransaction(
          new TransactionMessage({ payerKey: payer, recentBlockhash: bh.blockhash, instructions: all }).compileToV0Message(),
        );
      let sig: string;
      if (kind === 'dev') {
        const tx = build(dev!.publicKey);
        tx.sign([dev!]);
        sig = await connection.sendTransaction(tx, { maxRetries: 3 });
      } else {
        const { transact } = await mwa();
        sig = await transact(async (wallet: any) => {
          const pk = await authorize(wallet);
          const [s] = await wallet.signAndSendTransactions({
            transactions: [build(pk)],
            minContextSlot: context.slot,
          });
          return s;
        });
        // Some wallets return the signature as base64 bytes.
        if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) {
          const bs58 = (await import('bs58')).default;
          sig = bs58.encode(Buffer.from(sig, 'base64'));
        }
      }
      const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
      return sig;
    },
    [authorize, connection, dev, kind, publicKey],
  );

  const airdrop = useCallback(async () => {
    if (!publicKey) throw new Error('Connect a wallet first');
    const sig = await connection.requestAirdrop(publicKey, (cluster === 'localnet' ? 5 : 1) * LAMPORTS_PER_SOL);
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    return sig;
  }, [cluster, connection, publicKey]);

  const value: WalletState = {
    ready,
    kind,
    publicKey,
    cluster,
    connection,
    mwaAvailable,
    connectMwa,
    useDevWallet,
    disconnect,
    setCluster,
    send,
    airdrop,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const NO_WALLET =
  'No Solana wallet app found. Install one that supports Mobile Wallet Adapter (Seed Vault, Phantom, Solflare), or use the dev wallet.';

/** Turn a program/RPC error into one sentence a person can act on. */
export function humanError(e: unknown): string {
  const s = String((e as any)?.message ?? e);
  const known: [RegExp, string][] = [
    [/AlreadyClockedIn|0x1771/, 'Already clocked in today — come back tomorrow.'],
    [/PriceAboveMax|0x1774/, 'The provider raised its price. Pull to refresh and try again.'],
    [/ProviderInactive|0x1773/, 'That provider just went offline. Pick another.'],
    [/BeforeDeadline|0x1777/, 'The provider still has time to answer.'],
    [/insufficient funds|0x1\b|custom program error: 0x1$/, 'Not enough tSKR — clock in to earn some.'],
    [/Attempt to debit an account but found no record|no record of a prior credit/, 'This wallet has no SOL for fees. Tap "Get devnet SOL".'],
    [/429|airdrop/i, 'The devnet faucet is rate-limited. Try again later or use faucet.solana.com.'],
    [/CancellationException|declined|rejected/i, 'Cancelled in the wallet.'],
    [/WalletNotInstalled|ERROR_WALLET_NOT_FOUND|Found no installed wallet|ActivityNotFoundException|no wallet/i, NO_WALLET],
    [/Network request failed|fetch failed/, 'Can\'t reach the RPC. Check your connection.'],
  ];
  for (const [re, msg] of known) if (re.test(s)) return msg;
  return s.length > 160 ? s.slice(0, 160) + '…' : s;
}
