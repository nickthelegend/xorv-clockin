/**
 * Xorv's design language, carried over from apps/app/globals.css: black,
 * white and the greys between. Colour is reserved for meaning — live, failed,
 * pending — and the brand gradient lives only in the mark.
 */
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export const C = {
  bg: '#000000',
  surface: '#0a0a0a',
  surface2: '#121212',
  surface3: '#191919',
  fg: '#fafafa',
  fg2: '#a1a1a1',
  fg3: '#6e6e6e',
  fg4: '#4a4a4a',
  line: 'rgba(255,255,255,0.09)',
  line2: 'rgba(255,255,255,0.16)',
  line3: 'rgba(255,255,255,0.28)',
  live: '#4ade80',
  fail: '#f87171',
  warn: '#fbbf24',
  // brand — the mark only
  violet: '#7C5CFF',
  cyan: '#3DDCFF',
  mint: '#50F0C8',
};

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="b1" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#7C5CFF" />
          <Stop offset="0.5" stopColor="#4C9BFF" />
          <Stop offset="1" stopColor="#3DDCFF" />
        </LinearGradient>
        <LinearGradient id="b2" x1="56" y1="8" x2="8" y2="56" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#3DDCFF" />
          <Stop offset="0.55" stopColor="#5BC8FF" />
          <Stop offset="1" stopColor="#7C5CFF" />
        </LinearGradient>
        <LinearGradient id="core" x1="26" y1="26" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#9F8BFF" />
          <Stop offset="1" stopColor="#50F0C8" />
        </LinearGradient>
      </Defs>
      <G strokeLinecap="round" fill="none">
        <Path d="M14 14 L27 27" stroke="url(#b1)" strokeWidth={7} />
        <Path d="M37 37 L50 50" stroke="url(#b1)" strokeWidth={7} />
        <Path d="M50 14 L37 27" stroke="url(#b2)" strokeWidth={7} />
        <Path d="M27 37 L14 50" stroke="url(#b2)" strokeWidth={7} />
      </G>
      <Rect x={27.6} y={27.6} width={8.8} height={8.8} rx={2.2} transform="rotate(45 32 32)" fill="url(#core)" />
      <Circle cx={14} cy={14} r={3.1} fill="#7C5CFF" />
      <Circle cx={50} cy={50} r={3.1} fill="#3DDCFF" />
      <Circle cx={50} cy={14} r={3.1} fill="#3DDCFF" />
      <Circle cx={14} cy={50} r={3.1} fill="#7C5CFF" />
    </Svg>
  );
}

type TProps = TextProps & { c?: string; size?: number; weight?: '400' | '500' | '600' | '700' | '800'; m?: boolean };
export function T({ c = C.fg, size = 15, weight = '400', m, style, maxFontSizeMultiplier = 1.6, ...rest }: TProps) {
  // Dynamic Type is honoured up to 1.6× by default so the dense layouts stay
  // intact at accessibility sizes; individual call sites can tighten it.
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
      style={[
        { color: c, fontSize: size, fontWeight: weight, letterSpacing: size >= 28 ? -0.8 : size >= 20 ? -0.3 : 0 },
        m && { fontFamily: mono, letterSpacing: 0 },
        style,
      ]}
    />
  );
}

export const Label = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <T size={12} weight="600" c={C.fg3} maxFontSizeMultiplier={1.3} style={[{ letterSpacing: 1.1 }, style]}>
    {typeof children === 'string' ? children.toUpperCase() : children}
  </T>
);

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void }) {
  const body = <View style={[s.card, style as any]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      {body}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  busy,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || busy}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        s.btn,
        primary ? s.btnPrimary : s.btnGhost,
        kind === 'danger' && { borderColor: C.fail },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.85 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? C.bg : C.fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <T weight="600" size={16} c={primary ? C.bg : kind === 'danger' ? C.fail : C.fg}>
            {title}
          </T>
        </View>
      )}
    </Pressable>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export function Pill({ children, color = C.fg2, border = C.line2 }: { children: React.ReactNode; color?: string; border?: string }) {
  return (
    <View style={[s.pill, { borderColor: border }]}>
      {typeof children === 'string' ? (
        <T size={12} weight="600" c={color} style={{ letterSpacing: 0.4 }}>
          {children}
        </T>
      ) : (
        children
      )}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line2, marginVertical: 14 }} />;
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Label>{label}</Label>
      <T size={22} weight="700" style={{ marginTop: 6 }}>
        {value}
      </T>
      {sub ? (
        <T size={12} c={C.fg3} style={{ marginTop: 2 }}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

export const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  btn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnPrimary: { backgroundColor: C.fg },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line3 },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
});

