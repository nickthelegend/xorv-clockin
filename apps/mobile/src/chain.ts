/**
 * A dependency-light client for the Xorv program.
 *
 * Instructions are encoded by hand from the IDL (8-byte discriminator + Borsh
 * args) and accounts are decoded at fixed offsets, so the app needs nothing
 * but @solana/web3.js — no Anchor runtime, no Node polyfills beyond Buffer.
 * Offsets mirror `solana/programs/xorv/src/lib.rs`; the layout tests there and
 * the provider node share the same IDL.
 */
import { Buffer } from 'buffer';
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha256';
import bs58 from 'bs58';

export const PROGRAM_ID = new PublicKey('GbtmzdtzLjPd1fZRmvVy7rnZzSMrUs6UfDJpZShEwXkw');
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ATA_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const SKR_MAINNET_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
export const DECIMALS = 6;
export const MAX_PROMPT = 512;

export const STATUS = { FUNDED: 0, DELIVERED: 1, REFUNDED: 2, REJECTED: 3 } as const;
export type JobStatus = (typeof STATUS)[keyof typeof STATUS];

const DISC = {
  checkIn: [209, 253, 4, 217, 250, 241, 207, 50],
  postJob: [34, 208, 58, 248, 129, 234, 179, 211],
  refund: [2, 96, 183, 251, 63, 208, 46, 46],
  closeJob: [90, 100, 180, 200, 200, 163, 120, 182],
};
const ACCT = {
  config: [155, 12, 170, 224, 30, 250, 204, 130],
  job: [75, 124, 80, 203, 161, 180, 202, 80],
  provider: [164, 180, 71, 17, 75, 216, 80, 195],
  user: [176, 223, 136, 27, 122, 79, 32, 227],
};

const seed = (s: string) => Buffer.from(s);
const find = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
const u64le = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n as any, 0);
  return b;
};

export const pda = {
  config: () => find([seed('config')]),
  mint: () => find([seed('skr-mint')]),
  provider: (authority: PublicKey) => find([seed('provider'), authority.toBuffer()]),
  bond: (provider: PublicKey) => find([seed('bond'), provider.toBuffer()]),
  job: (buyer: PublicKey, nonce: bigint) => find([seed('job'), buyer.toBuffer(), u64le(nonce)]),
  vault: (job: PublicKey) => find([seed('vault'), job.toBuffer()]),
  user: (wallet: PublicKey) => find([seed('user'), wallet.toBuffer()]),
};

export function ata(owner: PublicKey, mint = pda.mint()): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID,
  )[0];
}

const w = (pubkey: PublicKey, isSigner = false, isWritable = false) => ({ pubkey, isSigner, isWritable });

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

export function checkInIx(user: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      w(user, true, true),
      w(pda.config()),
      w(pda.mint(), false, true),
      w(pda.user(user), false, true),
      w(ata(user), false, true),
      w(TOKEN_PROGRAM_ID),
      w(ATA_PROGRAM_ID),
      w(SystemProgram.programId),
    ],
    data: Buffer.from(DISC.checkIn),
  });
}

export function postJobIx(
  buyer: PublicKey,
  providerAuthority: PublicKey,
  nonce: bigint,
  prompt: string,
  maxPrice: bigint,
): { ix: TransactionInstruction; job: PublicKey } {
  const provider = pda.provider(providerAuthority);
  const job = pda.job(buyer, nonce);
  const p = Buffer.from(prompt, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(p.length, 0);
  const data = Buffer.concat([Buffer.from(DISC.postJob), u64le(nonce), len, p, u64le(maxPrice)]);
  return {
    job,
    ix: new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        w(buyer, true, true),
        w(pda.config(), false, true),
        w(pda.mint()),
        w(provider, false, true),
        w(job, false, true),
        w(pda.vault(job), false, true),
        w(ata(buyer), false, true),
        w(pda.user(buyer), false, true),
        w(TOKEN_PROGRAM_ID),
        w(SystemProgram.programId),
      ],
      data,
    }),
  };
}

