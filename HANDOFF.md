# HANDOFF: Xorv on Solana (CLOCK IN)

Status as of **Oct 6, 2026, ~21:00 IST**. This file only claims what was actually run and seen.

## Verified working (with evidence)

| What | How it was verified |
|---|---|
| Anchor program `xorv` builds | `anchor build` (Anchor 0.32.1, solana-cli 3.1.11) → `solana/target/deploy/xorv.so` (419 KB) |
| Program logic | `solana/scripts/localnet-test.sh` → **8/8 pass**: init, clock-in (reward, once/day, streak ×2, missed day resets), register + bond minimum, post → chunked result → payout + sha-256 + reputation + vault closed + close_job, max_price guard, reject (refund, no slash), deadline (no early refund, no late delivery, permissionless refund + 20% slash), bond top-up / withdraw rules |
| App's hand-written client (`apps/mobile/src/chain.ts`) | `scripts/chain-smoke.mts` and `scripts/e2e-job.mts` run against a local validator: clock-in decoded, job posted, provider answered, **client-side hash verified = true** |
| Provider node (`solana/node`) | Localnet: registered with a 10 tSKR bond, heartbeats, picked up jobs, answered with a real local model (qwen2.5:1.5b via Ollama, ~20 s), settled on-chain in chunks. The **reject path** was also exercised: Claude Code wasn't logged in, so the node rejected and the buyer was refunded instantly |
| iOS app, simulator (iPhone 17e) against the local validator | Dev wallet, airdrop, **on-chain clock-in** (+25 tSKR, streak 1, dial turns green), notification permission, Ask with a ranked provider, **job escrowed → delivered → "✓ sha-256 matches chain"**, local notification "Your answer is in", Network tab, and a job left unanswered → **"Claim refund + slashed bond"** → refunded +2 tSKR from the bond (bond 10 → 8). Screenshots in `clockin/screens/ios-01…07` |
| Release APK builds and is signed | `apps/mobile/scripts/build-apk.sh` → `apksigner verify`: signer `CN=Xorv, O=Loompad, C=IN` (not the debug key); native code arm64-v8a + x86_64; SYSTEM_ALERT_WINDOW and storage permissions blocked |

## Not verified / not done (honest)

- **Devnet deployment: NOT DONE.** The deployer `Ftk563Wp1tdf5U1nyzF1BQwShvKPdHT9VY1FKGWo8ftE` has 0 SOL. Every devnet airdrop since 09:27 IST was rate-limited (a retry loop ran every 10 min), and the devnet-pow faucets are empty. The coordinator has the deployer on the user's funding list. **Because of this, no devnet tx links exist yet.**
- **The APK was not run on any device or emulator.** By user order the Android emulator is off (it used 18 GB of RAM). An emulator I booted was shut down before the app was launched. MWA signing (`transact` / `authorize` / `signAndSendTransactions`) is therefore **untested on hardware**. The code follows the MWA 2.3 docs: dynamic import, base64 address, auth-token cache, v0 tx, `minContextSlot`.
- **The APK defaults to devnet.** Until the program is deployed there, the app shows "program not deployed here yet". The wallet sheet can switch to "Local validator (dev)" (`10.0.2.2:4510` on the Android emulator), which is why `usesCleartextTraffic` is on.
- **Claude Code adapter:** the code path is the existing `@xorv/cli` adapter, but on this Mac `claude -p` fails with "OAuth session expired", so the demo answers came from a local open model. Answer quality from a 1.5B model is weak (it got "PDA" wrong). Use `claude-code` for the real demo.
- No Seeker Genesis Token gating, no mainnet SKR pool, no private prompts (see PORT-PLAN cut list).
- The Hedera-era packages (`packages/*`, `services/broker`, `apps/app`, `apps/landing`) were not modified or re-tested, apart from building `@xorv/protocol` and `@xorv/cli` so the node can import the adapters.

## What the user must do

1. **Fund the devnet deployer** with about 3.2 SOL: `Ftk563Wp1tdf5U1nyzF1BQwShvKPdHT9VY1FKGWo8ftE` (faucet.solana.com, or a transfer from any devnet wallet). Then:
   ```bash
   cd "/Volumes/Extreme SSD/Projects/clockin/xorv-clockin"
   solana/scripts/deploy-devnet.sh          # deploy + initialise; writes solana/deployments/devnet.json
   ```
   Paste the deploy tx and `initTx` into `clockin/SUBMISSION.md` → Devnet. The program ID is fixed, so **the APK needs no rebuild**.
