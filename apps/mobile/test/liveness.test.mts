/**
 * Liveness thresholds and matcher ordering (apps/mobile/src/chain.ts).
 *   npm test   (runs with tsx + node:test, no simulator needed)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import {
  ageLabel,
  autoPick,
  HEARTBEAT_INTERVAL,
  IDLE_MAX,
  isLive,
  LIVE_MAX,
  liveness,
  rankProviders,
  type Provider,
} from '../src/chain.ts';

const NOW = 1_800_000_000;

function prov(o: Partial<Provider> & { name: string }): Provider {
  const k = Keypair.generate().publicKey;
  return {
    address: k,
    authority: k,
    price: 2_000_000n,
    bond: 10_000_000n,
    completed: 0,
    failed: 0,
    earned: 0n,
    openJobs: 0,
    active: true,
    lastSeen: NOW,
    registeredAt: NOW - 1000,
    model: 'echo',
    ...o,
  };
}

test('thresholds derive from the heartbeat interval', () => {
  assert.equal(LIVE_MAX, 2 * HEARTBEAT_INTERVAL);
  assert.ok(IDLE_MAX > LIVE_MAX);
});

test('live → idle → offline by heartbeat age', () => {
  const at = (age: number) => liveness(prov({ name: 'n', lastSeen: NOW - age }), NOW);
  assert.equal(at(0), 'live');
  assert.equal(at(HEARTBEAT_INTERVAL), 'live'); // one beat late
  assert.equal(at(LIVE_MAX - 1), 'live');
  assert.equal(at(LIVE_MAX), 'idle'); // two missed beats
  assert.equal(at(173), 'idle'); // the bug report: 173 s old must NOT read "Live"
  assert.equal(at(IDLE_MAX - 1), 'idle');
  assert.equal(at(IDLE_MAX), 'offline');
  assert.equal(at(86_400), 'offline');
});

test('a deactivated node is offline whatever its heartbeat', () => {
  assert.equal(liveness(prov({ name: 'n', active: false, lastSeen: NOW }), NOW), 'offline');
  assert.equal(isLive(prov({ name: 'n', active: false }), NOW), false);
});

test('clock skew (heartbeat slightly in the future) still reads live', () => {
  assert.equal(liveness(prov({ name: 'n', lastSeen: NOW + 3 }), NOW), 'live');
});

test('matcher: every live node outranks every idle node, idle outranks offline', () => {
  const stars = prov({ name: 'idle-star', lastSeen: NOW - 120, completed: 500, bond: 999_000_000n });
  const fresh = prov({ name: 'live-newbie', lastSeen: NOW - 5, completed: 0, failed: 3 });
  const gone = prov({ name: 'offline-best', lastSeen: NOW - 3600, completed: 9999 });
  const ranked = rankProviders([gone, stars, fresh], NOW).map((p) => p.name);
  assert.deepEqual(ranked, ['live-newbie', 'idle-star', 'offline-best']);
});

test('matcher: within a liveness tier → reputation, then bond, then price', () => {
  const a = prov({ name: 'rep', completed: 9, failed: 0 });
  const b = prov({ name: 'bond', completed: 1, failed: 0, bond: 50_000_000n });
  const c = prov({ name: 'cheap', completed: 1, failed: 0, price: 1_000_000n });
  const d = prov({ name: 'pricey', completed: 1, failed: 0, price: 5_000_000n });
  assert.deepEqual(rankProviders([d, c, b, a], NOW).map((p) => p.name), ['rep', 'bond', 'cheap', 'pricey']);
});

test('autoPick only ever returns a live node', () => {
  const idle = prov({ name: 'idle', lastSeen: NOW - 100, completed: 50 });
  const offline = prov({ name: 'off', lastSeen: NOW - 1000 });
  assert.equal(autoPick([idle, offline], NOW), undefined);
  const live = prov({ name: 'live', lastSeen: NOW - 1 });
  assert.equal(autoPick([idle, offline, live], NOW)?.name, 'live');
});

test('age labels', () => {
  assert.equal(ageLabel(9), '9s');
  assert.equal(ageLabel(125), '2m 05s');
  assert.equal(ageLabel(7300), '2h 01m');
});
