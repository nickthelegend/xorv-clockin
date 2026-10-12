/** Offline: jobs are derived from the on-chain counter; providers survive a rate-limited scan. No RPC. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, type Connection } from '@solana/web3.js';
import { fetchJobs, fetchProviders, nextJobNonce, pda } from '../src/chain.ts';

test('jobs are read with one getMultipleAccounts over PDAs 0..jobsPosted-1, no scan', async () => {
  const buyer = Keypair.generate().publicKey;
  let asked: string[] = [];
  const c = {
    getMultipleAccountsInfo: async (keys: { toBase58(): string }[]) => { asked = keys.map((k) => k.toBase58()); return keys.map(() => null); },
    getProgramAccounts: async () => assert.fail('no getProgramAccounts for jobs'),
  } as unknown as Connection;
  assert.deepEqual(await fetchJobs(c, buyer, 3), []);
  assert.deepEqual(asked, [0n, 1n, 2n].map((n) => pda.job(buyer, n).toBase58()));
  assert.deepEqual(await fetchJobs(c, buyer, 0), []);
});

test('the next nonce is the on-chain jobs_posted counter (0 for a new buyer)', async () => {
  const c = { getAccountInfo: async () => null } as unknown as Connection;
  assert.equal(await nextJobNonce(c, Keypair.generate().publicKey), 0n);
});

test('a rate-limited provider scan with nothing cached is an error, not an empty network', async () => {
  const c = {
    getProgramAccounts: async () => { throw new Error('429 Too Many Requests'); },
    getMultipleAccountsInfo: async () => [],
  } as unknown as Connection;
  await assert.rejects(fetchProviders(c), /429/);
});
