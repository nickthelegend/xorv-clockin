# XORV 1.2.0: every-button audit (no mocks)

Run on 2026-10-12 with a **Release** build (`xcodebuild -configuration Release`, cluster devnet) on the iPhone 17e
simulator (`8FFFCEA6-…`), dev wallet `HwMomZ6K…s6Mub`, program `GbtmzdtzLjPd1fZRmvVy7rnZzSMrUs6UfDJpZShEwXkw`.
Every on-chain row is a real Solana devnet transaction, checked with `solana confirm -u devnet <sig>` (all
`Finalized`). The provider node (`solana/node`, operator `FfbwjDvB…GHuC`, "clockin-demo") ran on this Mac with the
**echo adapter** only for the round trip and was then stopped; its answer says plainly that no AI model ran.

## The job round trip that used to fail

Public devnet answered `getProgramAccounts` with 429, so the app could not list jobs or providers and the node could not
find work. Reads were re-architected:

- **Jobs:** the app now posts with `nonce = UserStats.jobs_posted` (the on-chain counter), so a buyer's jobs are the PDAs
  `(buyer, 0..jobs_posted-1)`, read with one `getMultipleAccounts`. No scan.
- **Providers:** keyed by operator, so not derivable. One tightly filtered scan (discriminator + exact `dataSize` 183,
  `dataSlice` length 0) runs at most once a minute; every 5 s poll in between is one `getMultipleAccounts` over the
  known provider PDAs, and a rate-limited scan keeps the last known set.
- **Node:** each 3 s tick reads its own Provider account; the filtered job scan runs only when `open_jobs > 0`, at most
  every 10 s.

| Step | Who | Signature |
|---|---|---|
| Provider node clocks in (heartbeat day) | node | `5x5MpTLucPLwUNWHV5wdECaM7VbSvNk3Qt9gzA4Sh8XjGFtDJtws7h2qXUscxiKPy4G7kJNk1F1FGrmLSeNKtdJZ` |
| Buyer clocks in (day 2, +50 tSKR) | app | `3skpAdhzyR7t7XpJoySTc39mpnkWGapbQT5qBgP53rNkCC2UjFaX4BJkAWJ3ySa1MtP1AdHk7UnNYBLzYzG8Mokc` |
| **Post job** (2 tSKR into escrow, matched to clockin-demo) | app | `sbAoMu52oWxJYBe3RjK2dxvpocqCgzjWfiX8TNLv9xj1QGbVdfgFBkrCSTKgNFxXUDaz7MkuarpMDPNocQfoCyP` |
| **Provider picks it up, delivers, escrow released** (`submit_result`, done; answer hash stored) | node | `4zdrDHeEC63nUTtyBoQpqSarAJVxGSDREBczb1babPtPLBPuiw9MRubZ6f6mk5uvzT4AJTh55qiUsVWPYxTyRjwW` |
| Post a second job to the now-idle node ("Pay anyway") | app | `igMu8uHp6XMPbghQ1u8KwcNqujUeWA7k4Qq6ihroaovx3uZrPLtmPaZsYQYbHcB84PKcpLHCELgrdPuY6oY8w9J` |
| Deadline passes, buyer claims refund + 20% of the bond | app | `5XucZUqemzFr73sQePqLhdR9cMbaJvcbKXKBHxPc8McFKPKARj4efRtACzTac8mCfXnQCHg65yiztwHiwBqhcuYx` |
| Close the refunded job, rent back | app | `3ZpXjpmiU1koFZiHdUPhCNhCgTjT5ngakoD55cknJ4whwRRjjSyriTrXVk9SeGG5s2dkLiTBmMAQA4JjcA8Vq8tP` |

The program has no separate claim instruction: `post_job` assigns the provider and increments its `open_jobs`, and the
node "claims" by picking the job up from that counter. The app re-hashed the delivered answer and showed
"Hash verified on this phone"; the job list moved it to Delivered and fired the local notification path.

## Controls

