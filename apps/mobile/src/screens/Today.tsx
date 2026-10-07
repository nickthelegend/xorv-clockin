/**
 * Today — the daily loop. One big dial: seven segments for the week, the
 * streak in the middle, and a single action. Clocking in is an on-chain
 * instruction that pays tSKR × the streak multiplier (capped at ×7).
 */
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { checkInIx, fmtSkr, isLive } from '../chain';
import { CLUSTERS, SKR_LABEL, SKR_LONG_LABEL } from '../config';
import { useData } from '../data';
import { scheduleStreakReminders } from '../notify';
import { Badge, Button, C, Card, CountUp, Label, Notice, Row, Skeleton, T } from '../ui';
import { humanError, useWallet } from '../wallet';

const SIZE = 260;
const R = 112;
const SEG = 7;

function arc(i: number) {
  const gap = 0.07;
  const a0 = (i / SEG) * Math.PI * 2 - Math.PI / 2 + gap;
  const a1 = ((i + 1) / SEG) * Math.PI * 2 - Math.PI / 2 - gap;
  const p = (a: number) => `${SIZE / 2 + R * Math.cos(a)} ${SIZE / 2 + R * Math.sin(a)}`;
  return `M ${p(a0)} A ${R} ${R} 0 0 1 ${p(a1)}`;
}