/** Permissionless after the deadline: refund + slice of the provider's bond. */
export function refundIx(caller: PublicKey, job: Job): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      w(caller, true, false),
      w(pda.config()),
      w(pda.mint()),
      w(job.provider, false, true),
      w(pda.bond(job.provider), false, true),
      w(job.address, false, true),
      w(job.buyer, false, true),
      w(pda.vault(job.address), false, true),
      w(ata(job.buyer), false, true),
      w(TOKEN_PROGRAM_ID),
    ],
    data: Buffer.from(DISC.refund),
  });
}

export function closeJobIx(buyer: PublicKey, job: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [w(buyer, true, true), w(job, false, true)],
    data: Buffer.from(DISC.closeJob),
  });
}

/** Create the buyer's tSKR token account if it doesn't exist (idempotent). */
export function createAtaIdempotentIx(payer: PublicKey, owner: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ATA_PROGRAM_ID,
    keys: [
      w(payer, true, true),
      w(ata(owner), false, true),
      w(owner),
      w(pda.mint()),
      w(SystemProgram.programId),
      w(TOKEN_PROGRAM_ID),
    ],
    data: Buffer.from([1]),
  });
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface Config {
  mint: PublicKey;
  dailyReward: bigint;
  minBond: bigint;
  slashBps: number;
  jobTimeout: number;
  dayLength: number;
  providers: number;
  jobs: number;
}

export interface Provider {
  address: PublicKey;
  authority: PublicKey;
  price: bigint;
  bond: bigint;
  completed: number;
  failed: number;
  earned: bigint;
  openJobs: number;
  active: boolean;
  lastSeen: number;
  registeredAt: number;
  name: string;
  model: string;
}

export interface Job {
  address: PublicKey;
  buyer: PublicKey;
  provider: PublicKey;
  nonce: bigint;
  amount: bigint;
  createdAt: number;
  deadline: number;
  settledAt: number;
  status: JobStatus;
  slashed: bigint;
  resultHash: Uint8Array;
  prompt: string;
  result: string;
  /** sha256(result) recomputed on this phone equals the hash the program stored. */
  hashVerified: boolean;
}

export interface UserStats {
  streak: number;
  bestStreak: number;
  lastDay: number;
  checkins: number;
  jobsPosted: number;
  claimed: bigint;
}

const i64 = (b: Buffer, o: number) => Number(b.readBigInt64LE(o) as unknown as bigint);
const u64 = (b: Buffer, o: number) => BigInt((b.readBigUInt64LE(o) as unknown as bigint).toString());
const str = (b: Buffer, o: number): [string, number] => {
  const len = b.readUInt32LE(o);
  return [Buffer.from(b.subarray(o + 4, o + 4 + len)).toString('utf8'), o + 4 + len];
};

export function decodeConfig(b: Buffer): Config {
  return {
    mint: new PublicKey(b.subarray(40, 72)),
    dailyReward: u64(b, 72),
    minBond: u64(b, 80),
    slashBps: b.readUInt16LE(88),
    jobTimeout: i64(b, 90),
    dayLength: i64(b, 98),
    providers: Number(u64(b, 106)),
    jobs: Number(u64(b, 114)),
  };
}

export function decodeProvider(address: PublicKey, b: Buffer): Provider {
  const [name, o] = str(b, 95);
  const [model] = str(b, o);
  return {
    address,
    authority: new PublicKey(b.subarray(8, 40)),
    price: u64(b, 40),
    bond: u64(b, 48),
    completed: b.readUInt32LE(56),
    failed: b.readUInt32LE(60),
    earned: u64(b, 64),
    openJobs: b.readUInt32LE(72),
    active: b[76] === 1,
    lastSeen: i64(b, 77),
    registeredAt: i64(b, 85),
    name,
    model,
  };
}

