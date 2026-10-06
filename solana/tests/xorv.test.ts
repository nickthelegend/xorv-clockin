/**
 * Localnet tests for the Xorv program. Run with `scripts/localnet-test.sh`,
 * which boots solana-test-validator on port 4510 with the built program loaded.
 *
 * The config is initialised with a 6-second "day" and a 5-second job timeout so
 * streaks, missed days and deadlines can be exercised in real time.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import anchor from "@coral-xyz/anchor";
import { getAccount } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { ata, makeProgram, pda, STATUS } from "../client/index.js";

const { BN } = anchor;
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:4510";
const connection = new Connection(RPC, "confirmed");
const DAY = 6;
const TIMEOUT = 5;
const T = (n: number) => new BN(n).mul(new BN(1_000_000)); // whole tSKR → base units

const admin = Keypair.generate();
const buyer = Keypair.generate();
const node = Keypair.generate(); // provider authority
const stranger = Keypair.generate();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chainNow(): Promise<number> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  return Number(info!.data.readBigInt64LE(32));
}

/** Wait until the chain clock has just entered a new "day". */
async function waitForDayStart() {
  const start = Math.floor((await chainNow()) / DAY);
  while (Math.floor((await chainNow()) / DAY) === start) await sleep(250);
}

async function fund(kp: Keypair) {
  const sig = await connection.requestAirdrop(kp.publicKey, 20 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

async function tokens(owner: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection, ata(owner))).amount;
  } catch {
    return 0n;
  }
}

async function expectError(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: any) => {
    const s = String(e?.error?.errorCode?.code ?? e?.message ?? e);
    assert.match(s + " " + JSON.stringify(e?.logs ?? ""), new RegExp(code));
    return true;
  });
}

const as = (kp: Keypair) => makeProgram(connection, kp);

let nonce = 1n;
async function postJob(prompt: string) {
  const n = nonce++;
  const job = pda.job(buyer.publicKey, n);
  await as(buyer)
    .methods.postJob(new BN(n.toString()), prompt, T(5))
    .accountsPartial({
      buyer: buyer.publicKey,
      config: pda.config(),
      mint: pda.mint(),
      provider: pda.provider(node.publicKey),
      job,
      vault: pda.vault(job),
      buyerAta: ata(buyer.publicKey),
      stats: pda.user(buyer.publicKey),
    })
    .rpc();
  return job;
}

before(async () => {
  await Promise.all([admin, buyer, node, stranger].map(fund));
});

test("initialize creates the config and the stand-in mint", async () => {
  await as(admin)
    .methods.initialize(T(25), T(10), 2_000, new BN(TIMEOUT), new BN(DAY))
    .accountsPartial({ admin: admin.publicKey, config: pda.config(), mint: pda.mint() })
    .rpc();
  const cfg = await as(admin).account.config.fetch(pda.config());
  assert.equal(cfg.mint.toBase58(), pda.mint().toBase58());
  assert.equal(cfg.slashBps, 2_000);
});

test("clock-in: reward, once per day, streak grows, missed day resets", async () => {
  const p = as(buyer);
  const checkIn = () => p.methods.checkIn().accounts({ user: buyer.publicKey }).rpc();

  await waitForDayStart();
  await checkIn();
  assert.equal(await tokens(buyer.publicKey), 25_000_000n);
  await expectError(checkIn(), "AlreadyClockedIn");

  await waitForDayStart();
  await checkIn();
  let s = await p.account.userStats.fetch(pda.user(buyer.publicKey));
  assert.equal(s.streak, 2);
  assert.equal(await tokens(buyer.publicKey), 25_000_000n + 50_000_000n); // ×2 on day two

  await waitForDayStart();
  await waitForDayStart(); // skip a whole day
  await checkIn();
  s = await p.account.userStats.fetch(pda.user(buyer.publicKey));
  assert.equal(s.streak, 1);
  assert.equal(s.bestStreak, 2);
  assert.equal(s.checkins, 3);
});

