# HANDOFF: Xorv on Solana (CLOCK IN)

Status as of **Oct 7, 2026, ~19:00 IST** (polish round, 1.1.0). This file only claims what was actually run and seen.

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

- Path: `/Volumes/Extreme SSD/Projects/clockin/apks/xorv-clockin.apk` (48.8 MB), also the `clockin-v1` release asset (uploaded with `--clobber`, and the download's hash re-checked)
- SHA-256: `1fda16b048eb2a363a538026d6b40723db0c076809d63d39e67a7818ada98fbd`
- Package `tech.loompad.xorv`, version 1.1.0 / versionCode 3, signer SHA-256 `0bba90127978ca29cf02e3593263c5f70105ce38590bd96be879c1fa20c631c0`
- Rebuild: `cd apps/mobile && ./scripts/build-apk.sh` (prebuild if needed, patches release signing from the external properties file, Gradle heap capped at 3 GB)

## Polish round (1.1.0, Oct 7)

This work was done on branch `polish` and merged to main. It addresses the orchestrator's review (`clockin/review/XORV-POLISH.md`).

- **P0**
  - **Header:** the wallet pill is now a 44 pt control showing the address, wallet kind and cluster. The "gear" it collided with was the Expo dev-client floating button; it is hidden for captures and never ships in release builds.
  - **On-chain section:** labelled rows (escrow tx, refund tx, job account, provider, answer SHA-256), each with a short id, a copy button and an explorer button.
  - **Connect screen:** no stray tools gear, and one primary call to action per platform (Connect wallet on Android, dev wallet on iOS).
- **P1**
  - **Network:** big numbers, plus provider cards with a Live/Offline badge, a reputation bar and done/failed/bonded/earned.
  - **Ask:** focus state, byte counter, wrapping example chips, and an escrow-terms card next to Pay.
  - **Answers:** collapsible with Read more, with the "Hash verified on this phone" badge kept.
  - **Today:** a week strip (×1…×7) and a real "Ask the network" button.
  - **Type:** 12 pt minimum.
- **P2:** one Badge vocabulary for job states, empty states, and skeletons.
- **Basics**
  - a 4-step first-run explainer, replayable from the wallet sheet;
  - count-ups on tSKR and the streak, and haptics throughout;
  - offline, not-deployed, no-provider and no-wallet (Android) states;
  - Dynamic Type capped at 1.6× with numbers that fit their width, and 44 pt targets;
  - an evening "streak at risk" local notification (20:00 local, or 2 h before the on-chain day closes).
- **Honesty fix:** the provider node's echo adapter now answers "No AI model ran for this job" instead of the Hedera-era x402 text.
- **Evidence**
  - a census of 31 screens in `clockin/screens/all/` (`INDEX.md`, `CONTACT-SHEET.png`), captured on the iPhone 17e simulator against a local validator with the echo provider;
  - before/after comparisons of the P0 fixes in `clockin/screens/polish/compare-0{1,2,3}.png`;
  - `solana/scripts/localnet-test.sh` passes 8/8, and the app typecheck (`npx tsc --noEmit`) is clean.
- **APK:** version 1.1.0 / versionCode 3, built under the shared native-build lock with the same keystore, uploaded with `--clobber`, and the downloaded asset's SHA-256 re-checked.

## Android audit (Round 2, Oct 7; static inspection only, the APK was never run on a device)

Inspected the rebuilt APK with `aapt2 dump badging/xmltree`, `apksigner`, `unzip` and `strings`, plus the source.

| # | Check | Result |
|---|---|---|
| 1 | Package / version | `tech.loompad.xorv`, **1.0.1 / versionCode 2** (bumped from 1) ✅ |
| 1 | minSdk / targetSdk | 24 / 36 (Expo 57 default; above the 34/35 floor) ✅ |
| 1 | Permissions | INTERNET, POST_NOTIFICATIONS, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, plus expo-notifications' boot and badge permissions. **SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE and USE_FINGERPRINT are blocked** via `android.blockedPermissions` ✅ |
| 1 | Cleartext | **Fixed:** the app-wide `usesCleartextTraffic=true` is gone. `plugins/withLocalCleartext.js` adds a `network_security_config` that allows cleartext only to 10.0.2.2, 127.0.0.1 and localhost (for the optional "Local validator (dev)" cluster); everything else is HTTPS-only ✅ |
| 1 | `<queries>` for MWA | `solana-wallet` VIEW/BROWSABLE intent present (contributed by the MWA library), plus https VIEW for explorer links ✅ |
| 2 | MWA native module | `com/solanamobile/mobilewalletadapter/reactnative/*` found in classes*.dex (22 references) ✅ |
| 2 | `transact()` | `authorize({ chain: 'solana:devnet', identity, auth_token })`. Identity is `{ name: 'Xorv', uri: 'https://xorv.vercel.app', icon: 'brand/xorv-mark.svg' }`; **fixed** because the old icon path returned 404 |
| 2 | Re-authorize / no wallet | The cached auth_token is reused (MWA 2.x reauthorize); on failure the token is cleared and authorize is retried. **Added** an "Install a Solana wallet" card when no MWA wallet is installed (WalletNotInstalled / ERROR_WALLET_NOT_FOUND / ActivityNotFound), with the labelled dev wallet as fallback ✅ (logic only, untested on hardware) |
| 3 | JS bundle | `assets/index.android.bundle` present, **Hermes bytecode** (magic `c61fbc03`), so not loaded from Metro ✅ |
| 3 | Baked URLs | `api.devnet.solana.com` present; no `192.168.*`. `10.0.2.2` and `127.0.0.1` appear only as the opt-in Local validator cluster (default is devnet) ⚠️ intentional |
| 4 | Polyfills | `index.ts` imports `react-native-get-random-values` then sets `global.Buffer` before any web3.js import. `TextEncoder` usage was replaced with `Buffer.byteLength` ✅ |
| 5 | Hardware back | **Added** a `BackHandler` that goes job detail → list → Today → exit; the wallet sheet closes via `onRequestClose` ✅ |
| 5 | Notifications | Channels `streak` and **`jobs`** (added) created on Android 8+. The Android 13 permission prompt goes through `requestPermissionsAsync` before the first schedule ✅ |
| 5 | Keyboard / edge-to-edge | **Added** `KeyboardAvoidingView` and on-drag dismiss. Safe-area insets are used for the header and tab bar; the wallet sheet is `statusBarTranslucent` + `navigationBarTranslucent` with bottom-inset padding (Android 15 edge-to-edge) ✅ |
| 5 | Deep links / WebView / fonts | `xorv://` scheme registered; explorer links open through `Linking`. No WebView; system fonts only ✅ |
| 6 | Signing | `apksigner`: signer `CN=Xorv, O=Loompad, C=IN`, SHA-256 `0bba9012…c631c0`. This is the **same keystore** as the first build (no new key) ✅ |
| 7 | ABIs / size | arm64-v8a + x86_64, 48.8 MB ✅ |

After these changes the main flow was re-verified on the iPhone 17e simulator against a local validator: dev wallet, airdrop, clock-in (+25 tSKR), Ask (byte counter 43/512), job paid into escrow, delivered by the provider node (echo adapter; Ollama was not used this round), and "✓ sha-256 matches chain". The simulator, Metro and validator were then stopped.

**Still unverified:** any run on Android hardware, real MWA signing, notification delivery on Android, the back gesture, and keyboard behaviour on Android 15.

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
