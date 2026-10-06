# Demo video: shot list

Target is 90 seconds for the core cut; the portal accepts up to about 3 minutes. **Narrate it.** Judges and the AI Coach read
the transcript, so a silent recording scores close to zero. Record on the Android emulator (`clockin_seeker`)
or a real Seeker, not only on the iOS simulator.

**Before recording**
1. A provider node is running and live (`solana/node`, see README). Its "beat Ns ago" on the Network tab is under 60 s.
2. The app's wallet has devnet SOL. If you use MWA, the wallet (Mock MWA Wallet, Phantom or Solflare on devnet) is installed, and the emulator has a PIN set.
3. You haven't clocked in yet today with this wallet, or you're using a fresh one, so the tap is live.

| Time | Screen | Action | Narration (say this) |
|---|---|---|---|
| 0:00–0:08 | Connect screen | Hold on the headline | "People pay for Claude Code and leave most of it idle. Xorv lets your phone hire that idle capacity, one job at a time." |
| 0:08–0:18 | Connect → wallet sheet | Tap **Connect wallet** and approve in the wallet sheet (Seed Vault or Mock MWA) | "One Mobile Wallet Adapter connection. On a Seeker this is Seed Vault." |
| 0:18–0:32 | Today | Tap the dial. The wallet signs, the ring turns green and the toast reads "+25 tSKR" | "Every day starts with a clock-in. It's an on-chain instruction, and the streak multiplies the reward up to seven times. Miss a day and it resets, and a notification reminds you when the next day opens." |
| 0:32–0:45 | Ask | Tap a suggestion chip and point at the ranked provider card (reputation, bond, price) | "Spend it on an AI job. The phone ranks providers from their on-chain record: live, then reputation, then how much SKR they've bonded." |
| 0:45–0:55 | Ask → sign | Tap **Pay 2 tSKR & ask** and approve | "One signature moves the price into an escrow account owned by this job. The provider hasn't been paid yet." |
| 0:55–1:10 | Job detail | The timeline runs Funded → Matched → Delivered. Answer appears with **✓ sha-256 matches chain** and the notification lands | "A real agent on someone's laptop answered. The same instruction that stored the answer released the payment, recorded its hash and bumped the provider's reputation. My phone re-hashed it, and it matches." |
| 1:10–1:20 | Network | Scroll the provider list | "No broker. Liveness, reputation and bonds are all read straight from Solana." |
| 1:20–1:30 | Jobs (an expired one, optional) | Show **Claim refund + slashed bond** | "If nobody answers in time, anyone can refund you, and twenty percent of the provider's SKR bond comes to you too. Clock in tomorrow." |

**Optional B-roll for the 3-minute cut:** the provider node terminal printing `job … answered in 20s … delivered + paid`, the explorer page for the post_job tx, and `./scripts/localnet-test.sh` showing 8/8.

**Don't show:** anything mainnet, or the iOS dev wallet presented as if it were MWA.
