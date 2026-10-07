/**
 * xorv-solana node — a provider that sells its AI capacity through the Xorv
 * program, with no broker in between.
 *
 *   RPC_URL=https://api.devnet.solana.com XORV_ADAPTER=claude-code pnpm --filter @xorv/solana node
 *
 * What it does, forever:
 *   1. registers once (clock-in for tSKR, then stake the bond);
 *   2. heartbeats every 30 s so phones see it as live, and clocks in daily;
 *   3. polls for Funded jobs addressed to it, runs each through a real agent
 *      CLI adapter from @xorv/cli (Claude Code by default), writes the answer
 *      on-chain in chunks — the final chunk settles the escrow — or rejects
 *      the job (instant refund) if the agent fails.
 */
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createAdapter } from "@xorv/cli/dist/adapters/index.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ata, explorer, makeProgram, pda, PROGRAM_ID, STATUS, STATUS_OFFSET } from "../client/index.js";

const { BN } = anchor;
const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const CLUSTER = RPC.includes("devnet") ? "devnet" : "localnet";
const KEYFILE = process.env.XORV_NODE_KEYPAIR ?? path.resolve("../.keys/provider-node.json");
const ADAPTER = (process.env.XORV_ADAPTER ?? "claude-code") as Parameters<typeof createAdapter>[0];
const MODEL_LABEL = (process.env.XORV_MODEL_LABEL ?? (ADAPTER === "openai-compatible" ? process.env.XORV_OPENAI_MODEL ?? ADAPTER : ADAPTER)).slice(0, 48);
const PRICE = Number(process.env.XORV_PRICE ?? 2); // tSKR per job
const BOND = Number(process.env.XORV_BOND ?? 10);
const NAME = (process.env.XORV_NODE_NAME ?? os.hostname().replace(/\.local$/, "")).slice(0, 32);
const MAX_RESULT = 2048;
const CHUNK = 700;

const T = (n: number) => new BN(Math.round(n * 1_000_000));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const link = (sig: string) => (CLUSTER === "devnet" ? explorer(sig) : sig.slice(0, 16) + "…");

