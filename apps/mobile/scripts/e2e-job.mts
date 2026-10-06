/**
 * End to end through the app's own client: a fresh buyer clocks in, posts a
 * job to the best live provider, waits for the answer, checks the hash.
 *   RPC_URL=… npx tsx scripts/e2e-job.mts "your prompt"
 * BUYER_KEYPAIR=path uses an existing funded keypair (needed on devnet).
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import fs from 'node:fs';
import { checkInIx, fetchJob, fetchProviders, fetchSkr, hex, postJobIx, rankProviders, STATUS } from '../src/chain.ts';

const rpc = process.env.RPC_URL ?? 'http://127.0.0.1:4510';
const devnet = rpc.includes('devnet');
const link = (s: string) => (devnet ? `https://explorer.solana.com/tx/${s}?cluster=devnet` : s);
const c = new Connection(rpc, 'confirmed');
const kp = process.env.BUYER_KEYPAIR
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.BUYER_KEYPAIR, 'utf8'))))
  : Keypair.generate();
if (!process.env.BUYER_KEYPAIR) await c.confirmTransaction(await c.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL), 'confirmed');
const send = async (ix: any) => {
  const sig = await c.sendTransaction(new Transaction().add(ix), [kp]);
  await c.confirmTransaction(sig, 'confirmed');
  return sig;
};
console.log('buyer', kp.publicKey.toBase58());
try {
  console.log('clock-in', link(await send(checkInIx(kp.publicKey))));
} catch (e) {
  console.log('clock-in skipped:', String(e).match(/0x1771/) ? 'already today' : String(e).slice(0, 120));
}
console.log('tSKR', Number(await fetchSkr(c, kp.publicKey)) / 1e6);
const now = Math.floor(Date.now() / 1000);
const [best] = rankProviders(await fetchProviders(c), now);
if (!best) throw new Error('no providers');
console.log('provider', best.name, best.model, 'price', Number(best.price) / 1e6);
const prompt = process.argv[2] ?? 'In two sentences: why does an escrow make paying a stranger for AI work safe?';
const { ix, job } = postJobIx(kp.publicKey, best.authority, BigInt(Date.now()), prompt, best.price);
console.log('post_job', link(await send(ix)));
const t0 = Date.now();
for (;;) {
  const j = await fetchJob(c, job);
  if (j && j.status !== STATUS.FUNDED) {
    console.log('status', j.status, 'after', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    console.log('hash verified on client:', j.hashVerified, hex(j.resultHash));
    console.log('---\n' + j.result + '\n---');
    console.log('job', job.toBase58());
    break;
  }
  await new Promise((r) => setTimeout(r, 2000));
}