function hms(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

const skrNum = (v: bigint) => Number(v) / 1e6;
const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function Today({ onAsk, onToast }: { onAsk: () => void; onToast: (m: string, kind?: 'ok' | 'err') => void }) {
  const { send, publicKey, airdrop, cluster } = useWallet();
  const { config, user, skr, sol, providers, now, refresh, loading, error } = useData();
  const [busy, setBusy] = useState(false);
  const [solBusy, setSolBusy] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [, tick] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    return () => clearInterval(t);
  }, []);

  const t = now();
  const dayLen = config?.dayLength ?? 86400;
  const day = Math.floor(t / dayLen);
  const doneToday = !!user && user.checkins > 0 && user.lastDay === day;
  const alive = !!user && user.checkins > 0 && user.lastDay >= day - 1;
  const streak = alive ? user!.streak : 0;
  const nextStreak = streak + 1;
  const reward = (config?.dailyReward ?? 0n) * BigInt(Math.min(nextStreak, 7));
  const untilNext = (day + 1) * dayLen - t;
  const filled = Math.min(streak, 7);
  const live = providers.filter((p) => isLive(p, t)).length;
  const lowSol = !loading && sol < 0.003;
  const skew = t - Math.floor(Date.now() / 1000);

  // While a streak is alive and today is still open, keep tonight's
  // "streak at risk" nudge armed. Clocking in re-arms both reminders.
  useEffect(() => {
    if (!config || !user || doneToday || streak === 0) return;
    scheduleStreakReminders({ day, dayLength: dayLen, skew, streak, clockedInToday: false, nextReward: `${fmtSkr(reward)} ${SKR_LABEL}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, user?.lastDay, doneToday, streak, day]);

  useEffect(() => {
    if (doneToday || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [doneToday, pulse, reduceMotion]);

  async function clockIn() {
    if (!publicKey || doneToday || busy) return;
    if (lowSol) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onToast(`Add a little ${cluster} SOL first — it pays the network fee.`, 'err');
      return;
    }
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await send([checkInIx(publicKey)]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToast(`Clocked in · +${fmtSkr(reward)} ${SKR_LABEL}`, 'ok');
      await refresh();
      scheduleStreakReminders({
        day,
        dayLength: dayLen,
        skew,
        streak: nextStreak,
        clockedInToday: true,
        nextReward: `${fmtSkr((config?.dailyReward ?? 0n) * BigInt(Math.min(nextStreak + 1, 7)))} ${SKR_LABEL}`,
      });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      onToast(humanError(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function getSol() {
    setSolBusy(true);
    try {
      await airdrop();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToast(`${cluster === 'devnet' ? 'Devnet' : 'Local'} SOL received`, 'ok');
      refresh();
    } catch (e) {
      onToast(humanError(e), 'err');
    } finally {
      setSolBusy(false);
    }
  }

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  if (loading && !config) {
    return (
      <View style={{ gap: 16, alignItems: 'center', paddingTop: 8 }} accessibilityLabel="Loading">
        <Skeleton h={SIZE} w={SIZE} r={SIZE / 2} />
        <Skeleton h={92} r={18} />
        <Skeleton h={110} r={18} />
      </View>
    );
  }

  // Offline before the first read: don't draw a dial that can't be acted on.
  if (!config) {
    return (
      <View style={{ paddingVertical: 24, gap: 8 }}>
        <T size={20} weight="800">
          {error?.includes('not initialised') ? 'Nothing here yet' : 'Your streak is safe'}
        </T>
        <T size={15} c={C.fg2} style={{ lineHeight: 22 }}>
          {error?.includes('not initialised')
            ? 'Clock-ins, balances and jobs appear once Xorv is live on this cluster.'
            : 'Your streak, balance and jobs live on-chain, not on this phone. They show up here as soon as the network answers again.'}
        </T>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {lowSol && !error && (
        <Notice
          tone="warn"
          title="Add a little SOL for fees"
          body={`Every action here is a real ${cluster} transaction (~0.000005 SOL). Your first clock-in also opens your streak account (~0.002 SOL, once).`}
          action={{ title: solBusy ? 'Requesting…' : `Get ${cluster} SOL`, onPress: getSol }}
        />
      )}

      <View style={{ alignItems: 'center', paddingTop: 4 }}>
        <Pressable
          onPress={clockIn}
          disabled={busy || doneToday}
          accessibilityRole="button"
          accessibilityLabel={doneToday ? `Clocked in. ${streak} day streak.` : `Clock in for ${fmtSkr(reward)} ${SKR_LABEL}`}
          accessibilityState={{ disabled: busy || doneToday, busy }}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
        >
          <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
            {!doneToday && !reduceMotion && (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  borderWidth: 2,
                  borderColor: C.fg,
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                }}
              />
            )}
            <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
              {Array.from({ length: SEG }).map((_, i) => (
                <Path
                  key={i}
                  d={arc(i)}
                  stroke={i < filled ? (doneToday ? C.live : C.fg) : C.surface3}
                  strokeWidth={10}
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={92} fill={doneToday ? C.surface : C.fg} />
            </Svg>
            {doneToday ? (
              <View style={{ alignItems: 'center' }}>
                <T size={13} weight="700" c={C.live} style={{ letterSpacing: 1.2 }} maxFontSizeMultiplier={1.3}>
                  CLOCKED IN
                </T>
                <CountUp value={streak} size={60} weight="800" maxFontSizeMultiplier={1.2} style={{ marginTop: -2 }} />
                <T size={14} c={C.fg2} maxFontSizeMultiplier={1.3}>
                  day streak
                </T>
              </View>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <T size={13} weight="700" c={C.bg} style={{ letterSpacing: 1.2 }} maxFontSizeMultiplier={1.3}>
                  {busy ? 'SIGNING…' : streak > 0 ? `DAY ${nextStreak}` : 'DAY 1'}
                </T>
                <T size={34} weight="800" c={C.bg} style={{ letterSpacing: -1 }} maxFontSizeMultiplier={1.2}>
                  Clock in
                </T>
                <T size={14} weight="600" c={C.bg} style={{ opacity: 0.65, marginTop: 2 }} maxFontSizeMultiplier={1.3}>
                  +{fmtSkr(reward)} {SKR_LABEL} · ×{Math.min(nextStreak, 7)}
                </T>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {/* The week, spelled out: what each day of the streak pays. */}
      <Card style={{ paddingVertical: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          {Array.from({ length: 7 }).map((_, i) => {
            const n = i + 1;
            const earned = n <= filled;
            const isNext = !doneToday && n === Math.min(nextStreak, 7);
            return (
              <View
                key={i}
                style={{ alignItems: 'center', gap: 6, flex: 1 }}
                accessible
                accessibilityLabel={`Day ${n} pays times ${n}${earned ? ', earned' : isNext ? ', next' : ''}`}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: earned ? (doneToday ? C.live : C.fg) : 'transparent',
                    borderWidth: earned ? 0 : 1.5,
                    borderColor: isNext ? C.fg : C.line2,
                  }}
                >
                  <T size={13} weight="700" c={earned ? C.bg : isNext ? C.fg : C.fg3} maxFontSizeMultiplier={1.1}>
                    {n}
                  </T>
                </View>
                <T size={12} c={isNext ? C.fg : C.fg3} weight={isNext ? '700' : '500'} maxFontSizeMultiplier={1.1}>
                  ×{n}
                </T>
              </View>
            );
          })}
        </Row>
        <T size={14} c={C.fg2} style={{ marginTop: 14, textAlign: 'center', lineHeight: 20 }}>
          {doneToday
            ? `Done for today. Day ${nextStreak} opens in ${hms(untilNext)} and pays ×${Math.min(nextStreak, 7)}.`
            : streak > 0
              ? `Clock in within ${hms(untilNext)} to keep your ${streak}-day streak.`
              : 'Seven days in a row earns ×7. Miss a day and it starts over.'}
        </T>
      </Card>

      <Card>
        <Row style={{ alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1.15 }}>
            <Label>{SKR_LABEL}</Label>
            <CountUp value={skrNum(skr)} format={fmtNum} size={28} weight="800" style={{ marginTop: 6 }} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.25} />
            <T size={12} c={C.fg3} style={{ marginTop: 2 }} maxFontSizeMultiplier={1.3}>
              stand-in for SKR
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <Label>Best</Label>
            <T size={28} weight="800" style={{ marginTop: 6 }} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.25}>
              {user?.bestStreak ?? 0}d
            </T>
            <T size={12} c={C.fg3} style={{ marginTop: 2 }}>
              {user?.checkins ?? 0} clock-in{(user?.checkins ?? 0) === 1 ? '' : 's'}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <Label>SOL</Label>
            <T size={28} weight="800" style={{ marginTop: 6 }} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.25}>
              {sol.toFixed(sol >= 10 ? 1 : 3)}
            </T>
            <T size={12} c={C.fg3} style={{ marginTop: 2 }} numberOfLines={1}>
              {cluster === 'devnet' ? 'devnet' : 'local'}
            </T>
          </View>
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <T size={20} weight="800" style={{ flex: 1 }}>
            Spend it on an AI job
          </T>
          <Badge tone={live ? 'live' : 'neutral'}>{live ? `${live} node${live === 1 ? '' : 's'} live` : 'no node live'}</Badge>
        </Row>
        <T size={15} c={C.fg2} style={{ marginTop: 8, lineHeight: 22 }}>
          Someone's coding agent answers. Your {SKR_LABEL} waits in an on-chain escrow until the answer lands. No
          answer in time and you get it back, plus a slice of their bond.
        </T>
        <Button title="Ask the network" onPress={onAsk} style={{ marginTop: 16 }} />
      </Card>

      <T size={12} c={C.fg3} style={{ textAlign: 'center', lineHeight: 18 }}>
        {SKR_LONG_LABEL} · {CLUSTERS[cluster].label}
      </T>
    </View>
  );
}
