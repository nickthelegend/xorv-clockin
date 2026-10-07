/**
 * Network — what the broker's /api/network used to show, read straight from
 * the program: every provider's bond, record and liveness.
 */
import React from 'react';
import { View } from 'react-native';
import { fmtSkr, isLive, reputation, short } from '../chain';
import { SKR_LABEL } from '../config';
import { useData } from '../data';
import { Badge, C, Card, Notice, Row, Skeleton, T } from '../ui';

function Big({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: '45%' }} accessible accessibilityLabel={`${label}: ${value}`}>
      <T size={30} weight="800">
        {value}
      </T>
      <T size={14} c={C.fg2} style={{ marginTop: 2 }}>
        {label}
      </T>
    </View>
  );
}

export default function Network() {
  const { providers, config, now, loading, error } = useData();
  const t = now();
  const live = providers.filter((p) => isLive(p, t));
  const bonded = providers.reduce((a, p) => a + p.bond, 0n);
  const earned = providers.reduce((a, p) => a + p.earned, 0n);
  const slash = (config?.slashBps ?? 0) / 100;

  return (
    <View style={{ gap: 16 }}>
      <T size={30} weight="800">
        The network
      </T>

      {loading && !config ? (
        <Skeleton h={180} r={18} />
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 20, columnGap: 16 }}>
            <Big value={`${live.length} of ${providers.length}`} label="nodes live" />
            <Big value={`${config?.jobs ?? 0}`} label="jobs, all time" />
            <Big value={fmtSkr(bonded, 0)} label={`${SKR_LABEL} bonded`} />
            <Big value={fmtSkr(earned, 0)} label={`${SKR_LABEL} paid to providers`} />
          </View>
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 16 }} />
          <T size={14} c={C.fg2} style={{ lineHeight: 20 }}>
            To list a node you bond at least {fmtSkr(config?.minBond ?? 0n, 0)} {SKR_LABEL}. A node that goes silent past a job's
            deadline loses {slash}% of its bond to that buyer.
          </T>
        </Card>
      )}

      <T size={20} weight="800" style={{ marginTop: 4 }}>
        Providers
      </T>
      {providers.length === 0 && !loading && (
        <Notice
          title={error ? 'Can\'t reach the network' : 'No providers yet'}
          body={
            error
              ? 'The RPC didn\'t answer. Pull down to retry.'
              : 'Nobody has registered a node on this cluster yet. Anyone with Claude Code or a local model can run one.'
          }
          tone={error ? 'fail' : 'neutral'}
        />
      )}
      {providers.map((p) => {
        const on = isLive(p, t);
        const rep = reputation(p);
        const beat = Math.max(0, t - p.lastSeen);
        return (
          <Card key={p.address.toBase58()}>
            <Row style={{ justifyContent: 'space-between', gap: 10 }}>
              <T size={18} weight="800" numberOfLines={1} style={{ flex: 1 }}>
                {p.name}
              </T>
              <Badge tone={on ? 'live' : 'neutral'}>{on ? 'Live' : 'Offline'}</Badge>
            </Row>
            <T size={14} c={C.fg2} style={{ marginTop: 4 }}>
              {p.model || 'agent'} · {fmtSkr(p.price)} {SKR_LABEL} per job
            </T>

            <Row style={{ justifyContent: 'space-between', marginTop: 16 }}>
              <T size={14} c={C.fg2}>
                Reputation
              </T>
              <T size={14} weight="700">
                {Math.round(rep * 100)}%
              </T>
            </Row>
            <View
              style={{ height: 8, backgroundColor: C.surface3, borderRadius: 4, marginTop: 8, overflow: 'hidden' }}
              accessibilityLabel={`Reputation ${Math.round(rep * 100)} percent`}
            >
              <View style={{ width: `${Math.round(rep * 100)}%`, height: 8, borderRadius: 4, backgroundColor: on ? C.fg : C.fg3 }} />
            </View>

            <Row style={{ marginTop: 16, gap: 12 }}>
              {[
                [String(p.completed), 'done'],
                [String(p.failed), 'failed'],
                [fmtSkr(p.bond), 'bonded'],
                [fmtSkr(p.earned), 'earned'],
              ].map(([v, l]) => (
                <View key={l} style={{ flex: 1 }}>
                  <T size={17} weight="700">
                    {v}
                  </T>
                  <T size={13} c={C.fg3}>
                    {l}
                  </T>
                </View>
              ))}
            </Row>
            <T size={13} c={C.fg3} style={{ marginTop: 12 }}>
              {on ? `Heartbeat ${beat}s ago` : `Last seen ${beat < 3600 ? `${Math.floor(beat / 60)}m` : `${Math.floor(beat / 3600)}h`} ago`} · {short(p.authority)}
            </T>
          </Card>
        );
      })}

      <T size={13} c={C.fg3} style={{ lineHeight: 19 }}>
        Ranked the way your phone picks a provider: live first, then reputation, then bond, then price. Reputation is
        written by the program in the same instruction that pays the provider, so it can't be claimed, only earned.
      </T>
    </View>
  );
}
