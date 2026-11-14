# Mazer offline shell proof (MAZER-PWA-004, headless part)

Date: 2026-11-13
Card: MAZER-PWA-004 "Settle the install gate policy and prove the offline shell"
Script: `scripts/analysis/verify-offline-shell.mjs` (pure helpers in `scripts/analysis/lib/offline-shell-proof.mjs`, unit tests in `tests/analysis/offline-shell-proof.test.mjs`)

## Scope

This document covers only the part of the card that needs no owner decision: a repeatable, headless proof that the production build's service worker precaches the shell and that the game boots and plays with the network gone. It does **not** change the install gate policy. "Keep the gate mandatory" is still an open owner decision (see `docs/ops/MAZER-INSTALL-GATE-POLICY-2026-11-05.md`); the gate table below only records what the gate does today.

Everything here is headless Chromium driven by Playwright. Nothing was checked on a real device (see "What is NOT proven").

## How to run it

```
node scripts/analysis/verify-offline-shell.mjs [--json] [--port=5615] [--out=report.json]
                                               [--dist-a=<dir> --dist-b=<dir>] [--keep]
```

- Exit code 0 = every check passed, 1 = a check failed, 2 = the script itself broke.
- `--json` prints one JSON report on stdout (progress goes to stderr); `--out` also writes it to a file.
- Without `--dist-a/--dist-b` it builds twice with the repo's own `vite.config.ts` (real `vite-plugin-pwa` / Workbox pipeline) into a temp folder: build A as shipped, build B = A plus one marker line appended to `src/boot/main.ts` (so B has a genuinely different precache manifest). About 90 s end to end.
- An `npm run` entry would be convenient (`"verify:offline-shell": "node scripts/analysis/verify-offline-shell.mjs"`); it was not added because `package.json` is owned by Wave 5B.

### Why not `vite preview`

The proof must register the **production** service worker, and the app never registers it on `localhost` / `127.0.0.1` / `::1` (it actively unregisters it there). So the script serves the built `dist` from a small static server on `mazer-proof.localhost:<port>`: Chromium resolves `*.localhost` to loopback and treats it as a secure context, but the app does not treat it as localhost, so the service worker and the install gate behave as on `mazer.fawxzzy.com`. The server mimics Vercel (`cache-control: public, max-age=0, must-revalidate`, `/update-password`, `/privacy`, `/terms` rewritten to `index.html`, everything else 404) and lets the script swap which build it serves, which `vite preview` cannot do.

