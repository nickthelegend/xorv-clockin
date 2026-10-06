/**
 * Network — what the broker's /api/network used to show, read straight from
 * the program: every provider's bond, record and liveness.
 */
import React from 'react';
import { View } from 'react-native';
import { fmtSkr, isLive, reputation, short } from '../chain';
import { SKR_LABEL } from '../config';
import { useData } from '../data';
import { C, Card, Dot, Label, Pill, Row, Stat, T } from '../ui';

export default function Network() {
  const { providers, config, now } = useData();
  const t = now();
  const live = providers.filter((p) => isLive(p, t));
  const bonded = providers.reduce((a, p) => a + p.bond, 0n);
  const earned = providers.reduce((a, p) => a + p.earned, 0n);
  return (
    <View style={{ gap: 14 }}>
      <T size={28} weight="800">
        The network
      </T>
      <Card>
        <Row style={{ gap: 12, alignItems: 'flex-start' }}>
          <Stat label="Live" value={`${live.length}/${providers.length}`} sub="nodes" />
          <Stat label="Jobs" value={`${config?.jobs ?? 0}`} sub="all time" />
          <Stat label="Bonded" value={fmtSkr(bonded, 0)} sub={SKR_LABEL} />
        </Row>
        <Row style={{ gap: 12, marginTop: 16, alignItems: 'flex-start' }}>
          <Stat label="Paid out" value={fmtSkr(earned, 0)} sub={`${SKR_LABEL} to providers`} />
          <Stat label="Min bond" value={fmtSkr(config?.minBond ?? 0n, 0)} sub={SKR_LABEL} />
          <Stat label="Slash" value={`${(config?.slashBps ?? 0) / 100}%`} sub="of bond, to buyer" />
        </Row>
      </Card>

      <Label>Providers · ranked like the matcher ranks them</Label>
      {providers.map((p, i) => {
        const on = isLive(p, t);
        const rep = reputation(p);
        return (
          <Card key={p.address.toBase58()}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ gap: 10, flex: 1 }}>
                <T c={C.fg3} weight="700" m>
                  {String(i + 1).padStart(2, '0')}
                </T>
                <Dot color={on ? C.live : C.fg4} />
                <T weight="700" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {p.name}
                </T>
              </Row>
              <Pill>{p.model || 'agent'}</Pill>
            </Row>
            <View style={{ height: 6, backgroundColor: C.surface3, borderRadius: 3, marginTop: 14, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(rep * 100)}%`, height: 6, backgroundColor: on ? C.fg : C.fg3 }} />
            </View>
            <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <T size={12} c={C.fg2}>
                {Math.round(rep * 100)}% · {p.completed} done · {p.failed} failed
              </T>
              <T size={12} c={C.fg2}>
                {fmtSkr(p.price)} {SKR_LABEL}/job
              </T>
            </Row>
            <T size={11} c={C.fg3} style={{ marginTop: 6 }} m>
              bond {fmtSkr(p.bond)} · earned {fmtSkr(p.earned)} · {on ? `beat ${Math.max(0, t - p.lastSeen)}s ago` : 'offline'} · {short(p.authority)}
            </T>
          </Card>
        );
      })}
      {providers.length === 0 && (
        <Card>
          <T c={C.fg2}>No providers yet on this cluster.</T>
        </Card>
      )}
      <T size={12} c={C.fg3} style={{ lineHeight: 18 }}>
        Reputation can't be claimed, only earned: the program bumps a provider's record in the same instruction that
        releases its payment. A node that goes silent loses {(config?.slashBps ?? 0) / 100}% of its {SKR_LABEL} bond to the
        buyer it stood up.
      </T>
    </View>
  );
}
