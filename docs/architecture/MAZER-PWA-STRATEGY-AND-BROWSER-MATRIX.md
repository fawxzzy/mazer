# Mazer PWA Strategy and Browser Matrix (Draft)

Status: DRAFT, unsigned
Date: 2026-11-05
Base: `origin/main` at the commit this branch was cut from (`1670c8af`)
Board card: `mazer-installable-pwa-offline-shell` (state `open`, priority high, 0 percent, "Planning admission"; next actions: "Choose PWA strategy and browser matrix. Complete offline contract before caching mutable progress.")

This document inventories the shipped PWA/offline-shell machinery, then proposes the cache strategy, update lifecycle, account-aware access rules, and a browser/device matrix. No code, deploy, provider, or environment change is made or authorized here.

Labels, never merged: **DOCUMENTED FACT** (read in this repo at the base above), **EXTERNAL EVIDENCE** (outside the repo; this document cites none and marks browser behavior claims "external, unverified"), **PROPOSAL**.

## 1. Card requirements

**DOCUMENTED FACT** (archived board file, last edited 2026-09-02; see `docs/ops/MAZER-BOARD-RECONCILIATION-2026-11-05.md`)

- Status text: "Native browser install prompts cannot be reliably entitlement-blocked. The shell remains installable while playable access is enforced by app/server entitlement and offline policy."
- Acceptance: supported devices can install and open offline; updates cannot silently corrupt checkpoints or assets; access uses entitlement, not install-prompt control.
- Proof plan: install/update/offline boot tests in supported profiles.

## 2. Inventory of what ships today

### 2.1 Build configuration (`vite.config.ts`)

**DOCUMENTED FACT**

- `VitePWA` with `filename: 'app-sw.js'`, `registerType: 'autoUpdate'`, `injectRegister: false` (registration is done by app code), `manifest: false` (the manifest is the hand-maintained `public/manifest.webmanifest`), `devOptions.enabled: false` (no service worker in `vite dev`).
- `includeAssets` lists the favicon and the generated icon set (`favicon.ico`, `icons/mazer-app-icon.ico`, `icons/mazer-app-icon.png`, `icons/apple-touch-icon.png`, 192/512 standard and maskable PNGs).
- Workbox options: `cacheId: 'mazer-v1'`; `ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/]` (so `?v=` icon URLs map to revisioned precache entries); `navigateFallbackDenylist: [/^\/__/, /^\/@vite\//, /[?&](?:code|state|error|error_description)=/]`; `skipWaiting: true`; `clientsClaim: true`.
- Two `runtimeCaching` rules, both `NetworkOnly`: (1) same-origin navigations carrying `code`, `state`, `error`, or `error_description` query parameters (OAuth callbacks carry one-time authorization material), and (2) the project's Supabase OAuth token endpoint (`/auth/v1/oauth/token`).
- No other runtime caching rule exists. In particular, no rule caches Supabase REST/RPC calls, progression, profile, leaderboard, or any account data.
- `globPatterns` and `navigateFallback` are not set, so the plugin's defaults apply to what is precached and which page serves as the navigation fallback. The exact precache contents were not enumerated in this session (no build run). A prior packet records `35` precache entries for a build (`docs/ops/MAZER-AUTHORITATIVE-PROGRESSION-HYDRATION-2026-08-27.md`).
- The build has multiple HTML inputs (`index.html`, `proof-surfaces.html`, `watch-pass-*.html`, `visual-proof.html`, `future-phaser.html`, `planet3d.html`). Whether the non-main pages are precached under the default patterns was not verified here (UNKNOWN).
- `vercel.json`: a permanent redirect from the legacy host to the branded host (excluding `/sw.js`), and rewrites of `/update-password`, `/privacy`, `/terms` to `/index.html`. Deployment from git is disabled in this file.

### 2.2 Registration and update lifecycle (`src/boot/serviceWorkerLifecycle.ts`, `src/boot/main.ts`)

**DOCUMENTED FACT**

