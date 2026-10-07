# XORV 1.1.x: screen census (iOS simulator, iPhone 17e)

These were captured in flow order against a local validator (`solana/scripts/localnet-dev.sh`, with `JOB_TIMEOUT=90` so that a refund becomes reachable within the capture session). The provider node ran the **echo adapter**, and its answers state that no AI model ran. These are debug builds with the Expo dev-menu floating button hidden through `defaults write … EXDevMenuShowFloatingActionButton NO`. A release build never has that button. `CONTACT-SHEET.png` shows every capture at a glance.

| # | Route / state | What it shows | How to reach it | Known issues |
|---|---|---|---|---|
| 01 | Intro 1/4 | Clock in every day; streak up to ×7 | First launch (or Wallet → How it works) | none |
| 02 | Intro 2/4 | Ask for anything | Next | none |
| 03 | Intro 3/4 | Pay on delivery (escrow + hash) | Next | none |
| 04 | Intro 4/4 | No answer → refund + 20% of bond | Next | none |
| 05 | Connect (iOS) | Single primary CTA: dev wallet; copy explains MWA is Android-only | Get started | On Android the primary CTA is **Connect wallet** (MWA), not capturable on iOS |
| 06 | Today, new wallet | "Add a little SOL" notice, dial, week strip | Continue with a dev wallet | none |
| 07 | Ask, no providers | Empty provider state | Ask tab before any node registers | Captured just before the section label was shortened to "WHO ANSWERS / ranked from on-chain records" |
| 08 | Jobs, empty | Empty state with an Ask CTA | Jobs tab | none |
| 09 | Network, empty | 0 of 0 nodes; "No providers yet" | Network tab | none |
| 10 | Today, ready | Dial "DAY 1 · Clock in +25 tSKR ×1" | Get localnet SOL | none |
| 11 | Today, clock-in | Toast "Clocked in · +25 tSKR"; tSKR counts up (22.03 mid-animation) | Tap the dial | none |
| 12 | Notification permission | iOS permission prompt for the streak reminders | First clock-in | none |
| 13 | Today, clocked in | Green ring, day 1 filled, "Day 2 opens in …" | Allow | none |
| 14 | Today, scrolled | Stats, plus the "Spend it on an AI job" card with a real button | Scroll | none |
| 15 | Wallet sheet | Address with copy, balances, faucet, network switch, How it works, Disconnect | Tap the wallet pill | none |
| 16 | Ask, empty prompt | Input, wrapping example chips, live provider | Ask tab with the node running | none |
| 17 | Ask, filled | Selected chip, byte counter | Tap a chip | none |
| 18 | Ask, terms | Provider card (Live, model) and escrow terms (pay / release / refund + slash) | Scroll | none |
| 19 | Ask, paying | Pay button busy | Pay 2 tSKR & ask | none |
| 20 | Job, in escrow | Timeline with "Refundable in m:ss", labelled on-chain rows | After paying (node stopped) | Provider row predates the "Provider · name" label fix |
| 21 | Job, delivered | Delivery notification, Delivered badge, "Hash verified on this phone", collapsed answer | Node answers | none |
| 22 | Job, expanded | Full answer, Show less / Copy answer, on-chain rows incl. SHA-256 | Read more | none |
| 23 | Job, on-chain rows | Escrow tx, job account, provider, answer hash, each with copy/open | Scroll | Same scroll position as 22 |
| 24 | Network, live | Big stats, provider card with Live badge, reputation bar, done/failed/bonded/earned | Network tab | none |
| 25 | Jobs list | In escrow / Delivered badges, previews, amounts | Jobs tab | none |
| 26 | Job, expired | "Expired · refund ready", Claim refund + slashed bond | Wait past the deadline with the node stopped | none |
| 27 | Job, refunded | Refunded badge, "+2 tSKR from the bond", refund tx row, Close job | Claim refund | none |
| 28 | Network, after slash | Bond 10 → 8, failed 1, reputation 60% | Network tab | none |
| 29 | Today, large text | Accessibility XL Dynamic Type (capped at 1.6×; numbers fit to width) | Settings → larger text | none |
| 30 | Offline | "Can't reach Local validator" + Try again; Today shows "Your streak is safe" instead of a dead dial | Stop the validator | none |
| 31 | Devnet, not deployed | "Xorv isn't deployed on devnet yet" (what the APK shows until the devnet deploy) | Wallet → Solana devnet | Expected until `solana/scripts/deploy-devnet.sh` runs |

**Not capturable on the iOS simulator:**
- the Android "Install a Solana wallet" card, which appears when no MWA wallet is installed;
- the MWA authorize and sign sheets;
- the Android back gesture;
- the evening "streak at risk" notification, which is scheduled for 20:00 local, so it can't be captured in-session;
- the loading skeleton, which is too brief against a local RPC.

## 1.1.1: provider liveness fix

**Bug:** after a provider node was stopped, Network and Ask kept showing **Live**, because liveness used a 180 s window. The phone-side matcher used the same flag, so a paid job could be routed to a dead node.

**Fix:** liveness is now derived from heartbeat age, relative to the node's 30 s heartbeat interval (`apps/mobile/src/chain.ts`):
- **Live:** under 60 s (2× the interval).
- **Idle (amber):** under 5 min, labelled "last seen …".
- **Offline:** beyond 5 min, or paused by the operator.

The matcher auto-picks only Live nodes. Idle nodes rank after every Live node, and paying one needs an explicit confirmation. Offline nodes can't be picked. Badges tick every second. Unit tests: `apps/mobile/test/liveness.test.mts` (8/8).

| # | State | What it shows |
|---|---|---|
| 32 | **Before (1.1.0)** | Node stopped 155 s earlier, yet still badged **Live** and counted "1 of 1 nodes live" |
| 33 | After: Network, idle | "Idle · last seen 4m 35s ago" (amber); "0 of 1 nodes live" |
| 34 | After: Network, offline | Past 5 min: "Offline · last seen 5m 09s ago" |
| 35 | After: Ask, only offline | The card can't be selected; Pay reads "No live provider right now" and is disabled |
| 36 | After: Ask, live | Node restarted: "Live · 6s ago", auto-selected, normal Pay |
| 37 | After: Ask, idle | 67 s after the node stopped: Idle, **not** auto-selected; Pay is disabled, with a warning explaining the refund |
| 38 | After: Ask, idle picked by hand | Amber selection, ghost "Pay 2 tSKR to an idle node…" button, warning line |
| 39 | After: confirm | "nivesh-macbook looks idle" dialog with Cancel / Pay anyway |

All of these were verified on the iPhone 17e simulator against a local validator with the echo node: Live → Idle at about 60 s → Offline at 5 min, and a restart returned the node to Live.
