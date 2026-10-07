import { PublicKey } from '@solana/web3.js';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { fmtSkr, short } from './src/chain';
import { CLUSTERS, ClusterId } from './src/config';
import { DataProvider, useData } from './src/data';
import Ask from './src/screens/Ask';
import Connect from './src/screens/Connect';
import { JobDetail, JobsList } from './src/screens/Jobs';
import Network from './src/screens/Network';
import Onboarding from './src/screens/Onboarding';
import Today from './src/screens/Today';
import { Button, C, Divider, Dot, IconButton, Label, Mark, Notice, Row, T } from './src/ui';
import { humanError, useWallet, WalletProvider } from './src/wallet';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDED = 'xorv.onboarded.v1';

type Tab = 'today' | 'ask' | 'jobs' | 'network';
const TAB_LABEL: Record<Tab, string> = { today: 'Today', ask: 'Ask', jobs: 'Jobs', network: 'Network' };
type Toast = { msg: string; kind: 'ok' | 'err' } | null;

function TabIcon({ tab, color }: { tab: Tab; color: string }) {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {tab === 'today' && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M12 7v5l3 2" {...p} />
        </>
      )}
      {tab === 'ask' && <Path d="M4 5h16v11H9l-5 4z" {...p} />}
      {tab === 'jobs' && (
        <>
          <Rect x={4} y={4} width={16} height={16} rx={3} {...p} />
          <Path d="M8 9h8M8 13h8M8 17h5" {...p} />
        </>
      )}
      {tab === 'network' && (
        <>
          <Circle cx={6} cy={6} r={2} {...p} />
          <Circle cx={18} cy={6} r={2} {...p} />
          <Circle cx={6} cy={18} r={2} {...p} />
          <Circle cx={18} cy={18} r={2} {...p} />
          <Path d="M8 8l8 8M16 8l-8 8" {...p} />
        </>
      )}
    </Svg>
  );
}

function WalletSheet({
  open,
  onClose,
  onToast,
  onReplayIntro,
}: {
  open: boolean;
  onClose: () => void;
  onToast: (m: string, k?: 'ok' | 'err') => void;
  onReplayIntro: () => void;
}) {
  const { publicKey, kind, cluster, setCluster, disconnect, airdrop } = useWallet();
  const { skr, sol, refresh, error } = useData();
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  if (!publicKey) return null;
  const addr = publicKey.toBase58();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} accessibilityLabel="Close wallet" />
      <View
        style={{
          backgroundColor: C.surface2,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 22,
          paddingBottom: Math.max(insets.bottom, 16) + 20,
          borderColor: C.line2,
          borderWidth: 1,
          gap: 16,
        }}
      >
        <View style={{ width: 40, height: 4, backgroundColor: C.fg4, borderRadius: 2, alignSelf: 'center' }} />
        <View>
          <T size={22} weight="800">
            {kind === 'mwa' ? 'Your wallet' : 'Dev wallet'}
          </T>
          <T size={14} c={C.fg2} style={{ marginTop: 4, lineHeight: 20 }}>
            {kind === 'mwa'
              ? 'Connected through Mobile Wallet Adapter. Every transaction is approved in your wallet.'
              : 'A devnet-only key generated on this device. It never leaves it.'}
          </T>
        </View>

        <Row style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, gap: 8 }}>
          <T size={15} m style={{ flex: 1 }} numberOfLines={1} ellipsizeMode="middle" selectable>
            {addr}
          </T>
          <IconButton
            icon="copy"
            label="Copy address"
            onPress={async () => {
              await Clipboard.setStringAsync(addr);
              onToast('Address copied', 'ok');
            }}
          />
        </Row>

        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <T size={24} weight="800">
              {error ? '—' : sol.toFixed(3)}
            </T>
            <T size={13} c={C.fg3}>
              SOL · {cluster}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T size={24} weight="800">
              {error ? '—' : fmtSkr(skr)}
            </T>
            <T size={13} c={C.fg3}>
              tSKR · SKR stand-in
            </T>
          </View>
        </Row>

        <Button
          title={busy ? 'Requesting…' : 'Get SOL from the faucet'}
          kind="ghost"
          busy={busy}
          style={{ height: 48 }}
          onPress={async () => {
            setBusy(true);
            try {
              await airdrop();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onToast('SOL received', 'ok');
              refresh();
            } catch (e) {
              onToast(humanError(e), 'err');
            } finally {
              setBusy(false);
            }
          }}
        />

        <Divider />
        <Label>Network</Label>
        <Row style={{ gap: 10, marginTop: -6 }}>
          {(Object.keys(CLUSTERS) as ClusterId[]).map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ selected: c === cluster }}
              accessibilityLabel={CLUSTERS[c].label}
              onPress={() => {
                Haptics.selectionAsync();
                setCluster(c);
              }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 48,
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: c === cluster ? C.fg : C.line2,
                backgroundColor: pressed ? C.surface3 : 'transparent',
                borderRadius: 12,
                paddingHorizontal: 12,
              })}
            >
              <T size={14} weight="600" c={c === cluster ? C.fg : C.fg2}>
                {CLUSTERS[c].label}
              </T>
            </Pressable>
          ))}
        </Row>

        <Row style={{ gap: 10 }}>
          <Button
            title="How it works"
            kind="ghost"
            style={{ flex: 1, height: 48 }}
            onPress={() => {
              onClose();
              onReplayIntro();
            }}
          />
          <Button
            title="Disconnect"
            kind="danger"
            style={{ flex: 1, height: 48 }}
            onPress={async () => {
              onClose();
              await disconnect();
            }}
          />
        </Row>
      </View>
    </Modal>
  );
}