- `installMazerProductionServiceWorker`: never registers on `localhost`, `127.0.0.1`, or `::1`; returns false when service workers are unsupported; registers `/app-sw.js`, then calls `registration.update()`; starts registration exactly once; registers immediately when the document is already `complete` and otherwise on `load`; reports errors through a callback (`markMazerBootStatus('service-worker-error', ...)`) instead of throwing.
- `main.ts` calls registration after the Phaser game is created (the last step of boot), and only installs the controller-change reload on non-localhost hosts.
- `installMazerServiceWorkerControllerReload`: reloads the page once when the controller changes, never more than once per page lifetime. This is what moves a long-lived installed session onto a new build, since `skipWaiting` and `clientsClaim` swap the worker but not the already-loaded JavaScript.
- On localhost, boot unregisters every same-origin registration, deletes caches whose key contains `mazer` or `workbox-precache`, and reloads once (guarded by a session-storage flag) to keep development free of stale caches.
- Discrepancy: `docs/ops/MAZER-PWA-OFFLINE-SHELL-RELIABILITY-PACKET-2026-07-27.md` says the reload guard is "bounded to one reload per ten-second window". The source and its test ("never reloads more than once even if the controller changes again") implement once per page lifetime, with no ten-second window. The source and test are treated as current; the packet text is stale on this point.
- The reliability packet's root cause (registration previously attached only to a future `load` event, so it never ran when boot finished after `load`) is the reason the lifecycle is a pure runtime contract today.

### 2.3 Legacy self-unregistering worker (`public/sw.js`)

**DOCUMENTED FACT**: `public/sw.js` is not the current worker (`app-sw.js` is). It is a retirement worker for clients that still have the old registration: on install it calls `skipWaiting`; on activate it deletes every cache, claims clients, unregisters itself, and navigates clients on the legacy host to the same path on the branded host (and reloads clients already on the branded host). `vercel.json` deliberately excludes `/sw.js` from the host redirect so legacy clients can still fetch it. Test: `tests/reset/pwa-manifest.test.ts` ("retires the legacy service worker before host migration").

### 2.4 Manifest (`public/manifest.webmanifest`)

**DOCUMENTED FACT**: `id` and `scope` `/`, `start_url` `/`, `display` `standalone` with `display_override` `["standalone", "minimal-ui"]`, `orientation` `portrait-primary`, `prefer_related_applications` false, a `Play Mazer` shortcut to `/?mode=play`, and icons 192/512 (any and maskable) plus a 1024 any icon, all with a `?v=mazer-final-icon-v2` query. Tests: `tests/reset/pwa-manifest.test.ts` ("declares standalone app behavior, safe scope, and a direct play shortcut"; "keeps mobile/PWA head metadata and production-only service worker registration explicit"). Icon delivery and Workbox coverage are checked by `npm run brand:icons:check` (`scripts/brand/verify-mazer-icon-delivery.mjs`, per `docs/mobile-plan.md`); that check requires a build and was not run here.

### 2.5 Install surface and install gate (`src/boot/installSurface.ts`, `src/boot/installGate.ts`)

**DOCUMENTED FACT**