test("register_provider stakes the bond; below-minimum bond is refused", async () => {
  const p = as(node);
  await p.methods.checkIn().accounts({ user: node.publicKey }).rpc(); // 25 tSKR to bond with
  const accounts = {
    authority: node.publicKey,
    config: pda.config(),
    mint: pda.mint(),
    provider: pda.provider(node.publicKey),
    bondVault: pda.bond(pda.provider(node.publicKey)),
    authorityAta: ata(node.publicKey),
  };
  await expectError(
    p.methods.registerProvider("tiny", "echo", T(2), T(5)).accountsPartial(accounts).rpc(),
    "BondTooSmall",
  );
  await p.methods.registerProvider("nivesh-macbook", "claude-code", T(2), T(10)).accountsPartial(accounts).rpc();
  const prov = await p.account.provider.fetch(pda.provider(node.publicKey));
  assert.equal(prov.bond.toString(), T(10).toString());
  assert.equal(prov.active, true);
  assert.equal((await getAccount(connection, pda.bond(pda.provider(node.publicKey)))).amount, 10_000_000n);
});

function settleAccounts(job: PublicKey) {
  return {
    authority: node.publicKey,
    config: pda.config(),
    mint: pda.mint(),
    provider: pda.provider(node.publicKey),
    job,
    buyer: buyer.publicKey,
    vault: pda.vault(job),
    providerAta: ata(node.publicKey),
  };
}

test("post → chunked result → escrow pays provider, hash and reputation recorded", async () => {
  const before = await tokens(buyer.publicKey);
  const nodeBefore = await tokens(node.publicKey);
  const job = await postJob("Explain a Merkle tree in one sentence.");
  assert.equal(await tokens(buyer.publicKey), before - 2_000_000n);
  assert.equal((await getAccount(connection, pda.vault(job))).amount, 2_000_000n);

  const part1 = Buffer.from("A Merkle tree hashes leaves pairwise ");
  const part2 = Buffer.from("up to a single root that commits to all of them.");
  // A stranger cannot deliver.
  await expectError(
    as(stranger).methods.submitResult(part1, true).accountsPartial({ ...settleAccounts(job), authority: stranger.publicKey, providerAta: ata(stranger.publicKey) }).rpc(),
    "ConstraintSeeds|ConstraintHasOne|AccountNotInitialized",
  );
  await as(node).methods.submitResult(part1, false).accountsPartial(settleAccounts(job)).rpc();
  await as(node).methods.submitResult(part2, true).accountsPartial(settleAccounts(job)).rpc();

  const j = await as(buyer).account.job.fetch(job);
  const full = Buffer.concat([part1, part2]);
  assert.equal(j.status, STATUS.DELIVERED);
  assert.equal(Buffer.from(j.result).toString(), full.toString());
  assert.equal(Buffer.from(j.resultHash).toString("hex"), createHash("sha256").update(full).digest("hex"));
  assert.equal(await tokens(node.publicKey), nodeBefore + 2_000_000n);
  assert.equal(await connection.getAccountInfo(pda.vault(job)), null, "vault closed");
  const prov = await as(node).account.provider.fetch(pda.provider(node.publicKey));
  assert.equal(prov.completed, 1);
  assert.equal(prov.openJobs, 0);
  assert.equal(prov.earned.toString(), T(2).toString());

  // settled jobs can be closed for rent; buyer only
  await expectError(as(node).methods.closeJob().accountsPartial({ buyer: node.publicKey, job }).rpc(), "ConstraintHasOne");
  await as(buyer).methods.closeJob().accountsPartial({ buyer: buyer.publicKey, job }).rpc();
  assert.equal(await connection.getAccountInfo(job), null);
});