export function decodeJob(address: PublicKey, b: Buffer): Job {
  const [prompt, o] = str(b, 155);
  const rlen = b.readUInt32LE(o);
  const resultBytes = b.subarray(o + 4, o + 4 + rlen);
  const resultHash = new Uint8Array(b.subarray(121, 153));
  const status = b[112] as JobStatus;
  const hashVerified =
    status === STATUS.DELIVERED &&
    Buffer.from(sha256(new Uint8Array(resultBytes))).equals(Buffer.from(resultHash));
  return {
    address,
    buyer: new PublicKey(b.subarray(8, 40)),
    provider: new PublicKey(b.subarray(40, 72)),
    nonce: u64(b, 72),
    amount: u64(b, 80),
    createdAt: i64(b, 88),
    deadline: i64(b, 96),
    settledAt: i64(b, 104),
    status,
    slashed: u64(b, 113),
    resultHash,
    prompt,
    result: Buffer.from(resultBytes).toString('utf8'),
    hashVerified,
  };
}

export function decodeUser(b: Buffer): UserStats {
  return {
    streak: b.readUInt32LE(40),
    bestStreak: b.readUInt32LE(44),
    lastDay: i64(b, 48),
    checkins: b.readUInt32LE(56),
    jobsPosted: b.readUInt32LE(60),
    claimed: u64(b, 64),
  };
}

const discFilter = (d: number[]) => ({ memcmp: { offset: 0, bytes: bs58.encode(Uint8Array.from(d)) } });

export async function fetchConfig(c: Connection): Promise<Config | null> {
  const info = await c.getAccountInfo(pda.config());
  return info ? decodeConfig(Buffer.from(info.data)) : null;
}

export async function fetchProviders(c: Connection): Promise<Provider[]> {
  const res = await c.getProgramAccounts(PROGRAM_ID, { filters: [discFilter(ACCT.provider)] });
  return res.map((r) => decodeProvider(r.pubkey, Buffer.from(r.account.data)));
}

export async function fetchJobs(c: Connection, buyer: PublicKey): Promise<Job[]> {
  const res = await c.getProgramAccounts(PROGRAM_ID, {
    filters: [discFilter(ACCT.job), { memcmp: { offset: 8, bytes: buyer.toBase58() } }],
  });
  return res
    .map((r) => decodeJob(r.pubkey, Buffer.from(r.account.data)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchJob(c: Connection, job: PublicKey): Promise<Job | null> {
  const info = await c.getAccountInfo(job);
  return info ? decodeJob(job, Buffer.from(info.data)) : null;
}

export async function fetchUser(c: Connection, wallet: PublicKey): Promise<UserStats | null> {
  const info = await c.getAccountInfo(pda.user(wallet));
  return info ? decodeUser(Buffer.from(info.data)) : null;
}

export async function fetchSkr(c: Connection, owner: PublicKey): Promise<bigint> {
  try {
    const r = await c.getTokenAccountBalance(ata(owner));
    return BigInt(r.value.amount);
  } catch {
    return 0n;
  }
}

// ---------------------------------------------------------------------------
// Product logic shared by screens
// ---------------------------------------------------------------------------

export const LIVE_WINDOW = 180; // seconds since the last heartbeat

export const isLive = (p: Provider, now: number) => p.active && now - p.lastSeen < LIVE_WINDOW;

/** Laplace-smoothed success rate: a new node starts at 50%, not 100%. */
export const reputation = (p: Provider) => (p.completed + 1) / (p.completed + p.failed + 2);

/** The matcher the broker used to run, now on the phone: live → reputation → bond → price. */
export function rankProviders(ps: Provider[], now: number): Provider[] {
  return [...ps].sort(
    (a, b) =>
      Number(isLive(b, now)) - Number(isLive(a, now)) ||
      reputation(b) - reputation(a) ||
      Number(b.bond - a.bond) ||
      Number(a.price - b.price),
  );
}

export const fmtSkr = (v: bigint, dp = 2) => {
  const whole = Number(v) / 10 ** DECIMALS;
  return whole.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 });
};

export const short = (k: PublicKey | string, n = 4) => {
  const s = typeof k === 'string' ? k : k.toBase58();
  return `${s.slice(0, n)}…${s.slice(-n)}`;
};

export const hex = (u: Uint8Array) => Buffer.from(u).toString('hex');
