# Xorv: Solana Mobile CLOCK IN submission

**Name:** Xorv
**One-liner:** Clock in daily for SKR, then spend it on AI jobs run by other people's Claude Code. A Solana escrow means you only pay when the answer arrives.
**Repo:** https://github.com/nickthelegend/xorv-clockin (MIT)
**Team:** Nivesh Gajengi (solo)

---

## Problem

People pay $20–200 a month for Claude Code or Codex and leave most of it idle. Anyone who needs one AI task done
has to buy a whole plan. Paying a stranger for that work is a trust problem: one side always goes first and hopes.

## Solution

A Seeker app plus a provider node, both wired to one Solana program:

- **Today**: one dial, one tap, one on-chain `check_in`. It pays tSKR × your streak (up to ×7). A local notification fires the moment the next day opens.
- **Ask**: the phone ranks providers from their on-chain record and you sign once (MWA / Seed Vault). The price moves into an **escrow vault owned by the job**.
- **Pay on delivery**: the provider's node runs a real agent and writes the answer on-chain. That same instruction releases the escrow, stores the SHA-256 and bumps the provider's reputation. The phone re-hashes the answer and shows ✓.
- **No answer?** After the deadline anyone can refund you, and 20% of the provider's SKR bond goes to you. A provider that fails honestly can `reject`, which refunds instantly.

## Why Seeker users come back daily

1. The **streak**: miss a day and the multiplier resets. The reminder notification is scheduled for the exact moment the next on-chain day opens.
2. **Earn → spend**: the daily reward buys about one AI job a day, so the habit and the product are the same loop.
3. **Answers arrive as notifications**, which gives you a reason to reopen the app.

## How it uses Solana / MWA / SKR / AI

| | |
|---|---|
| **Solana program** | Anchor 0.32, `GbtmzdtzLjPd1fZRmvVy7rnZzSMrUs6UfDJpZShEwXkw`. 11 instructions: initialize, check_in, register_provider, update_provider, heartbeat, add_bond, withdraw_bond, post_job, submit_result, reject, refund, close_job. 8/8 localnet tests. |
| **Brokerless** | The Hedera and Arbitrum versions needed a hosted broker. Here liveness is an on-chain `heartbeat`, matching runs on the phone, and the job account holds the prompt and the answer. The APK needs only an RPC. |
| **MWA** | `@solana-mobile/mobile-wallet-adapter-protocol-web3js` 2.3.0, imported dynamically on Android only. The auth token is cached in SecureStore, and transactions are v0 via `signAndSendTransactions`. iOS and wallet-less devices get a clearly labelled devnet **dev wallet**. |
| **SKR** | You **earn** it (daily clock-in), **spend** it (every job is priced in SKR), and providers **stake** it (a slashable bond paid to the buyer on timeout). On devnet it is **tSKR**, a program-owned stand-in mint labelled everywhere in the UI. Mainnet SKR is `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` (6 decimals); there, clock-in would pay from a funded pool. |
| **AI** | The product *is* AI capacity: jobs run on a provider's machine through the existing `@xorv/cli` adapters (Claude Code, Codex, any OpenAI-compatible server). The app does no inference and fakes no answers. |

## Devnet

| | |
|---|---|
| Program ID | `GbtmzdtzLjPd1fZRmvVy7rnZzSMrUs6UfDJpZShEwXkw` |
| Config PDA | `Ge5zYWcR6MQ7ECZ9s2y6NpGe5ykGt2XCvnJoXfX1dgQJ` |
| tSKR mint (PDA) | `5yW5niiHRs2iU4nkpkMqNGE7ZR1EPpSVmvzAJsnQn5Rw` |
| Deploy status | **Not yet deployed.** The faucet rate-limited every request for the deployer `Ftk563Wp1tdf5U1nyzF1BQwShvKPdHT9VY1FKGWo8ftE`. It needs ~3.2 SOL, then `solana/scripts/deploy-devnet.sh` deploys and initialises in one command. Tx links go here once that runs (see HANDOFF.md). The program ID and PDAs above are deterministic and won't change. |

Everything end to end has been verified against a **local validator** running the same `.so` (see HANDOFF.md for evidence).

## Install the APK

- File: `xorv-clockin.apk` (release, arm64-v8a + x86_64, signed with a per-app release key)
- SHA-256: `5aaf0e9259f45a2a12e168906c114c2c7325305193d213a5aa9eb5dd5bbabcb6`
- Install: `adb install xorv-clockin.apk`, or sideload on a Seeker. Host it as a GitHub Release asset for a direct download link.
- First run: **Connect wallet** (MWA, devnet) or **Use a dev wallet**. Get devnet SOL from the wallet sheet. The app defaults to devnet; the wallet sheet can switch to a local validator.

## Screens

`clockin/screens/` (captured on the iOS simulator, iPhone 17e, against a local validator): connect, today (clocked in), ask, job
delivered with hash verified, network and delivery notification, job in escrow, job refunded with slash.