"Offline" is two things at once: `context.setOffline(true)` (Chromium) **and** a server that kills every connection. The second matters because Chromium's offline emulation does not cover the service worker's own fetches (the first draft of this proof saw the worker's update check and stale-while-revalidate requests reach the server while "offline").

The signed-in state is faked the way the other capture scripts do it (`?runtimeDiagnostics=1&authFixture=authenticated`, or the `?previewLevel=1` QA route). The install context is faked with the same `matchMedia` / `navigator.standalone` overrides as `capture-ui-surfaces.mjs`.

## What is proven (19 checks, all pass on the fixed tree)

| # | Check | Result |
| --- | --- | --- |
| 1 | `sw-registered-and-active` | First online load registers `/app-sw.js`, one registration, scope `/`, and the page ends up controlled by it |
| 2 | `precache-complete` | Cache Storage holds all 40 entries of the generated precache manifest (parsed from `app-sw.js`), none missing |
| 3 | `precache-has-critical-shell-files` | `index.html`, main js/css, phaser and vendor chunks, UI font, 192/512 icons and favicon are cached (pattern check, not just a count) |
| 4 | `boot-art-cached-for-offline` | The 3 HUD icons and the tile-font atlas (png + json) are in the `mazer-boot-art-v1` runtime cache (see finding 1) |
| 5 | `game-boots-online-first-load` | Menu scene settles online |
| 6 | `offline-reload-boots-menu` | Network down, `page.reload()`: menu scene created, canvas present, no install gate (standalone context) |
| 7 | `offline-level-1-starts-and-player-moves` | Offline, `startPlayMode()` accepted, input unlocks, 4 real shortest-path moves take the player from (12,1) to (12,5) |
| 8 | `offline-no-failed-app-requests` | 13 app-origin requests during offline reload and play, all 13 answered by the service worker, 0 failures, 0 requests to any origin other than the app (and the account provider) |
| 9 | `offline-only-service-worker-background-fetches-attempt-network` | The only connection attempts that reached the (dead) server were the worker's own background fetches (`/app-sw.js`, `/workbox-*.js`, boot-art revalidation); no page request tried the network |
| 10 | `offline-cold-launch-boots-and-plays` | A new tab opened while offline on `/?previewLevel=1` boots and the player moves |
| 11 | `offline-sign-in-shows-provider-unreachable` | Signed out and offline, the cold launch itself tries the hand-off to the account host (MAZER-ACCT-040, no tap), and the fallback screen holds `errorCode = provider_unreachable`, message `Sign-in is unavailable right now. Try again in a few minutes.`, and that text is drawn on the canvas |
| 12 | `offline-sign-in-does-not-hang-or-navigate` | The fallback screen with the failure line is up after the launch (time recorded in the report), `authSubmitting` is false, a Sign in control is present, the page did not navigate away |
| 13 | `offline-cold-launch-no-failed-app-requests` | Cold launch plus sign-in: 26 app requests, 26 from the service worker, 0 failures, no page request tried the network |
| 14 | `update-new-build-takes-over` | With A running and playing, B is deployed (server swap) and `registration.update()` called: B's marker is live in the page, one registration |
| 15 | `update-old-precache-removed` | After the update the precache holds only B's main bundle; A's is evicted (Workbox `cleanupOutdatedCaches`) |
| 16 | `update-new-build-boots-offline` | B reloads and boots offline, 0 failed app requests |
| 17 | `update-no-page-errors` | No `pageerror` during the whole update scenario |
| 18 | `install-gate-matches-documented-policy` | 18 contexts observed on the real build match `src/boot/installPolicy.ts` (table below) |
| 19 | `gate-blocked-tab-registers-no-service-worker` | A gated tab never registers the service worker |

The same checks run twice more gave identical pass/fail results (determinism); timings vary, outcomes did not.

Negative control: before the config fix below, the same script **failed** checks 8, 9 and 13 with `net::ERR_INTERNET_DISCONNECTED` on `/fonts/mazer-tile-font/mazer-font-atlas-mask.png`, `/fonts/mazer-tile-font/mazer-font-atlas.json` and the three `/assets/hud/hud-*.webp?v=20261106` files (15 failed requests per phase). So the proof does detect a broken offline shell.

### Cache Storage (build A, after first load, headless Chromium)

| Cache name | Entries | Body bytes |
| --- | --- | --- |
| `mazer-v1-precache-v2-<origin>/` | 40 | 4,648,091 (4539.2 KiB) |
| `mazer-boot-art-v1` (new, runtime) | 5 | 1,050,310 (1025.7 KiB) |

Total about 5.4 MiB of Cache Storage per install. The precache is the 40 files the build lists (game shell plus the other HTML entry pages the build emits, see finding 4); the boot-art cache is filled by the first controlled boot.

### What happens when a new build is deployed (documented behaviour, not a pass/fail)

`skipWaiting` + `clientsClaim` (vite.config.ts) make the new worker active immediately, and `src/boot/serviceWorkerLifecycle.ts` reloads the page once on `controllerchange`. Observed: about 1.5 s after the browser checks for the new worker, the running page is reloaded onto the new build. In-memory state is lost (a sentinel set on `window` did not survive; the authenticated fixture session went back to the menu). There is no "update ready, refresh?" prompt and no grace period for a run in progress. Whether saved progress restores a mid-level position was **not** measured. The shell itself is never half-updated: old precache entries are gone and the new set is complete, and B boots offline right after.

The app itself only calls `registration.update()` once per page load, so a long-lived installed session finds out about a deploy at its next launch (or the browser's own periodic update check), not instantly. The script forces the check to keep the test deterministic.

## Findings

1. **Fixed: offline launches failed 5 boot files.** `BootScene` preloads the three HUD icons and the tile-font atlas on every boot, but none were in the precache (deliberate: `tests/architecture/boot-payload-budget.test.ts` keeps raster art out of the install download), so an offline boot got `ERR_INTERNET_DISCONNECTED` for all five (the game still reached the menu and played; the visual effect of the missing HUD textures was not measured). Fix: one `runtimeCaching` entry in `vite.config.ts` (stale-while-revalidate, cache `mazer-boot-art-v1`, `maxEntries: 16`) for `/assets/hud/` and `/fonts/mazer-tile-font/`. It adds no install weight; the files are cached the first time a controlled page boots online. Pinned by `tests/analysis/offline-shell-proof.test.mjs` (config text, and every public file `BootScene` preloads is covered).
2. **First install reloaded the page once (superseded by MAZER-PERF-010, 2026-11-13).** The worker is registered after the game is created, claims the page, and the `controllerchange` handler reloaded it (not only on updates): 2 main-frame navigations on a first load, so a second splash a precache-download (1.5 to 7.6 s on production) after the first menu. That turned out not to be harmless: a QA tap on the menu landed on the second splash. The reload is now armed only for a page that was already controlled when it loaded (`controlledAtBoot` in `src/boot/serviceWorkerLifecycle.ts`), so the update path is untouched and the first-ever install no longer reloads. See `docs/ops/MAZER-SPLASH-TAIL-MEASUREMENT-2026-11-13.md`.
3. **First-install reload could drop an OAuth return onto the install gate (closed by the same change).** In a non-installed tab, an OAuth callback URL bypasses the gate and boots, registers the worker, then the claim-time reload used to land on `/` (callback parameters already scrubbed) and show the install gate. Reproduced with `?error=access_denied` before the change; with the first-install reload gone there is no second boot to land on the gate (re-running the proof was not part of that change).
4. **The precache also ships the dev/QA entry pages.** `proof-surfaces`, `visual-proof`, `watch-pass-*`, `planet3d`, `future-phaser` and their chunks (about 300 KiB on disk) are in every player's precache, and the legacy cleanup worker `sw.js` is in it too. Not a bug; a trim candidate for whoever owns `vite.config.ts` (Wave 5C).
5. **Signed-out visitors cannot play offline** (the sign-in gate stays locked; a signed-out launch stops on the fallback screen with the existing line, see check 11). The proof reaches level 1 offline through the fixture / `?previewLevel=1` routes, not through a real saved session, so "a signed-in player reopens the installed app offline" is proven only up to that fixture.

> Update (MAZER-PWA-007, 2026-11-14): the gate matrix below is the OLD 18-row table. It is now 29 rows under the always-on policy and the proof has 21 checks; see `docs/ops/MAZER-INSTALL-GATE-ALWAYS-ON-2026-11-14.md`.

## Install gate: current behaviour (no change)

Observed on the production build, headless, `mazer-proof.localhost` unless noted. "Gate on first boot" is the gate's decision during the first boot of the page.

| Context | Display mode | Gate on first boot | Gate mode | Game boots | Service worker registered | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Browser tab on localhost / 127.0.0.1 | browser | not shown | - | yes | no |  |
| Browser tab on 127.0.0.1 with ?forceInstallGate=1 | browser | shown | manual-desktop-chromium | no | no |  |
| Browser tab, desktop Chrome / Edge | browser | shown | manual-desktop-chromium | no | no |  |
| Browser tab, desktop Firefox | browser | shown | manual-desktop-other | no | no |  |
| Browser tab, desktop Safari | browser | shown | manual-desktop-other | no | no |  |
| Browser tab, Android Chrome | browser | shown | manual-android | no | no |  |
| Browser tab, iPhone Safari | browser | shown | manual-ios | no | no |  |
| In-app browser on iPhone (Instagram) | browser | shown | in-app-browser | no | no |  |
| Browser tab that fires beforeinstallprompt | browser | shown | prompt-available | no | no |  |
| Browser tab after an appinstalled event | browser | shown | installed-open-app | no | no |  |
| Browser tab in plain display-mode: fullscreen (F11) | fullscreen | shown | manual-desktop-chromium | no | no |  |
| Installed app, display-mode: standalone | standalone | not shown | - | yes | yes | reloaded after boot (service worker claimed the page); gate not shown after the reload |
| Installed app, display-mode: minimal-ui | minimal-ui | not shown | - | yes | yes | reloaded after boot (service worker claimed the page); gate not shown after the reload |
| Installed desktop app, display-mode: window-controls-overlay | window-controls-overlay | not shown | - | yes | yes | reloaded after boot (service worker claimed the page); gate not shown after the reload |
| iPhone home-screen app (navigator.standalone) | navigator-standalone | not shown | - | yes | yes | reloaded after boot (service worker claimed the page); gate not shown after the reload |
| Android WebAPK launch (android-app:// referrer) | android-referrer | not shown | - | yes | yes | reloaded after boot (service worker claimed the page); gate not shown after the reload |
| Browser tab, ?previewLevel=1 (QA sandbox route) | browser | not shown | - | yes | yes | reloaded after boot (service worker claimed the page); gate not shown after the reload |
| Browser tab, OAuth callback request (?error=access_denied) | browser | not shown | - | yes | yes | reloaded after boot (service worker claimed the page); gate shown after the reload |

What this says about the open decision (facts only):

- In a browser tab the gate is a hard block with no skip: the game never boots, and because the worker is registered only after the game is created, **a gated tab never gets an offline shell**. The offline shell can only exist after the first launch from an installed surface, online.
- Plain `display-mode: fullscreen` does not unlock the gate (by design, `installPolicy.ts`).
- Bypasses today: localhost (unless `?forceInstallGate=1`), `?previewLevel=N`, and any OAuth callback request. The gate decision takes no entitlement input (`resolveInstallGateDecision` has none), so "gate and entitlement rules agree" (acceptance criterion 3) is still open: today the gate is unconditional for browser tabs and entitlement is a separate concern.
- Offline with the gate: a gated tab offline cannot be warm (it never registered a worker), so there is no offline-and-gated state to observe; an installed launch offline boots straight through (checks 6 to 10).

## What is NOT proven

- Any real device: no iPhone, no Android phone, no tablet, no desktop installed app. Touch input, safe areas, PWA standalone chrome and storage quotas were not exercised.
- A **really installed** PWA (home screen / desktop window): standalone was emulated with `matchMedia` and `navigator.standalone` overrides, not by installing. Real install flows (Chrome install prompt, Android WebAPK, iOS Add to Home Screen) were not run.
- iOS Safari / WebKit: only Chromium. WebKit's service-worker lifecycle, 7-day script-writable storage eviction and cache limits are untested; `webkit` exists in the local Playwright install but this script does not use it.
- Android Chrome install and offline relaunch.
- Real network loss (airplane mode on a device, captive portals, flaky networks, "lie-fi"). Offline here is a clean refusal.
- The production host `mazer.fawxzzy.com` and its real Vercel headers / CDN; a real deploy-to-deploy update across the live service worker.
- A real saved session: offline play used the QA fixture / preview routes. Cloud sync, leaderboard and progress write-back while offline were not exercised.
- Whether saved progress survives the update reload mid-level.
- Browser eviction of Cache Storage under storage pressure.
- Acceptance criteria 1 and 3 of the card (policy decision; gate/entitlement agreement) are owner decisions and untouched. Criterion 2 ("works offline on a real device") remains open until the device checks below are done.

### Device checks for Zac (not run)

1. On the phone, open the installed Mazer once while online, play a few seconds, close it fully.
2. Turn on airplane mode, reopen Mazer from the home screen. Expected: it boots to the menu (signed-in) or, signed out, to the Mazer fallback screen with "Sign-in is unavailable right now. Try again in a few minutes." (the launch no longer goes to the host while offline); HUD icons visible; no blank screen.
3. Start a level and move. Expected: plays normally.
4. Signed out and still offline, tap Sign in on that screen. Expected: the same line again within about a second, no hang.
5. Turn airplane mode off, force-quit and reopen. Expected: normal online boot.

## Doc note for `docs/current-truth.md`

`scripts/analysis/verify-offline-shell.mjs` is a headless proof (19 checks) that the production service worker precaches the shell and that the game boots, plays and shows the existing `provider_unreachable` sign-in message with the network down; the HUD icons and tile-font atlas are now runtime-cached for offline launches (`mazer-boot-art-v1`). A new deploy reloads a running session once; the install gate is unchanged and nothing was checked on a real device.