// ---------------------------------------------------------------------------
// Polish layer: status badges, count-ups, chain rows, skeletons, notices.
// ---------------------------------------------------------------------------

/** One badge vocabulary for every job state, so the colour always means the same thing. */
export type Tone = 'live' | 'neutral' | 'warn' | 'fail';
const TONE: Record<Tone, { fg: string; border: string; bg: string }> = {
  live: { fg: C.live, border: 'rgba(74,222,128,0.4)', bg: 'rgba(74,222,128,0.08)' },
  neutral: { fg: C.fg, border: C.line3, bg: 'rgba(255,255,255,0.04)' },
  warn: { fg: C.warn, border: 'rgba(251,191,36,0.45)', bg: 'rgba(251,191,36,0.08)' },
  fail: { fg: C.fail, border: 'rgba(248,113,113,0.45)', bg: 'rgba(248,113,113,0.08)' },
};
export function Badge({ tone, children, dot = true }: { tone: Tone; children: string; dot?: boolean }) {
  const t = TONE[tone];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={children}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      {dot && <Dot color={t.fg} size={6} />}
      <T size={12} weight="600" c={t.fg}>
        {children}
      </T>
    </View>
  );
}

/**
 * Counts from the previous value to the new one with a strong ease-out, so a
 * reward lands as a number moving rather than a number swapping. First render
 * shows the value as-is (no count-up from zero on every app open).
 */
export function CountUp({
  value,
  format = (n: number) => String(Math.round(n)),
  duration = 700,
  ...rest
}: { value: number; format?: (n: number) => string; duration?: number } & Omit<TProps, 'children'>) {
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);
  React.useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 4); // ease-out-quart
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, duration]);
  return <T {...rest}>{format(shown)}</T>;
}

/** A labelled on-chain reference: short id, copy, and an explorer link. */
export function ChainRow({
  label,
  value,
  short,
  onCopy,
  onOpen,
}: {
  label: string;
  value: string;
  short: string;
  onCopy: (v: string) => void;
  onOpen?: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10 }}>
      <View style={{ flex: 1 }}>
        <T size={13} c={C.fg3}>
          {label}
        </T>
        <T size={14} m c={C.fg} style={{ marginTop: 2 }} numberOfLines={1}>
          {short}
        </T>
      </View>
      <IconButton label={`Copy ${label}`} onPress={() => onCopy(value)} icon="copy" />
      {onOpen && <IconButton label={`Open ${label} in explorer`} onPress={onOpen} icon="open" />}
    </View>
  );
}

export function IconButton({ icon, label, onPress }: { icon: 'copy' | 'open' | 'close' | 'back'; label: string; onPress: () => void }) {
  const p = { stroke: C.fg2, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? C.surface3 : C.surface2,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        {icon === 'copy' && (
          <>
            <Rect x={8} y={8} width={12} height={12} rx={2.5} {...p} />
            <Path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" {...p} />
          </>
        )}
        {icon === 'open' && <Path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" {...p} />}
        {icon === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
        {icon === 'back' && <Path d="M15 5l-7 7 7 7" {...p} />}
      </Svg>
    </Pressable>
  );
}

/** Placeholder block while the first chain read is in flight. */
export function Skeleton({ h = 16, w = '100%', r = 8, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: ViewStyle }) {
  const o = React.useRef(new Animated.Value(0.35)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ height: h, width: w, borderRadius: r, backgroundColor: C.surface3, opacity: o }, style]} />;
}

/** Empty / error / offline notice with an optional action. */
export function Notice({
  title,
  body,
  tone = 'neutral',
  action,
}: {
  title: string;
  body: string;
  tone?: Tone;
  action?: { title: string; onPress: () => void };
}) {
  const border = tone === 'neutral' ? C.line2 : TONE[tone].border;
  return (
    <View style={[s.card, { borderColor: border, gap: 6 }]}>
      <T size={16} weight="700" c={tone === 'neutral' ? C.fg : TONE[tone].fg}>
        {title}
      </T>
      <T size={14} c={C.fg2} style={{ lineHeight: 20 }}>
        {body}
      </T>
      {action && <Button title={action.title} kind="ghost" onPress={action.onPress} style={{ marginTop: 8, height: 46 }} />}
    </View>
  );
}

/** One rendering of provider liveness everywhere it appears (Ask, Network). */
export function LivenessBadge({ state, age, active = true }: { state: 'live' | 'idle' | 'offline'; age: string; active?: boolean }) {
  if (state === 'live') return <Badge tone="live">{`Live · ${age} ago`}</Badge>;
  if (state === 'idle') return <Badge tone="warn">{`Idle · last seen ${age} ago`}</Badge>;
  return <Badge tone="neutral">{active ? `Offline · last seen ${age} ago` : 'Offline · paused by operator'}</Badge>;
}
