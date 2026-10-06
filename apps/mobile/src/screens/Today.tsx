/**
 * Today — the daily loop. One big dial: seven segments for the week, the
 * streak in the middle, and a single action. Clocking in is an on-chain
 * instruction that pays tSKR × the streak multiplier (capped at ×7).
 */
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { checkInIx, fmtSkr, isLive } from '../chain';
import { CLUSTERS, SKR_LABEL, SKR_LONG_LABEL } from '../config';
import { useData } from '../data';
import { scheduleStreakReminder } from '../notify';
import { Button, C, Card, Label, Pill, Row, Stat, T } from '../ui';
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

export default function Today({ onAsk, onToast }: { onAsk: () => void; onToast: (m: string, kind?: 'ok' | 'err') => void }) {
  const { send, publicKey, airdrop, cluster } = useWallet();
  const { config, user, skr, sol, providers, now, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const t = now();
  const dayLen = config?.dayLength ?? 86400;
  const day = Math.floor(t / dayLen);
  const doneToday = !!user && user.checkins > 0 && user.lastDay === day;
  const alive = !!user && user.checkins > 0 && user.lastDay >= day - 1;
  const streak = alive ? user!.streak : 0;
  const nextStreak = doneToday ? streak + 1 : alive ? streak + 1 : 1;
  const mult = Math.min(nextStreak, 7);
  const reward = (config?.dailyReward ?? 0n) * BigInt(mult);
  const untilNext = (day + 1) * dayLen - t;
  const filled = doneToday ? Math.min(streak, 7) : Math.min(streak, 7);
  const live = providers.filter((p) => isLive(p, t)).length;
  const lowSol = sol < 0.003;

  useEffect(() => {
    if (doneToday) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [doneToday, pulse]);

  async function clockIn() {
    if (!publicKey || doneToday) return;
    setBusy(true);
    try {
      const sig = await send([checkInIx(publicKey)]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onToast(`Clocked in · +${fmtSkr(reward)} ${SKR_LABEL}`, 'ok');
      await refresh();
      const nextAt = new Date(((day + 1) * dayLen - (t - Math.floor(Date.now() / 1000))) * 1000);
      scheduleStreakReminder(nextAt, nextStreak, `${fmtSkr((config?.dailyReward ?? 0n) * BigInt(Math.min(nextStreak + 1, 7)))} ${SKR_LABEL}`);
      void sig;
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      onToast(humanError(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function getSol() {
    try {
      await airdrop();
      onToast(`${cluster === 'devnet' ? 'Devnet' : 'Local'} SOL received`, 'ok');
      refresh();
    } catch (e) {
      onToast(humanError(e), 'err');
    }
  }

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={{ gap: 14 }}>
      {lowSol && (
        <Card style={{ borderColor: C.warn }}>
          <T weight="600">This wallet needs a little SOL for fees</T>
          <T size={13} c={C.fg2} style={{ marginTop: 4 }}>
            Every action is a real {cluster} transaction (~0.000005 SOL). Clock-in creates your streak account once (~0.002 SOL rent).
          </T>
          <Button title={`Get ${cluster} SOL`} kind="ghost" onPress={getSol} style={{ marginTop: 12, height: 44 }} />
        </Card>
      )}

      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Pressable
          onPress={clockIn}
          disabled={busy || doneToday}
          accessibilityRole="button"
          accessibilityLabel={doneToday ? 'Clocked in today' : 'Clock in'}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
        >
          <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
            {!doneToday && (
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
                <T size={13} weight="600" c={C.live} style={{ letterSpacing: 1.2 }}>
                  CLOCKED IN
                </T>
                <T size={56} weight="800" style={{ marginTop: -2 }}>
                  {streak}
                </T>
                <T size={13} c={C.fg2}>
                  day streak
                </T>
              </View>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <T size={13} weight="700" c={C.bg} style={{ letterSpacing: 1.2 }}>
                  {busy ? 'SIGNING…' : 'TAP TO'}
                </T>
                <T size={34} weight="800" c={C.bg} style={{ letterSpacing: -1 }}>
                  Clock in
                </T>
                <T size={13} weight="600" c={C.bg} style={{ opacity: 0.6, marginTop: 2 }}>
                  +{fmtSkr(reward)} {SKR_LABEL} · ×{mult}
                </T>
              </View>
            )}
          </View>
        </Pressable>

        <T size={13} c={C.fg3} style={{ marginTop: 6 }}>
          {doneToday
            ? `Next clock-in opens in ${hms(untilNext)} · ×${Math.min(streak + 1, 7)} tomorrow`
            : streak > 0
              ? `Day ${streak + 1} — keep the streak alive (${hms(untilNext)} left)`
              : 'Seven days in a row earns ×7. Miss a day and it resets.'}
        </T>
      </View>

      <Card>
        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          <Stat label={SKR_LABEL} value={fmtSkr(skr)} sub="devnet stand-in for SKR" />
          <Stat label="Best" value={`${user?.bestStreak ?? 0}d`} sub={`${user?.checkins ?? 0} clock-ins`} />
          <Stat label="SOL" value={sol.toFixed(3)} sub={CLUSTERS[cluster].label} />
        </Row>
      </Card>

      <Card onPress={onAsk}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Spend it on an AI job</Label>
          <Pill color={live ? C.live : C.fg3} border={live ? 'rgba(74,222,128,0.35)' : C.line2}>
            {`${live} node${live === 1 ? '' : 's'} live`}
          </Pill>
        </Row>
        <T size={20} weight="700" style={{ marginTop: 10 }}>
          Ask someone else's Claude Code
        </T>
        <T size={14} c={C.fg2} style={{ marginTop: 6, lineHeight: 20 }}>
          Your {SKR_LABEL} sits in an on-chain escrow until the answer lands. If no one answers in time,
          you get it back plus a slice of the provider's bond.
        </T>
        <T size={14} weight="600" style={{ marginTop: 12 }}>
          Ask now →
        </T>
      </Card>

      <T size={11} c={C.fg4} style={{ textAlign: 'center', marginTop: 4 }}>
        {SKR_LONG_LABEL}. Mainnet SKR: SKRbvo6G…ZhW3
      </T>
    </View>
  );
}
