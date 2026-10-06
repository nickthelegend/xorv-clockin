# PORT-PLAN — Xorv → Solana (Solana Mobile CLOCK IN)

Written before any Solana code. Status of each line is tracked in `HANDOFF.md`.

## What Xorv is (and what must survive the port)

Xorv is a decentralized AI capacity network: people who already pay for Claude Code / Codex
run a provider node and sell spare quota **per job**; buyers pay per task with no account or API key.
The core value, in every version so far (Hedera, Arc, Arbitrum, Monad):

1. **Pay per job, no subscription** — one signature buys one AI job.
2. **Buyer protection** — on Arbitrum the money sits in `XorvEscrow` until the result arrives;
   anyone can refund the buyer after the deadline.
3. **Earned reputation** — every settlement writes the provider's outcome to `XorvRegistry`
   (Stylus/Rust); the matcher ranks on it.
4. **Verifiable receipt** — SHA-256 of the result is recorded next to the payment.

> Note: this repo was cloned from `xorv` main (`dfcd010`), which is the **Hedera x402** version.
> The Arbitrum version (escrow + Stylus registry + log) lives in the sibling `xorv-arbitrum` and is
> the design this port follows. Both are kept as history.

## Mapping

| Arbitrum / EVM piece | What it did | Solana equivalent here | Decision |
|---|---|---|---|
| `XorvEscrow.sol` (fund / release / refund / reassign) | Holds USDG per job, pays on delivery, permissionless refund after deadline | Anchor program `xorv`: `Job` PDA + per-job token vault (ATA owned by the Job PDA). `post_job` → `submit_result(done)` → release; `refund` (anyone, after deadline); `reject` (provider declines → instant refund) | **Keep** — the heart of the product |
| `XorvRegistry` (Stylus, Rust) | Provider records: completed / failed / earned, score | `Provider` PDA per node authority, updated *inside* the same instruction that settles — reputation can't be claimed, only earned | **Keep**, Rust → Rust |
| `XorvLog.sol` (receipts) | Event log + result hash | Anchor events (`JobPosted`, `JobDelivered`, `JobRefunded`, `CheckedIn`) + `result_hash` stored on the Job account; the app re-hashes the result locally and shows ✓ | **Keep**, simpler |
| EIP-3009 / x402 `escrow` scheme, gasless buyer | Buyer signs an authorization, facilitator pays gas | Buyer signs one Solana tx through **Mobile Wallet Adapter** (fees are ~0.000005 SOL) | **Replace** — x402 adds nothing when the buyer's phone already has a wallet; cut |
| Broker (Hono, WebSocket hub, matcher, SQLite, HCS writer) | Registry, liveness, matching, dispatch | **Brokerless.** Providers send an on-chain `heartbeat` (liveness), the app ranks providers itself (reputation × bond × price), the job's prompt and result live in the Job account, the node polls the program | **Replace** — removes the hosted service, so the APK works against devnet alone |
| Paxos USDG / USDC | Settlement token | **SKR** (Seeker's token). On devnet: a program-owned stand-in mint labelled **"tSKR — devnet stand-in for SKR"** | **Replace** |
| (new) | — | **Provider SKR bond**: a node stakes SKR to be listed; a job that times out slashes part of the bond to the buyer | **New — the SKR hook** |
| (new) | — | **Daily clock-in**: `check_in` once per UTC day, streak ×1…×7 multiplier, pays tSKR (devnet: minted by the program PDA; mainnet design: paid from a rewards pool) | **New — the daily loop** |
| World ID / Privy / HashPack / WalletConnect | Wallets & identity on other ports | MWA on Android (Seed Vault compatible); a guest devnet keypair on iOS simulator / for judges without a devnet wallet | **Replace** |
| Robinhood Chain, Arbitrum One configs | Extra networks | — | **Cut** (devnet only) |
| Web app (Next.js), landing, CLI, MCP | Buyer UIs + provider node | New **Expo app `apps/mobile`** (buyer + clock-in + network view); new **`packages/solana-node`** provider node that reuses the existing CLI adapters (Claude Code, Codex, echo, …) | Web/MCP/Hedera code **kept as history, not ported** |

## Program surface (`programs/xorv`)

`initialize` · `check_in` · `register_provider` · `update_provider` · `heartbeat` · `post_job` ·
`submit_result` (chunked; `done=true` releases escrow + writes reputation + hash) · `reject` · `refund` ·
`close_job` · `withdraw_bond`.

## The AI, honestly

The AI is the product: jobs are executed by a real coding agent (Claude Code by default, any
`@xorv/cli` adapter) on a provider's machine, and the answer comes back on-chain. Nothing is
generated in the app. If no provider is online, the job is refunded after its deadline — that path
is part of the demo, not hidden.

## Cut list (can't ship in ~36 h)

- Broker, x402, SSE streaming of tool calls (result arrives at the end, not live).
- Mainnet SKR rewards pool & fee split (design documented, not built).
- Private prompts (prompts are public on devnet; encryption to the provider's key is future work).
- Reassignment to another provider on failure (refund instead).
- iOS MWA (doesn't exist) — guest wallet only on iOS.

## Order of work

1. Anchor program + localnet tests → devnet deploy (new gitignored keypair under `.keys/`).
2. Provider node (`packages/solana-node`) — real Claude Code job on devnet.
3. Expo app: wallet (MWA / guest), Today (clock-in), Ask (post job → result + hash check), Network.
4. iOS simulator screenshots; release APK; emulator smoke test.
5. README reframe, `clockin/` deliverables, HANDOFF, push.