test("max_price protects the buyer from a price change", async () => {
  await as(node).methods.updateProvider(T(9), true, "claude-code").accounts({ authority: node.publicKey }).rpc();
  await expectError(postJob("too expensive?"), "PriceAboveMax");
  await as(node).methods.updateProvider(T(2), true, "claude-code").accounts({ authority: node.publicKey }).rpc();
});

test("reject refunds the buyer at once, counts a failure, no slash", async () => {
  const before = await tokens(buyer.publicKey);
  const job = await postJob("Please do something I refuse to do");
  await as(node)
    .methods.reject()
    .accountsPartial({
      authority: node.publicKey,
      config: pda.config(),
      mint: pda.mint(),
      provider: pda.provider(node.publicKey),
      job,
      buyer: buyer.publicKey,
      vault: pda.vault(job),
      buyerAta: ata(buyer.publicKey),
    })
    .rpc();
  assert.equal(await tokens(buyer.publicKey), before);
  const prov = await as(node).account.provider.fetch(pda.provider(node.publicKey));
  assert.equal(prov.failed, 1);
  assert.equal(prov.bond.toString(), T(10).toString());
  assert.equal((await as(buyer).account.job.fetch(job)).status, STATUS.REJECTED);
});

test("deadline: no refund before it, no delivery after it; anyone refunds + slash", async () => {
  const before = await tokens(buyer.publicKey);
  const job = await postJob("A job nobody answers");
  const refundAccounts = {
    caller: stranger.publicKey,
    config: pda.config(),
    mint: pda.mint(),
    provider: pda.provider(node.publicKey),
    bondVault: pda.bond(pda.provider(node.publicKey)),
    job,
    buyer: buyer.publicKey,
    vault: pda.vault(job),
    buyerAta: ata(buyer.publicKey),
  };
  await expectError(as(stranger).methods.refund().accountsPartial(refundAccounts).rpc(), "BeforeDeadline");

  const deadline = (await as(buyer).account.job.fetch(job)).deadline.toNumber();
  while ((await chainNow()) <= deadline) await sleep(500);

  await expectError(
    as(node).methods.submitResult(Buffer.from("too late"), true).accountsPartial(settleAccounts(job)).rpc(),
    "PastDeadline",
  );
  await as(stranger).methods.refund().accountsPartial(refundAccounts).rpc();

  // price back + 20% of the 10 tSKR bond
  assert.equal(await tokens(buyer.publicKey), before + 2_000_000n);
  const j = await as(buyer).account.job.fetch(job);
  assert.equal(j.status, STATUS.REFUNDED);
  assert.equal(j.slashed.toString(), "2000000");
  const prov = await as(node).account.provider.fetch(pda.provider(node.publicKey));
  assert.equal(prov.bond.toString(), T(8).toString());
  assert.equal(prov.failed, 2);
  assert.equal(prov.openJobs, 0);
  await expectError(as(stranger).methods.refund().accountsPartial(refundAccounts).rpc(), "NotFunded|AccountNotInitialized");
});

test("bond: top up, withdraw only after deactivating", async () => {
  const p = as(node);
  const accounts = {
    authority: node.publicKey,
    config: pda.config(),
    mint: pda.mint(),
    provider: pda.provider(node.publicKey),
    bondVault: pda.bond(pda.provider(node.publicKey)),
    authorityAta: ata(node.publicKey),
  };
  await p.methods.addBond(T(2)).accountsPartial(accounts).rpc();
  await expectError(p.methods.withdrawBond().accountsPartial(accounts).rpc(), "ProviderActive");
  await p.methods.updateProvider(T(2), false, "claude-code").accounts({ authority: node.publicKey }).rpc();
  await expectError(postJob("to an inactive node"), "ProviderInactive");
  const before = await tokens(node.publicKey);
  await p.methods.withdrawBond().accountsPartial(accounts).rpc();
  assert.equal(await tokens(node.publicKey), before + 10_000_000n);
  assert.equal((await p.account.provider.fetch(pda.provider(node.publicKey))).bond.toString(), "0");
});