2. **Run a provider node on devnet** for the demo (it needs ~0.1 devnet SOL on `.keys/provider-node.json`, pubkey `FfbwjDvB8Ko1PLxvFPurvSBF9WeKDcbAKLxH6ZDqGHuC`):
   ```bash
   claude   # log in once so the claude-code adapter works
   cd solana && RPC_URL=https://api.devnet.solana.com XORV_NODE_NAME=nivesh-macbook XORV_ADAPTER=claude-code npx tsx node/index.ts
   ```
3. **Test MWA on a real device** (a Seeker, or an Android phone with Phantom/Solflare set to devnet), and record the demo there following `clockin/DEMO-SCRIPT.md`. **Narrate it.**
4. Host the APK as a direct download (a GitHub Release asset) and record its URL in the submission form.
5. Keep the release keystore safe. It lives **outside git** at `/Volumes/Extreme SSD/Projects/clockin/keys/xorv-release.keystore`, with the passwords in `xorv-release.properties` next to it. Back both up; the dApp Store needs the same key forever.
6. Render `clockin/PITCH.md` into slides, submit on the portal, and pick which ONE CLOCK IN app to enter (one submission per person).

## APK

- Path: `/Volumes/Extreme SSD/Projects/clockin/apks/xorv-clockin.apk` (48.8 MB)
- SHA-256: `5aaf0e9259f45a2a12e168906c114c2c7325305193d213a5aa9eb5dd5bbabcb6`
- Package `tech.loompad.xorv`, versionCode 1, signer SHA-256 `0bba90127978ca29cf02e3593263c5f70105ce38590bd96be879c1fa20c631c0`
- Rebuild: `cd apps/mobile && ./scripts/build-apk.sh` (prebuild if needed, patches release signing from the external properties file, Gradle heap capped at 3 GB)

## Decisions made autonomously

- **The source repo was Hedera, not Arbitrum.** `xorv` main (`dfcd010`) is the Hedera x402 version. The port follows the Arbitrum design (escrow + Stylus registry) from the sibling `xorv-arbitrum` repo, read-only. The Hedera README and submission were moved to `docs/history/`.
- **Brokerless.** The broker/x402 layer was cut: the program does liveness, settlement and reputation, and the phone does matching. This makes the APK work against an RPC alone, with no hosted service and no new cloud deploys.
- **Payment token = SKR.** On devnet that is a program-owned stand-in mint (`tSKR`) whose authority is the config PDA, so clock-in can mint rewards. It is labelled "devnet stand-in for SKR" in the UI. Mainnet would use real SKR with a funded pool.
- **SKR bond with slashing** is the creative SKR hook, together with earn (clock-in) and spend (jobs). Note: the bond is collateral, not a staking product, but judges may see it as "staking". The earn/spend loop stands on its own.
- **No Anchor runtime on the phone.** Instructions and accounts are hand-encoded from the IDL (`apps/mobile/src/chain.ts`), which keeps Hermes free of Node polyfills. It was verified against the program by the smoke/e2e scripts.
- **The Expo app is outside the pnpm workspace** (`!apps/mobile`, installed with npm) so Metro doesn't fight pnpm symlinks.
- **Spaces in the path** (`/Volumes/Extreme SSD`) break two iOS build phases. `apps/mobile/scripts/fix-spaces.sh` (postinstall) quotes them. iOS DerivedData lives on a space-free sparse image, `/Volumes/xorvdd` (file `clockin/.cache/xorv-derived.sparseimage`).
- **Local AI for the demo node:** Ollama on port 4581 with models stored at `xorv-clockin/.cache/ollama` (gitignored). It is stopped when not in use (memory).
- **Job timeout** 600 s and day length 86 400 s on devnet. Slash is 20%, min bond 10 tSKR, daily reward 25 tSKR × streak (cap ×7), default price 2 tSKR.

## Ports, processes, cleanup

Ports used: 4510 (validator RPC), 4511 (WS), 4512/4519/4520–4560 (validator), 4581 (Ollama), 8581 (Metro).
To stop everything: `pkill -f "rpc-port 4510"; pkill -f "node/index.ts"; pkill -f "ollama serve"; pkill -f "expo start --port 8581"`.
`hdiutil detach /Volumes/xorvdd` frees the DerivedData image; delete `clockin/.cache/xorv-derived.sparseimage` to reclaim the space.

## Keys (all gitignored, never committed)

`.keys/devnet-deployer.json` (deployer + config admin), `.keys/xorv-program.json` (program ID keypair; keep it, it is the upgrade target), `.keys/provider-node.json` (demo provider). Release keystore: outside the repo (see above).
