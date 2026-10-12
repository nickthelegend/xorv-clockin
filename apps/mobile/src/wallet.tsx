import { createReceiptJournal } from './pendingReceipt';
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
import { buildSignInInput, createSignInMessageText, fromB64, proofOf, recheckProof, signInLocally, utf8, verifySignIn, type SiwsProof } from './siws';
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
  /** A verified Sign In With Solana proof for the connected account, or null. */
  signIn: SiwsProof | null;
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
const SIWS = 'xorv.siws.v1';

function devSignIn(kp: Keypair): SiwsProof | null {
  const input = buildSignInInput();
  const out = signInLocally(input, kp.secretKey);
  const v = verifySignIn(input, out);
  return v.ok ? proofOf('dev-local', 'Dev wallet', input, v, out.signature) : null;
}
const CLUSTER = 'xorv.cluster';
const PENDING = 'xorv.pending.receipt.v1';
const receiptJournal = createReceiptJournal({
  get: () => SecureStore.getItemAsync(PENDING),
  set: (value) => SecureStore.setItemAsync(PENDING, value),
  clear: () => SecureStore.deleteItemAsync(PENDING),
});

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
  const [signIn, setSignInState] = useState<SiwsProof | null>(null);
  const setSignIn = useCallback(async (p: SiwsProof | null) => {
    setSignInState(p);
    if (p) await SecureStore.setItemAsync(SIWS, JSON.stringify(p));
    else await SecureStore.deleteItemAsync(SIWS);
  }, []);
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
        // Re-verify the stored Sign In With Solana proof; a dev key can simply sign again.
        const raw = await SecureStore.getItemAsync(SIWS);
        const stored: SiwsProof | null = raw ? JSON.parse(raw) : null;
        const who = k === 'dev' ? (await loadDevKeypair(false))?.publicKey.toBase58() : await SecureStore.getItemAsync(MWA_ADDR);
        if (stored && who && stored.address === who && recheckProof(stored)) setSignInState(stored);
        else if (k === 'dev') {
          const kp = await loadDevKeypair(false);
          if (kp) {
            const p = devSignIn(kp);
            setSignInState(p);
            if (p) await SecureStore.setItemAsync(SIWS, JSON.stringify(p));
          }
        }
      } catch {
        setSignInState(null);
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
        if (!cached || /declin|reject|cancel/i.test(String((e as any)?.message ?? e))) throw e;
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

  /**
   * One wallet sheet: authorize + Sign In With Solana (sign_in_payload). Seed
   * Vault, Phantom and Solflare return sign_in_result, verified here (ed25519
   * signature + our domain, nonce, chain, fresh time). A wallet that ignores the
   * payload is asked to signMessages the same text; if declined, the account is
   * connected without a proof and the wallet sheet says so.
   */
  const connectMwa = useCallback(async () => {
    if (!mwaAvailable) throw new Error('Mobile Wallet Adapter is Android-only');
    const { transact } = await mwa();
    const input = buildSignInInput();
    const { pk, proof } = await transact(async (wallet: any) => {
      const auth = await wallet.authorize({ chain, identity: APP_IDENTITY, sign_in_payload: input });
      await SecureStore.setItemAsync(MWA_TOKEN, auth.auth_token);
      const first = auth.accounts[0];
      const signer = (first.label as string | undefined)?.trim() || 'your wallet';
      const pk = new PublicKey(Buffer.from(first.address, 'base64'));
      await SecureStore.setItemAsync(MWA_ADDR, pk.toBase58());
      const sir = auth.sign_in_result;
      if (sir) {
        const address = new PublicKey(fromB64(sir.address)).toBase58();
        const signature = fromB64(sir.signature);
        const v = verifySignIn(input, { address, signedMessage: fromB64(sir.signed_message), signature });
        if (!v.ok) throw new Error(`The wallet's sign-in did not verify (${v.reason}).`);
        return { pk, proof: proofOf('siws', signer, input, v, signature) };
      }
      try {
        const msg = utf8(createSignInMessageText({ ...input, address: pk.toBase58() }));
        const [signed] = await wallet.signMessages({ addresses: [first.address], payloads: [msg] });
        for (const signature of [signed.slice(-64), signed.slice(0, 64)]) {
          const v = verifySignIn(input, { address: pk.toBase58(), signedMessage: msg, signature });
          if (v.ok) return { pk, proof: proofOf('signMessage', signer, input, v, signature) };
        }
      } catch { /* declined: connected without a sign-in proof */ }
      return { pk, proof: null as SiwsProof | null };
    });
    await AsyncStorage.setItem(KIND, 'mwa');
    await setSignIn(proof);
    setPublicKey(pk);
    setKind('mwa');
  }, [chain, mwaAvailable, setSignIn]);

  const useDevWallet = useCallback(async () => {
    const kp = await loadDevKeypair(true);
    await AsyncStorage.setItem(KIND, 'dev');
    await setSignIn(devSignIn(kp!));
    setDev(kp);
    setPublicKey(kp!.publicKey);
    setKind('dev');
  }, [setSignIn]);

  const disconnect = useCallback(async () => {
    await AsyncStorage.removeItem(KIND);
    await setSignIn(null);
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
      return receiptJournal.run(connection.rpcEndpoint, publicKey.toBase58(), async (signature) => {
        const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
        return value[0];
      }, async (saveReceipt, submission) => {
      try {
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
        const bs58 = (await import('bs58')).default;
        await saveReceipt(bs58.encode(tx.signatures[0]));
        submission.beginBroadcast();
        sig = await connection.sendTransaction(tx, { maxRetries: 3 });
      } else {
        const { transact } = await mwa();
        sig = await transact(async (wallet: any) => {
          const pk = await authorize(wallet);
          if (!pk.equals(publicKey)) throw new Error('The wallet switched accounts. Reconnect before signing.');
          submission.beginBroadcast();
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
      await saveReceipt(sig);
      const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
      return sig;
      } catch (error) { await submission.abortBeforeBroadcast(); throw error; }
      });
    },
    [authorize, connection, dev, kind, publicKey],
  );

  const airdrop = useCallback(async () => {
    if (!publicKey) throw new Error('Connect a wallet first');
    const sig = await connection.requestAirdrop(publicKey, (cluster === 'localnet' ? 5 : 1) * LAMPORTS_PER_SOL);
    // A faucet transaction's expiry cannot be inferred from a newer blockhash.
    const result = await connection.confirmTransaction(sig, 'confirmed');
    if (result.value.err) throw new Error('The faucet transaction failed. Try again later or use faucet.solana.com.');
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
    signIn,
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