- `installSurface` captures `beforeinstallprompt` (and calls `preventDefault`), tracks `appinstalled`, standalone display mode (`navigator.standalone` or `(display-mode: standalone)`), and a persisted dismissal flag (`mazer-install-surface-dismissed-v1` in local storage). It resolves one of four modes: `hidden`, `available` (a native prompt is retained), `manual` (iOS-style device with no native prompt: "Use Share > Add to Home Screen"), `ios-open-in-browser` (an iOS in-app browser matched by a user-agent pattern; a hard block that ignores the dismissed preference).
- `installGate` runs during boot, before the Phaser game exists, on non-localhost hosts (or with `?forceInstallGate=1`), unless the boot is a legal route, an accepted or requested OAuth callback, or a password-recovery route. It shows an overlay whenever the install-surface mode is not `hidden`. The overlay offers an "Install" button only when the mode is `available` and a native prompt can be replayed; `showSkip` and `showCopyLink` are false in every mode.
- Consequence read from the source (not browser-verified): in a non-installed, non-dismissed session on a browser that fires `beforeinstallprompt` (Chromium family), on iOS Safari (manual), and on iOS in-app browsers, boot waits at the install overlay. A dismissed native prompt, an accepted install, or standalone display makes the surface `hidden` and boot continues. The gate has no skip in the `manual` and `ios-open-in-browser` modes, so there the only exits are installing or leaving the in-app browser. Browsers that neither fire `beforeinstallprompt` nor look like iOS (for example desktop Firefox or Safari) resolve to `hidden` and are not gated.
- This is in tension with the board card ("The shell remains installable while playable access is enforced by app/server entitlement"; "access uses entitlement, not install-prompt control"). It is a current-behavior fact and an owner decision (section 8), not a recommendation to change code in this packet.
- Tests: `tests/reset/install-gate.test.ts` (gating by mode, bypass for recovery/OAuth/legal routes, one shared three-step copy and the Install action only for prompt-capable browsers, wiring order in `main.ts`); `tests/reset/install-surface.test.ts` (iOS-only manual instruction, standalone precedence, `beforeinstallprompt`/`appinstalled` handling, dismissal, iOS in-app browser hard block).
- Commit `c3fd0408` ("Keep OAuth callback error path ahead of install gate", PR #367, 2026-11-05) is the most recent change to the gate and is part of the base.

### 2.6 What is not in place

**DOCUMENTED FACT** (by search of the files above and `src/`)

- No offline fallback page distinct from the precached app shell; no `offline.html`.
- No background sync, push, periodic sync, or badge usage.
- No cache or runtime strategy for account data (by design: the reliability packet says account, progression, entitlement and provider data are not in the service-worker cache contract).
- No entitlement-aware boot state.
- No in-app "update available" prompt: updates apply automatically through `skipWaiting`, `clientsClaim`, and the one-time reload.
- `docs/mobile-plan.md` (April 2026) states the stance "service worker disabled in local development; enabled only in production builds/deploys", and describes a Capacitor shell as a later option.

## 3. Cache strategy (proposal)

1. Immutable shell only. Precache the versioned build output via Workbox (as now). Never cache account, progression, profile, leaderboard, entitlement, or provider responses in the service worker; those live in app-level account-scoped storage governed by `docs/architecture/MAZER-OFFLINE-SYNC-CONTRACT.md`.
2. Keep the existing `NetworkOnly` rules for OAuth callbacks and the token endpoint, and add an explicit `NetworkOnly` (or no handler) rule for every Supabase REST/RPC/auth origin so that a future default cache rule cannot capture them. A source-contract test should pin it (like the current OAuth test).
3. Navigation fallback stays the precached app shell for same-origin navigations, with the denylist kept. Legal and recovery routes (`/privacy`, `/terms`, `/update-password`) stay served from the shell as tested.
4. Asset versioning: content-revisioned precache plus the `?v=` ignore rule for icons (existing). Proposed: enumerate the expected precache manifest in a build check so that an unexpected page (for example a proof surface) cannot ship into the user-facing offline shell by default. Whether such pages are precached today is UNKNOWN.
5. Data retention: caches are versioned by `cacheId` and Workbox revisioning; the legacy worker already purges all caches once. A cache purge must never touch account-scoped local storage (outbox, progression) because the service-worker cache and local storage are separate stores. Add a diagnostic that reports cache version and last update check time.

## 4. Update lifecycle (proposal)

1. Keep `autoUpdate` with `skipWaiting` and `clientsClaim`, because the shell is immutable and a stale shell is the larger risk.
2. Make an update safe for in-flight data before the controller-change reload fires. The existing reload happens without checking pending work. Proposal: before reloading, require that the completion outbox write path is idle (no in-flight local write). Because the outbox is durable local storage and idempotent by run id, an interrupted flush is safe to retry after the reload; the check is to avoid a reload during a local write, not to preserve memory state. Mid-attempt play state is not persisted today (see the offline-sync contract), so a reload during a maze attempt loses that attempt. Decide whether to defer the reload while a play attempt is active or to accept the loss.
3. Version coupling: storage schema versions (progression baseline versions, outbox version 1) must be forward-compatible with the previous shell for the overlap period of one update; a new shell may migrate, an old shell must fail safe when it reads newer data (the current baseline-version logic rebases older data forward; behavior of an older shell reading a newer baseline is UNKNOWN and should be tested).
4. Rollback: redeploy the previous build; the service worker is versioned by the generated build and updates via the same path (per the reliability packet's rollback section).

## 5. Account-aware access rules (proposal)

1. The service worker never decides access. It serves the shell to everyone; the app decides at boot using account state and, when it exists, the cached entitlement lease (policy in `docs/research/MAZER_ECONOMY_AND_ENTITLEMENT_CONTRACT_DRAFT.md`).
2. Boot states (names are proposals): `guest`, `signed-in`, `entitled`, `offline-grace`, `grace-expired`, `error-retryable`. Every state has a defined menu and play behavior and a player-safe message; none exposes raw backend text.
3. Installation is not an access control. Whatever the install gate does, entitlement is enforced separately by app and server. Decide whether the gate itself stays (section 8).
4. OAuth and password-recovery routes bypass the install gate and are network-only (existing behavior, tested); account switching clears no shell cache.

## 6. Browser and device matrix

Legend. **VERIFIED-BY-TEST** means a test in this repo exercises that logic; the cited test is listed, and its scope is stated. Most cited tests are unit tests with simulated user-agent and event inputs, or source-contract tests that assert on file text; none runs a real browser engine, installs a real PWA, or goes offline. **NOT VERIFIED** means no test or recorded proof exists and a real device or browser is required. A cell is never both. Tests were located and read; they were not executed in this session.

Browser behavior claims below (which browsers fire `beforeinstallprompt`, whether iOS permits install from a given surface) are **external, unverified in this session**; the repo's `docs/research/MAZER_INSTALL_SURFACES.md` and `MAZER_INSTALL_DECISION_MATRIX.md` discuss them qualitatively without citations. The matrix rows describe expected behavior to be confirmed.

| Profile | Install-state logic | Install gate behavior | SW registration (prod host) | Offline shell boot | Update + controller reload | OAuth callback network-only |
| --- | --- | --- | --- | --- | --- | --- |
| Chromium desktop (Chrome/Edge), browser tab | VERIFIED-BY-TEST (`install-surface.test.ts`: `beforeinstallprompt` drives the single action; accepted install hides it). Real prompt: NOT VERIFIED | VERIFIED-BY-TEST for mode-to-gate mapping (`install-gate.test.ts`). Real overlay: NOT VERIFIED | VERIFIED-BY-TEST for lifecycle timing (`production-service-worker.test.ts`). Real registration: NOT VERIFIED | NOT VERIFIED (no recorded post-fix offline reload; the 2026-07-27 packet requires it as visible proof) | VERIFIED-BY-TEST for the reload-once logic (`production-service-worker.test.ts`, "service worker controller reload"). Real swap: NOT VERIFIED | VERIFIED-BY-TEST as a source contract (`production-service-worker.test.ts`, "keeps OAuth callback navigations and token exchange network-only"). Real flow: NOT VERIFIED |
| Chromium desktop, installed standalone | VERIFIED-BY-TEST (standalone precedence hides the surface, `install-surface.test.ts`). Real install: NOT VERIFIED | VERIFIED-BY-TEST (hidden when standalone). Real: NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Chrome / Edge on Android, browser tab | VERIFIED-BY-TEST for logic only; real prompt NOT VERIFIED | as above, logic only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Android installed (standalone) | VERIFIED-BY-TEST for standalone logic only | logic only | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Samsung Internet, Firefox Android | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Firefox desktop | No `beforeinstallprompt` expected (external, unverified); resolves to `hidden` per `resolveInstallSurfaceState` logic (VERIFIED-BY-TEST for the logic with no prompt and no iOS signal). Real browser: NOT VERIFIED | not gated per source reading; real: NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Safari macOS | same as Firefox desktop: logic VERIFIED-BY-TEST; real NOT VERIFIED | same | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Safari iOS/iPadOS, browser tab | VERIFIED-BY-TEST: iOS detection and the manual "Share > Add to Home Screen" instruction (`install-surface.test.ts`, "manual install instructions are only emitted for iOS-style browsers"). Real: NOT VERIFIED | VERIFIED-BY-TEST: the manual mode shows the gate with no skip (`install-gate.test.ts`). Real: NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| iOS home-screen standalone | VERIFIED-BY-TEST for `navigator.standalone` precedence; shell color consistency across page, canvas, and install metadata is pinned as a source contract (`tests/reset/legacy-safe-area-background.test.ts`); real-device safe-area and bottom-gap rendering is NOT VERIFIED | hidden when standalone (logic) | NOT VERIFIED | NOT VERIFIED (storage eviction and cold-start offline on iOS are open) | NOT VERIFIED | NOT VERIFIED |
| iOS in-app browsers (TikTok, Instagram, Facebook, Discord, and others in the pattern) | VERIFIED-BY-TEST: user-agent pattern detection and hard block that ignores dismissal (`install-surface.test.ts`, "detects iOS in-app browsers..." and "iOS in-app browser hard-blocks..."). The pattern list is a heuristic, real apps: NOT VERIFIED | VERIFIED-BY-TEST: hard-block copy, no action (`install-gate.test.ts`). Real: NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Localhost development | VERIFIED-BY-TEST: gate skipped unless `?forceInstallGate=1` (`install-gate.test.ts`); registration refused for local hosts (`production-service-worker.test.ts`, "never registers on local development host") | skipped | not registered | n/a | n/a | n/a |
| Legacy host clients with the old worker | n/a | n/a | VERIFIED-BY-TEST as a source contract (`pwa-manifest.test.ts`, "retires the legacy service worker before host migration"). Real migration of an installed client: NOT VERIFIED | n/a | n/a | n/a |

Cross-cutting items that no test can prove and need real devices or a live deployment (all NOT VERIFIED):

- A warm online load followed by a successful offline reload of the actual shell on each profile (the missing visible proof named by the 2026-07-27 reliability packet).
- Update behavior of an installed, never-force-quit session across a new deploy.
- Storage eviction (service-worker caches and local storage) under storage pressure or after long disuse, especially on iOS.
- Install gate usability on real iOS and Android devices.
- Behavior while offline with OAuth in flight.

## 7. Verification plan (proposal)

1. Add source-contract tests for any new Workbox rule (pattern from `production-service-worker.test.ts`).
2. Add a build-output check that enumerates the precache manifest against an allowlist of user-facing pages and assets.
3. Run a scripted browser check (the repo already uses Playwright for visual and live-soak scripts, for example `scripts/analysis/live-auth-persistence-soak.mjs`) for: warm load, go offline, reload, shell boots, no network error. This proves one Chromium profile only and must not be reported as proof for other profiles.
4. Record manual real-device passes for iOS Safari, iOS standalone, Android Chrome, and one desktop Chromium install, with date, device, OS and browser version, and the build commit, in a dated ops packet. Until then the matrix cells stay NOT VERIFIED.
5. Never cache mutable progress before the offline-sync contract is signed (the card's own ordering).

## 8. Provider-gated / out of scope

No deploy, alias, or Vercel environment change, no Supabase change, no payment or store step, and no Capacitor or store packaging is started or authorized here. Native store billing and TWA/Capacitor packaging are future research (`docs/research/MAZER_INSTALL_DECISION_MATRIX.md`).

## Decisions needed from the owner

1. Should the install gate keep blocking boot in `available`, `manual`, and `ios-open-in-browser` modes, or should the shell be installable but never required (the card's wording)? Today it blocks without a skip in the manual and in-app modes.
2. Reload policy on update: always reload at controller change, defer while a play attempt is active, or prompt the player.
3. Whether non-main HTML pages (proof surfaces, watch-pass previews, visual-proof, planet3d, future-phaser) belong in the production precache or must be excluded.
4. Supported browser/device profiles for release and the minimum proof for each (section 7).
5. Whether mid-attempt state should ever be persisted (affects update safety and offline resume).
6. Entitlement-aware boot state names and messages.
7. Whether the stale "ten-second window" statement in the 2026-07-27 reliability packet should be corrected in that packet.

## UNKNOWN

- Whether a post-fix online-then-offline reload was ever performed on a real production build (the packet requires it; no result is recorded in the repo).
- The actual precache contents of a current build and whether non-main pages are included.
- Real behavior of every NOT VERIFIED cell, including which browsers fire `beforeinstallprompt` at this site (external, unverified).
- Behavior of an older shell reading storage written by a newer shell.
- Whether the iOS in-app browser user-agent pattern matches the current versions of those apps.
- Test results at this base (tests were read, not run).
