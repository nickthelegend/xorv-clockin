/** Offline canonical SPL account encoding checks; no RPC or acceptance execution. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, SystemProgram, type Connection } from '@solana/web3.js';
import { fetchSkr, pda, TOKEN_PROGRAM_ID } from '../src/chain.ts';
const owner = PublicKey.default;
const connection = (read: () => Promise<unknown>) => ({ getAccountInfo: read }) as unknown as Connection;
test('absent token account reads as zero', async () => assert.equal(await fetchSkr(connection(async () => null), owner), 0n));
test('RPC outage is an error rather than a zero balance', async () => {
  const failure = new Error('503');
  await assert.rejects(fetchSkr(connection(async () => { throw failure; }), owner), e => e === failure);
});
test('another program account is not a token balance', async () => {
  await assert.rejects(fetchSkr(connection(async () => ({ owner: SystemProgram.programId, data: Buffer.alloc(165) })), owner), /Invalid SKR/);
});
test('canonical initialized or frozen account preserves encoded amount and checks mint', async () => {
  const data = Buffer.alloc(165);pda.mint().toBuffer().copy(data, 0);owner.toBuffer().copy(data, 32);data.writeBigUInt64LE(321n,64);data[108]=1;
  const c=connection(async () => ({owner:TOKEN_PROGRAM_ID,data}));assert.equal(await fetchSkr(c,owner),321n);
  data[108]=2;assert.equal(await fetchSkr(c,owner),321n);
  owner.toBuffer().copy(data,0);await assert.rejects(fetchSkr(c,owner), /mint or owner mismatch/);
});