function loadOrCreate(file: string): Keypair {
  if (fs.existsSync(file)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
  const kp = Keypair.generate();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  log("created node keypair", kp.publicKey.toBase58(), "→", file);
  return kp;
}

const connection = new Connection(RPC, "confirmed");
const node = loadOrCreate(KEYFILE);
const program = makeProgram(connection, node);
const providerPda = pda.provider(node.publicKey);
const adapter = createAdapter(ADAPTER);

/** The answer has to fit in the job account, so ask for brevity up front. */
const framed = (prompt: string) =>
  `${prompt}\n\n(Answer in plain text, under 1500 characters — the reply is stored on-chain and read on a phone.)`;

function clampUtf8(s: string, max: number): Buffer {
  const b = Buffer.from(s, "utf8");
  if (b.length <= max) return b;
  const tail = "\n…[truncated]";
  let cut = s;
  while (Buffer.byteLength(cut + tail) > max) cut = cut.slice(0, Math.floor(cut.length * 0.95));
  return Buffer.from(cut + tail, "utf8");
}

async function ensureSol() {
  const bal = await connection.getBalance(node.publicKey);
  if (bal >= 0.05 * LAMPORTS_PER_SOL) return;
  if (CLUSTER === "localnet") {
    const sig = await connection.requestAirdrop(node.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    return;
  }
  throw new Error(`node ${node.publicKey.toBase58()} has ${bal / LAMPORTS_PER_SOL} SOL — fund it with devnet SOL first`);
}

async function checkIn() {
  try {
    const sig = await program.methods.checkIn().accounts({ user: node.publicKey }).rpc();
    log("clocked in for today", link(sig));
  } catch (e) {
    if (!String(e).includes("AlreadyClockedIn")) log("clock-in failed:", String(e).slice(0, 160));
  }
}

async function ensureRegistered() {
  const existing = await program.account.provider.fetchNullable(providerPda);
  if (existing) {
    log(`provider ${existing.name} · completed ${existing.completed} · failed ${existing.failed} · bond ${existing.bond.toNumber() / 1e6} tSKR`);
    if (!existing.active || existing.price.toString() !== T(PRICE).toString() || existing.model !== MODEL_LABEL) {
      await program.methods.updateProvider(T(PRICE), true, MODEL_LABEL).accounts({ authority: node.publicKey }).rpc();
      log(`updated: price ${PRICE} tSKR, model ${MODEL_LABEL}, active`);
    }
    return;
  }
  await checkIn();
  const sig = await program.methods
    .registerProvider(NAME, MODEL_LABEL, T(PRICE), T(BOND))
    .accountsPartial({
      authority: node.publicKey,
      config: pda.config(),
      mint: pda.mint(),
      provider: providerPda,
      bondVault: pda.bond(providerPda),
      authorityAta: ata(node.publicKey),
    })
    .rpc();
  log(`registered "${NAME}" · ${PRICE} tSKR/job · bond ${BOND} tSKR`, link(sig));
}

const inFlight = new Set<string>();

async function pollJobs() {
  const accounts = await program.account.job.all([
    { memcmp: { offset: 40, bytes: providerPda.toBase58() } },
    { memcmp: { offset: STATUS_OFFSET, bytes: anchor.utils.bytes.bs58.encode(Buffer.from([STATUS.FUNDED])) } },
  ]);
  for (const { publicKey, account } of accounts) {
    const id = publicKey.toBase58();
    if (inFlight.has(id)) continue;
    inFlight.add(id);
    runJob(publicKey, account).finally(() => inFlight.delete(id));
  }
}

type JobAccount = Awaited<ReturnType<typeof program.account.job.fetch>>;

async function runJob(job: PublicKey, j: JobAccount) {
  const now = Math.floor(Date.now() / 1000);
  const budgetMs = (j.deadline.toNumber() - now - 20) * 1000;
  log(`job ${job.toBase58().slice(0, 8)} · ${j.amount.toNumber() / 1e6} tSKR · "${j.prompt.slice(0, 60)}"`);
  const settle = {
    authority: node.publicKey,
    config: pda.config(),
    mint: pda.mint(),
    provider: providerPda,
    job,
    buyer: j.buyer,
    vault: pda.vault(job),
  };
  if (budgetMs < 5_000) {
    log("  too close to its deadline — leaving it to refund");
    return;
  }
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "xorv-sol-job-"));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budgetMs);
  try {
    const started = Date.now();
    // The CLI's echo adapter describes the Hedera/x402 path; on Solana say
    // plainly what happened instead. No model runs for echo jobs.
    const answer = ADAPTER === "echo"
      ? [
          "Echo from a Xorv test node. No AI model ran for this job.",
          "",
          `You asked: "${j.prompt.slice(0, 200)}"`,
          "",
          "What did happen is real: your tSKR was escrowed by the Solana program, this node picked the job up, and the instruction that stored this text also released the payment and recorded its SHA-256. Point the node at claude-code or any OpenAI-compatible model to sell actual capacity; the payment path is identical.",
        ].join("\n")
      : await adapter.run({
      prompt: framed(j.prompt),
      cwd,
      timeoutMs: budgetMs,
      signal: ctrl.signal,
      emit: (e) => {
        const text = (e as { text?: string }).text;
        if (text) log("  ·", text.slice(0, 80));
      },
    });
    const bytes = clampUtf8(answer.trim(), MAX_RESULT);
    log(`  answered in ${((Date.now() - started) / 1000).toFixed(1)}s · ${bytes.length} bytes`);
    for (let off = 0; off < bytes.length; off += CHUNK) {
      const chunk = bytes.subarray(off, off + CHUNK);
      const done = off + CHUNK >= bytes.length;
      const sig = await program.methods
        .submitResult(Buffer.from(chunk), done)
        .accountsPartial({ ...settle, providerAta: ata(node.publicKey) })
        .rpc();
      if (done) log(`  delivered + paid`, link(sig));
    }
  } catch (e) {
    log("  agent failed:", String(e).slice(0, 200));
    try {
      const sig = await program.methods.reject().accountsPartial({ ...settle, buyerAta: ata(j.buyer) }).rpc();
      log("  rejected → buyer refunded", link(sig));
    } catch (e2) {
      log("  reject failed:", String(e2).slice(0, 160));
    }
  } finally {
    clearTimeout(timer);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function main() {
  log(`xorv-solana node · ${CLUSTER} · program ${PROGRAM_ID.toBase58()}`);
  log(`authority ${node.publicKey.toBase58()} · adapter ${ADAPTER}`);
  if (!(await adapter.available())) throw new Error(`adapter ${ADAPTER} is not available: ${adapter.installHint}`);
  await ensureSol();
  await ensureRegistered();
  await checkIn();

  const beat = () =>
    program.methods
      .heartbeat()
      .accounts({ authority: node.publicKey })
      .rpc()
      .catch((e) => log("heartbeat failed:", String(e).slice(0, 120)));
  await beat();
  setInterval(beat, 30_000); // must match HEARTBEAT_INTERVAL in apps/mobile/src/chain.ts
  setInterval(checkIn, 60 * 60_000);
  log("live — waiting for jobs");
  for (;;) {
    await pollJobs().catch((e) => log("poll failed:", String(e).slice(0, 120)));
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
