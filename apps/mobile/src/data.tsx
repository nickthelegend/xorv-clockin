/**
 * One polling loop for everything the screens read from chain. Five seconds
 * while the app is in the foreground, paused in the background.
 */
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  Config,
  fetchConfig,
  fetchJobs,
  fetchProviders,
  fetchSkr,
  fetchUser,
  Job,
  Provider,
  rankProviders,
  STATUS,
  UserStats,
} from './chain';
import { notifyNow } from './notify';
import { useWallet } from './wallet';

interface Data {
  loading: boolean;
  error: string | null;
  config: Config | null;
  providers: Provider[];
  jobs: Job[];
  user: UserStats | null;
  skr: bigint;
  sol: number;
  /** Chain clock, approximately: local time corrected by the last block time we saw. */
  now: () => number;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Data | null>(null);
export const useData = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside DataProvider');
  return v;
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { connection, publicKey } = useWallet();
  const [state, setState] = useState<Omit<Data, 'refresh' | 'now'>>({
    loading: true,
    error: null,
    config: null,
    providers: [],
    jobs: [],
    user: null,
    skr: 0n,
    sol: 0,
  });
  const skew = useRef(0);
  const seen = useRef<Map<string, number>>(new Map());
  const now = useCallback(() => Math.floor(Date.now() / 1000) + skew.current, []);

  const refresh = useCallback(async () => {
    try {
      const [config, providers, slot] = await Promise.all([
        fetchConfig(connection),
        fetchProviders(connection),
        connection.getSlot('confirmed'),
      ]);
      const bt = await connection.getBlockTime(slot).catch(() => null);
      if (bt) skew.current = bt - Math.floor(Date.now() / 1000);
      let jobs: Job[] = [];
      let user: UserStats | null = null;
      let skr = 0n;
      let sol = 0;
      if (publicKey) {
        [jobs, user, skr, sol] = await Promise.all([
          fetchJobs(connection, publicKey),
          fetchUser(connection, publicKey),
          fetchSkr(connection, publicKey),
          connection.getBalance(publicKey).then((l) => l / LAMPORTS_PER_SOL),
        ]);
        // A job that changed state since the last poll is worth a notification.
        for (const j of jobs) {
          const id = j.address.toBase58();
          const prev = seen.current.get(id);
          if (prev === STATUS.FUNDED && j.status === STATUS.DELIVERED) {
            notifyNow('Your answer is in', `Delivered and verified on-chain: "${j.prompt.slice(0, 60)}"`);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          seen.current.set(id, j.status);
        }
      }
      setState({
        loading: false,
        error: config ? null : 'Program not initialised on this cluster yet.',
        config,
        providers: rankProviders(providers, now()),
        jobs,
        user,
        skr,
        sol,
      });
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: String(e?.message ?? e) }));
    }
  }, [connection, publicKey, now]);

  useEffect(() => {
    seen.current = new Map();
    refresh();
    let timer: ReturnType<typeof setInterval> | null = setInterval(refresh, 5000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        refresh();
        if (!timer) timer = setInterval(refresh, 5000);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  return <Ctx.Provider value={{ ...state, refresh, now }}>{children}</Ctx.Provider>;
}
