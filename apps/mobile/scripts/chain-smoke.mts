/**
 * Exercise the app's hand-written client (src/chain.ts) against a running
 * local validator: clock in, read stats/config/providers back.
 *   npx tsx scripts/chain-smoke.ts   (RPC_URL defaults to http://127.0.0.1:4510)
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { checkInIx, fetchConfig, fetchProviders, fetchSkr, fetchUser } from '../src/chain.ts';

const c = new Connection(process.env.RPC_URL ?? 'http://127.0.0.1:4510', 'confirmed');
const kp = Keypair.generate();
await c.confirmTransaction(await c.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL), 'confirmed');
const tx = new Transaction().add(checkInIx(kp.publicKey));
const sig = await c.sendTransaction(tx, [kp]);
await c.confirmTransaction(sig, 'confirmed');
console.log('config', await fetchConfig(c));
console.log('user', await fetchUser(c, kp.publicKey));
console.log('tSKR', await fetchSkr(c, kp.publicKey));
console.log('providers', (await fetchProviders(c)).length);
