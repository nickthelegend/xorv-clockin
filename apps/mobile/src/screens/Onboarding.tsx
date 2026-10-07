/**
 * First-run explainer: the whole product in four swipes. Shown once (and
 * re-openable from the connect screen). The sequence matters, so it is
 * numbered: clock in → ask → pay on delivery → refund + slash.
 */
import * as Haptics from 'expo-haptics';
import React, { useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { SKR_LABEL } from '../config';
import { Button, C, T } from '../ui';

const stroke = { stroke: C.fg, strokeWidth: 3, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function Art({ i }: { i: number }) {
  return (
    <Svg width={132} height={132} viewBox="0 0 132 132">
      {i === 0 && (
        <>
          {Array.from({ length: 7 }).map((_, k) => {
            const a0 = (k / 7) * Math.PI * 2 - Math.PI / 2 + 0.09;
            const a1 = ((k + 1) / 7) * Math.PI * 2 - Math.PI / 2 - 0.09;
            const p = (a: number) => `${66 + 56 * Math.cos(a)} ${66 + 56 * Math.sin(a)}`;
            return <Path key={k} d={`M ${p(a0)} A 56 56 0 0 1 ${p(a1)}`} stroke={k < 3 ? C.fg : C.surface3} strokeWidth={8} strokeLinecap="round" fill="none" />;
          })}
          <Circle cx={66} cy={66} r={38} fill={C.fg} />
        </>
      )}
      {i === 1 && (
        <>
          <Path d="M22 28h88a8 8 0 0 1 8 8v44a8 8 0 0 1-8 8H58l-22 18V88H22a8 8 0 0 1-8-8V36a8 8 0 0 1 8-8z" {...stroke} />
          <Path d="M36 50h60M36 66h40" {...stroke} stroke={C.fg2} />
        </>
      )}
      {i === 2 && (
        <>
          <Rect x={26} y={56} width={80} height={56} rx={10} {...stroke} />
          <Path d="M44 56V42a22 22 0 0 1 44 0v14" {...stroke} />
          <Path d="M52 84l10 10 18-20" {...stroke} stroke={C.live} />
        </>
      )}
      {i === 3 && (
        <>
          <G transform="translate(18 18) scale(4)">
            <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" {...stroke} strokeWidth={0.75} />
            <Path d="M3 3v5h5" {...stroke} strokeWidth={0.75} />
          </G>
          <Circle cx={66} cy={66} r={10} fill={C.warn} />
        </>
      )}
    </Svg>
  );
}

const PAGES = [
  {
    title: 'Clock in every day',
    body: `One tap, one on-chain check-in, and ${SKR_LABEL} lands in your wallet. Keep the streak going and the reward multiplies, up to ×7 on day seven.`,
  },
  {
    title: 'Ask for anything',
    body: 'Type a task. A coding agent on someone else\'s machine (Claude Code, or whatever they run) picks it up and answers.',
  },
  {
    title: 'Pay on delivery',
    body: 'Your payment sits in an escrow on Solana. It is released only when the answer is written on-chain, and your phone checks the answer\'s hash.',
  },
  {
    title: 'No answer? Get paid back',
    body: 'If nobody answers before the deadline, you get your money back, plus 20% of the provider\'s bond. Providers stake real skin in the game.',
  },
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);
  const last = page === PAGES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) {
      setPage(p);
      Haptics.selectionAsync();
    }
  };
  const next = () => {
    if (last) return onDone();
    ref.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 22 }}>
        {!last && (
          <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Skip introduction" hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
            <T size={16} weight="600" c={C.fg2}>
              Skip
            </T>
          </Pressable>
        )}
      </View>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {PAGES.map((p, i) => (
          <View key={p.title} style={{ width, paddingHorizontal: 28, justifyContent: 'center' }} accessible accessibilityLabel={`Step ${i + 1} of 4. ${p.title}. ${p.body}`}>
            <Art i={i} />
            <T size={15} weight="700" c={C.fg3} style={{ marginTop: 36 }}>
              {i + 1} of 4
            </T>
            <T size={36} weight="800" style={{ marginTop: 8, lineHeight: 40 }}>
              {p.title}
            </T>
            <T size={17} c={C.fg2} style={{ marginTop: 14, lineHeight: 26 }}>
              {p.body}
            </T>
          </View>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 22, paddingBottom: 12, gap: 18 }}>
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
          {PAGES.map((_, i) => (
            <View key={i} style={{ height: 6, width: i === page ? 22 : 6, borderRadius: 3, backgroundColor: i === page ? C.fg : C.fg4 }} />
          ))}
        </View>
        <Button title={last ? 'Get started' : 'Next'} onPress={next} />
      </View>
    </View>
  );
}