| Screen | Control | Expected | Result | Tx signature (devnet) | Fix |
|---|---|---|---|---|---|
| Onboarding | Next | Pages 1→4 | Pass | | |
| Onboarding | Skip | Straight to the app | Pass | | |
| Today | Clock in (ring) | `check_in`, tSKR × streak | Pass: day 2, 25 → 75 tSKR | `3skpAdhz…G8Mokc` | |
| Today | Ask the network | Opens Ask | Pass | | |
| Today | Node pill ("1 node live" / "no node live") | Live count from heartbeats | Pass (changed after the node stopped) | | |
| Ask | Prompt field, 4 suggestion chips | Fill the prompt | Pass | | |
| Ask | Provider card (pick) | Selects that provider; idle needs confirmation | Pass | | |
| Ask | Pay 2 tSKR & ask (live node) | `post_job` | Pass | `sbAoMu52…NocQfoCyP` | Nonce now the on-chain counter |
| Ask | Pay to an idle node → alert Cancel / Pay anyway | Warns, then posts | Pass | `igMu8uHp…6oY8w9J` | |
| Ask | "No live provider" state | Button disabled until a node is picked | Pass | | |
| Jobs | Job rows | Open detail | Pass (list read without a scan) | | Jobs derived as PDAs |
| Job | Read more / Show less | Expand answer | Pass | | |
| Job | Copy answer | Clipboard holds the on-chain answer | Pass | | |
| Job | On-chain rows: copy, open in Explorer | Copy id / open Explorer | Pass | | Hashes and addresses replaced with words |
| Job | Claim refund + slashed bond | `refund` after the 10 min deadline (node stopped) | Pass: 2 tSKR back + 2 tSKR from the bond; provider bond 10 → 8 | `5XucZUqemzFr73sQePqLhdR9cMbaJvcbKXKBHxPc8McFKPKARj4efRtACzTac8mCfXnQCHg65yiztwHiwBqhcuYx` | |
| Job | Close job · reclaim rent | `close_job` returns the job account's rent | Pass (job leaves the list) | `3ZpXjpmiU1koFZiHdUPhCNhCgTjT5ngakoD55cknJ4whwRRjjSyriTrXVk9SeGG5s2dkLiTBmMAQA4JjcA8Vq8tP` | |
| Network | Provider list, stats | From chain | Pass (1 done, 2 earned, idle after stop) | | Operator address removed |
| Wallet chip | Opens wallet sheet | | Pass | | |
| Wallet sheet | Copy address | Clipboard holds the address | Pass | | |
| Wallet sheet | Get SOL from the faucet | Real airdrop; on refusal a toast | Rate-limited: "The devnet faucet is rate-limited…" | | Airdrop error text without a signature |
| Wallet sheet | Network selector (devnet / local validator) | Dev-only | Removed from release builds (`__DEV__`) | | A local validator does not exist on a phone |
| Wallet sheet | How it works | Replays onboarding | Pass | | |
| Wallet sheet | Disconnect | Back to Connect, sign-in proof cleared | Pass | | |
| Connect | Connect wallet (MWA) | Android: authorize + SIWS in one sheet | Not runnable on iOS; reviewed | | SIWS added |
| Connect | Continue with a dev wallet | Loads the same device key, signs SIWS | Pass (same account and jobs; "Signed in with Solana" in the sheet) | | SIWS added |
| Connect | How it works (link) | Replays onboarding | Not tapped in this run (same replay as the wallet sheet button, which passed) | | |

## Mocks and dev text removed

- `getProgramAccounts` scans that failed with 429 (jobs, providers, the node's poll); see above.
- Job nonces from `Date.now()` (not derivable) → the on-chain counter.
- Raw transaction hashes, account ids and the answer SHA-256 on the job screen; the operator address on Network; the
  dev-only network switch in the release wallet sheet; a signature inside the airdrop error.
- The receipt journal that blocked every new transaction forever after one dropped transaction (shared fix).

Grep (`mock|fake|dummy|placeholder|lorem|preview|stub|TODO|setTimeout`) leaves only a text-input placeholder, a
loading-skeleton comment, a comment naming the "Mock MWA Wallet" test app, and an answer-preview line count.

## Sponsor tech

- **Mobile Wallet Adapter** (Android, Seed Vault on Seeker), dev wallet on iOS, labelled.
- **Sign In With Solana** (new): MWA `authorize({ sign_in_payload })` with a `signMessages` fallback; the dev key signs
  the same message; verified on the phone and re-checked at start ("Signed in with Solana · verified on this phone").
- **Seeker Genesis Token** (new): read-only mainnet check of the connected account, shown in the wallet sheet.
- **SKR**: `tSKR`, a clearly labelled devnet stand-in, earned by clock-ins and paid into job escrow; provider bonds are
  tSKR and are slashed 20% to the buyer on a missed deadline.

## Still not real

- The provider in this run is the echo adapter (it says so in its answer). A real agent needs an operator to run
  `solana/node` with `XORV_ADAPTER=claude-code` (or another adapter) and their own model access.
- The in-app airdrop is usually rate-limited on public devnet; the dev wallet was topped up from the hub wallet.
