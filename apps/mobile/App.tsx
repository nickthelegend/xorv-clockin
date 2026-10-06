import { PublicKey } from '@solana/web3.js';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { fmtSkr, short } from './src/chain';
import { CLUSTERS, ClusterId, SKR_LONG_LABEL } from './src/config';
import { DataProvider, useData } from './src/data';
import Ask from './src/screens/Ask';
import Connect from './src/screens/Connect';
import { JobDetail, JobsList } from './src/screens/Jobs';
import Network from './src/screens/Network';
import Today from './src/screens/Today';
import { Button, C, Card, Divider, Dot, Label, Mark, Row, T } from './src/ui';
import { humanError, useWallet, WalletProvider } from './src/wallet';

type Tab = 'today' | 'ask' | 'jobs' | 'network';
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

function WalletSheet({ open, onClose, onToast }: { open: boolean; onClose: () => void; onToast: (m: string, k?: 'ok' | 'err') => void }) {
  const { publicKey, kind, cluster, setCluster, disconnect, airdrop } = useWallet();
  const { skr, sol, refresh } = useData();
  const [busy, setBusy] = useState(false);
  if (!publicKey) return null;
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} />
      <View style={{ backgroundColor: C.surface2, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40, borderColor: C.line2, borderWidth: 1 }}>
        <View style={{ width: 40, height: 4, backgroundColor: C.fg4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 }} />
        <Label>{kind === 'mwa' ? 'Mobile Wallet Adapter' : 'Dev wallet · devnet only · key stays on this device'}</Label>
        <T size={14} m style={{ marginTop: 8 }} selectable>
          {publicKey.toBase58()}
        </T>
        <Row style={{ gap: 18, marginTop: 14 }}>
          <T weight="700">{sol.toFixed(4)} SOL</T>
          <T weight="700">{fmtSkr(skr)} tSKR</T>
        </Row>
        <T size={11} c={C.fg3} style={{ marginTop: 4 }}>
          {SKR_LONG_LABEL}
        </T>
        <Row style={{ gap: 10, marginTop: 16 }}>
          <Button
            title="Copy address"
            kind="ghost"
            style={{ flex: 1, height: 44 }}
            onPress={async () => {
              await Clipboard.setStringAsync(publicKey.toBase58());
              onToast('Address copied', 'ok');
            }}
          />
          <Button
            title={`Get ${cluster} SOL`}
            kind="ghost"
            busy={busy}
            style={{ flex: 1, height: 44 }}
            onPress={async () => {
              setBusy(true);
              try {
                await airdrop();
                onToast('SOL received', 'ok');
                refresh();
              } catch (e) {
                onToast(humanError(e), 'err');
              } finally {
                setBusy(false);
              }
            }}
          />
        </Row>
        <Divider />
        <Label>Cluster</Label>
        <Row style={{ gap: 10, marginTop: 10 }}>
          {(Object.keys(CLUSTERS) as ClusterId[]).map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                Haptics.selectionAsync();
                setCluster(c);
              }}
              style={{ flex: 1, borderWidth: 1, borderColor: c === cluster ? C.fg : C.line2, borderRadius: 12, padding: 12 }}
            >
              <T size={13} weight="600" c={c === cluster ? C.fg : C.fg2}>
                {CLUSTERS[c].label}
              </T>
            </Pressable>
          ))}
        </Row>
        <Button
          title="Disconnect"
          kind="danger"
          style={{ marginTop: 18, height: 46 }}
          onPress={async () => {
            onClose();
            await disconnect();
          }}
        />
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

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const go = (t: Tab) => {
    Haptics.selectionAsync();
    setJob(null);
    setTab(t);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {!publicKey ? (
          <View style={{ flex: 1, paddingHorizontal: 22, paddingBottom: insets.bottom + 8 }}>
            <Connect onToast={onToast} />
          </View>
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 }}>
              <Row style={{ gap: 10 }}>
                <Mark size={26} />
                <T size={20} weight="800" style={{ letterSpacing: -0.5 }}>
                  xorv
                </T>
              </Row>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setSheet(true);
                }}
                accessibilityLabel="Wallet"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}
              >
                <Dot color={error ? C.fail : C.live} size={7} />
                <T size={12} weight="600" m>
                  {short(publicKey)}
                </T>
                <T size={10} c={C.fg3} weight="700">
                  {kind === 'dev' ? 'DEV' : 'MWA'} · {cluster === 'devnet' ? 'DEVNET' : 'LOCAL'}
                </T>
              </Pressable>
            </Row>
            <ScrollView
              ref={scroll}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
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
                <Card style={{ borderColor: C.fail, marginBottom: 14 }}>
                  <T weight="600" c={C.fail}>
                    {CLUSTERS[cluster].label}: {error.includes('not initialised') ? 'program not deployed here yet' : 'unreachable'}
                  </T>
                  <T size={12} c={C.fg2} style={{ marginTop: 4 }}>
                    {error}
                  </T>
                </Card>
              )}
              {job ? (
                <JobDetail job={job} onBack={() => setJob(null)} onToast={onToast} />
              ) : tab === 'today' ? (
                <Today onAsk={() => go('ask')} onToast={onToast} />
              ) : tab === 'ask' ? (
                <Ask
                  onToast={onToast}
                  onPosted={(j) => {
                    setTab('jobs');
                    setJob(j);
                  }}
                />
              ) : tab === 'jobs' ? (
                <JobsList onOpen={setJob} />
              ) : (
                <Network />
              )}
            </ScrollView>
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
                  <Pressable key={t} onPress={() => go(t)} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityRole="tab" accessibilityLabel={t}>
                    <TabIcon tab={t} color={on ? C.fg : C.fg3} />
                    <T size={11} weight="600" c={on ? C.fg : C.fg3} style={{ textTransform: 'capitalize' }}>
                      {t}
                    </T>
                  </Pressable>
                );
              })}
            </View>
            <WalletSheet open={sheet} onClose={() => setSheet(false)} onToast={onToast} />
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
