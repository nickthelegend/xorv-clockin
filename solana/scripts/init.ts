/**
 * Initialise the deployed program: config PDA + the program-owned tSKR
 * stand-in mint. Idempotent. Writes deployments/<cluster>.json.
 *
 *   RPC_URL=https://api.devnet.solana.com CLUSTER=devnet tsx scripts/init.ts
 */
import anchor from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import fs from "node:fs";
import { explorer, loadKeypair, makeProgram, pda, PROGRAM_ID } from "../client/index.js";

const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const CLUSTER = process.env.CLUSTER ?? "devnet";
const KEY = process.env.ADMIN_KEYPAIR ?? "../.keys/devnet-deployer.json";
const local = CLUSTER === "localnet";
// devnet: real days and a 10-minute job deadline. localnet demo: same, unless overridden.
const DAY = Number(process.env.DAY_LENGTH ?? 86_400);
const TIMEOUT = Number(process.env.JOB_TIMEOUT ?? 600);

const { BN } = anchor;
const T = (n: number) => new BN(n).mul(new BN(1_000_000));

const connection = new Connection(RPC, "confirmed");
const admin = loadKeypair(KEY);
const program = makeProgram(connection, admin);
const out = `deployments/${CLUSTER}.json`;
const record: Record<string, unknown> = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};

const existing = await connection.getAccountInfo(pda.config());
if (existing) {
  console.log("config already initialised:", pda.config().toBase58());
} else {
  const sig = await program.methods
    .initialize(T(25), T(10), 2_000, new BN(TIMEOUT), new BN(DAY))
    .accountsPartial({ admin: admin.publicKey, config: pda.config(), mint: pda.mint() })
    .rpc();
  console.log("initialised:", local ? sig : explorer(sig, CLUSTER));
  record.initTx = sig;
}
const cfg = await program.account.config.fetch(pda.config());
Object.assign(record, {
  cluster: CLUSTER,
  programId: PROGRAM_ID.toBase58(),
  config: pda.config().toBase58(),
  mint: pda.mint().toBase58(),
  mintLabel: "tSKR — devnet stand-in for SKR (SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3 on mainnet)",
  admin: admin.publicKey.toBase58(),
  dailyReward: cfg.dailyReward.toString(),
  minBond: cfg.minBond.toString(),
  slashBps: cfg.slashBps,
  jobTimeout: cfg.jobTimeout.toNumber(),
  dayLength: cfg.dayLength.toNumber(),
});
fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
console.log(`wrote ${out}`);