function Shell() {
  const { ready, publicKey, kind, cluster } = useWallet();
  const { refresh, error, loading } = useData();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('today');
  const [job, setJob] = useState<PublicKey | null>(null);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [pulling, setPulling] = useState(false);
  const [explainer, setExplainer] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED)
      .then((v) => setExplainer(v !== '1'))
      .catch(() => setExplainer(false));
  }, []);
  const finishExplainer = () => {
    AsyncStorage.setItem(ONBOARDED, '1').catch(() => {});
    setExplainer(false);
  };
  const fade = useRef(new Animated.Value(0)).current;
  const scroll = useRef<ScrollView>(null);

  const onToast = useCallback(
    (msg: string, kind: 'ok' | 'err' = 'ok') => {
      setToast({ msg, kind });
      fade.stopAnimation();
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(({ finished }) => finished && setToast(null));
    },
    [fade],
  );

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [tab, job]);

  // Android hardware/gesture back: close the job detail, then return to Today, then exit.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (job) {
        setJob(null);
        return true;
      }
      if (tab !== 'today') {
        setTab('today');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [job, tab]);

  if (!ready || explainer === null) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const go = (t: Tab) => {
    Haptics.selectionAsync();
    setJob(null);
    setTab(t);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {explainer ? (
          <View style={{ flex: 1, paddingBottom: insets.bottom + 8 }}>
            <Onboarding onDone={finishExplainer} />
          </View>
        ) : !publicKey ? (
          <View style={{ flex: 1, paddingHorizontal: 22, paddingBottom: insets.bottom + 8 }}>
            <Connect onToast={onToast} onExplain={() => setExplainer(true)} />
          </View>
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8, gap: 12 }}>
              <Row style={{ gap: 10 }}>
                <Mark size={28} />
                <T size={22} weight="800" maxFontSizeMultiplier={1.2} style={{ paddingRight: 2 }}>
                  xorv
                </T>
              </Row>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setSheet(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Wallet ${short(publicKey)}, ${kind === 'dev' ? 'dev wallet' : 'mobile wallet'}, ${CLUSTERS[cluster].label}${error ? ', offline' : ''}`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 44,
                  borderWidth: 1,
                  borderColor: C.line2,
                  backgroundColor: pressed ? C.surface2 : C.surface,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                })}
              >
                <Dot color={error ? C.fail : C.live} size={8} />
                <View style={{ flexShrink: 1 }}>
                  <T size={14} weight="600" m maxFontSizeMultiplier={1.2} numberOfLines={1}>
                    {short(publicKey)}
                  </T>
                  <T size={12} c={C.fg3} weight="600" maxFontSizeMultiplier={1.2} numberOfLines={1}>
                    {kind === 'dev' ? 'Dev wallet' : 'Wallet'} · {cluster === 'devnet' ? 'devnet' : 'local'}
                  </T>
                </View>
              </Pressable>
            </Row>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
              ref={scroll}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 130 }}
              refreshControl={
                <RefreshControl
                  tintColor={C.fg2}
                  refreshing={pulling}
                  onRefresh={async () => {
                    setPulling(true);
                    await refresh();
                    setPulling(false);
                  }}
                />
              }
            >
              {error && !loading && (
                <View style={{ marginBottom: 16 }}>
                  <Notice
                    tone="fail"
                    title={error.includes('not initialised') ? `Xorv isn't deployed on ${cluster} yet` : `Can't reach ${CLUSTERS[cluster].label}`}
                    body={
                      error.includes('not initialised')
                        ? 'The program has not been initialised on this cluster. Switch cluster from the wallet menu, or try again later.'
                        : 'You look offline, or the RPC is down. Your funds are safe on-chain; nothing is lost while you wait.'
                    }
                    action={{ title: 'Try again', onPress: () => refresh() }}
                  />
                </View>
              )}
              {job ? (
                <JobDetail job={job} onBack={() => setJob(null)} onToast={onToast} />
              ) : tab === 'today' ? (
                <Today onAsk={() => go('ask')} onToast={onToast} />
              ) : tab === 'ask' ? (
                <Ask
                  onToast={onToast}
                  onClockIn={() => go('today')}
                  onPosted={(j) => {
                    setTab('jobs');
                    setJob(j);
                  }}
                />
              ) : tab === 'jobs' ? (
                <JobsList onOpen={setJob} onAsk={() => go('ask')} />
              ) : (
                <Network />
              )}
            </ScrollView>
            </KeyboardAvoidingView>
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                paddingBottom: Math.max(insets.bottom, 12),
                paddingTop: 10,
                backgroundColor: C.surface,
                borderTopWidth: 1,
                borderTopColor: C.line,
                flexDirection: 'row',
              }}
            >
              {(['today', 'ask', 'jobs', 'network'] as Tab[]).map((t) => {
                const on = tab === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => go(t)}
                    style={{ flex: 1, alignItems: 'center', gap: 4, minHeight: 48, justifyContent: 'center' }}
                    accessibilityRole="tab"
                    accessibilityLabel={TAB_LABEL[t]}
                    accessibilityState={{ selected: on }}
                  >
                    <TabIcon tab={t} color={on ? C.fg : C.fg3} />
                    <T size={12} weight="600" c={on ? C.fg : C.fg3} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                      {TAB_LABEL[t]}
                    </T>
                  </Pressable>
                );
              })}
            </View>
            <WalletSheet open={sheet} onClose={() => setSheet(false)} onToast={onToast} onReplayIntro={() => setExplainer(true)} />
          </>
        )}
        {toast && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: insets.top + 8,
              left: 20,
              right: 20,
              opacity: fade,
              transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
            }}
          >
            <View style={{ backgroundColor: toast.kind === 'ok' ? C.fg : '#2a0f0f', borderColor: toast.kind === 'ok' ? C.fg : C.fail, borderWidth: 1, borderRadius: 14, padding: 14 }}>
              <T weight="600" c={toast.kind === 'ok' ? C.bg : C.fail}>
                {toast.msg}
              </T>
            </View>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <WalletProvider>
        <DataProvider>
          <Shell />
        </DataProvider>
      </WalletProvider>
    </SafeAreaProvider>
  );
}
