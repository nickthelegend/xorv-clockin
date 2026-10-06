/**
 * Xorv's design language, carried over from apps/app/globals.css: black,
 * white and the greys between. Colour is reserved for meaning — live, failed,
 * pending — and the brand gradient lives only in the mark.
 */
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
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
export function T({ c = C.fg, size = 15, weight = '400', m, style, ...rest }: TProps) {
  return (
    <Text
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
  <T size={11} weight="600" c={C.fg3} style={[{ letterSpacing: 1.4, textTransform: 'uppercase' }, style]}>
    {children}
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
        <T size={11} weight="600" c={color} style={{ letterSpacing: 0.6 }}>
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
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
});
