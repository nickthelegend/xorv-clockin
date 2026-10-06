# Xorv: pitch outline (9 slides)

Render later as Google Slides or a PDF (≤20 MB, ≤40 pages). The design follows the app: black, white, and grey,
with the gradient X mark as the only colour.

---

## 1 · Title
**Xorv: Clock in. Ask anything. Pay on delivery.**
Phone-first AI capacity network on Solana. Built for Seeker.

> Speaker: "Xorv turns the AI subscriptions people already pay for into a network your phone can hire,
> one job at a time, and you only pay when the answer lands."

## 2 · The problem
- People pay $20–200 a month for Claude Code or Codex and use a fraction of it.
- Anyone who needs *one* AI task done has to buy a whole plan.
- Paying a stranger is a trust problem. Either the buyer pays first and hopes, or the provider works first and hopes.

> Speaker: "Idle quota on one side, unmet one-off demand on the other, and no safe way to connect them."

## 3 · The product, on a Seeker
Three tabs: **Today**, **Ask**, **Jobs** (plus **Network**).
- Today: a single dial. Tap it to clock in and earn tSKR. A streak multiplier runs ×1 → ×7.
- Ask: type a task and pay with one Seed Vault signature.
- Jobs: an escrow timeline, and an answer with "✓ sha-256 matches chain".

> Speaker: show the clock-in dial screenshot. "This is the habit."

## 4 · Why people come back daily
- The **clock-in streak** pays SKR every day, and missing a day resets it. A local notification fires when the next day opens.
- **SKR you earn is SKR you spend.** The daily reward funds roughly one AI job a day at today's prices.
- Answers come back as **notifications**, so the loop is: open, clock in, ask, get pinged.

> Speaker: "We designed it so the daily reward and the product are the same thing: the streak buys you answers."

## 5 · How it works (the escrow)
Diagram from the README: post_job → vault → submit_result(done) releases payment + records hash + bumps reputation in **one instruction**.
- If the deadline passes, **anyone** can refund, and 20% of the provider's bond goes to the buyer.
- If the provider fails honestly, `reject` refunds instantly with no slash.

> Speaker: "Reputation can't be claimed, only earned. It changes in the same instruction that pays."

## 6 · SKR, three ways
| Earn | Spend | Stake |
|---|---|---|
| Daily clock-in × streak | Every AI job is priced in SKR | Providers bond SKR to be listed; slashed to the buyer on timeout |

Devnet runs a clearly labelled stand-in (tSKR). On mainnet the mint is SKR and clock-in pays from a funded pool.

> Speaker: "SKR isn't a sticker here. It's the currency, the reward, and the collateral."

## 7 · Brokerless: what Solana changed
The Hedera and Arbitrum versions needed a broker (matcher, WebSocket hub, x402 facilitator). On Solana the program
*is* the broker:
- heartbeat replaces liveness tracking
- the phone runs the matcher
- the job account holds the prompt and the answer

> Speaker: "Cheap state and fast blocks let us delete a whole service, so the APK only needs an RPC."

## 8 · Proof
- 8/8 Anchor tests on localnet: streaks, bond, chunked delivery, hash, refund and slash, reject.
- Verified end to end: an iOS simulator run on a local validator. Clock-in gave +25 tSKR. A job posted, a provider node answered in about 20 s, and the phone re-checked the hash. See `clockin/screens/`.
- Devnet program `GbtmzdtzLjPd1fZRmvVy7rnZzSMrUs6UfDJpZShEwXkw`. See SUBMISSION.md for the deploy status and tx links.

> Speaker: read only what is checked in SUBMISSION.md. Don't claim mainnet.

## 9 · What's next
- Mainnet SKR reward pool funded by a small job fee.
- Private prompts (encrypted to the provider's key).
- Provider mode on the phone: watch your node earn and toggle it.
- Seeker Genesis Token gating for anti-sybil daily rewards.
- dApp Store listing.

> Speaker: "Clock in tomorrow. Your streak is waiting."
