# MAZER-PERF-010: the boot splash that came back (measurement, 2026-11-13)

Headless Chromium only (390x844, a fresh browser context per run). Nothing here was measured on a real phone, an installed PWA, iOS Safari or Android Chrome.

## Symptom

A QA sign-in harness (fresh context, `goto` with `waitUntil: networkidle`, wait 3.5 s, tap Sign in) failed about 1 run in 5 because the page was on the HTML boot splash ("MAZER", a dot, "Loading...") instead of the menu.

## Cause

On the first visit of a browser profile the page boots and shows the menu, THEN the service worker (registered after the game is created) installs, claims the page, and `installMazerServiceWorkerControllerReload` reloaded the page, so the HTML splash and a second boot came back after the menu had already been showing. The reload is as late as the precache download is slow: `app-sw.js` precaches 41 files (about 4.5 MiB raw) one after another.

Production, 60 fresh contexts, 59 of 60 reloaded, seconds from `networkidle` to the reload: p50 2.0, p95 4.4, max 7.6. On an idle host the second splash lasted 216 to 654 ms (median 299 ms), so only 1 run in 60 tapped inside it. Under 4x CPU throttle (a busy host, which is what a machine running parallel agents is) the second splash lasts a median 1.4 s (max 2.1 s) and lands at a median 3.6 s after `networkidle`, which puts a tap at 3.5 s inside it on 15 to 31 of 60 runs.

## It is not a regression between 1dc4e9ca and 4cb1a2dd

The reload was added in 64155cd4 (2026-08-20). Builds of 1dc4e9ca, 3d5f3614, 77d2e9eb, 28e67ee0 and 4cb1a2dd, each served from a Vercel-like static server on a non-localhost host name with a registered worker, 60 fresh contexts each, modelled WAN (20 to 60 ms first byte, 30 Mbit/s): all 60 of 60 runs reloaded on every build, reload at a median 2.0 to 2.1 s after `networkidle`, the second splash gone by 4.4 to 4.9 s, and 0 taps at 3.5 s failed on any build (the model's reload time is too regular to land on the tap). With a long-tailed first-byte model plus 4x CPU throttle: 1dc4e9ca 31 of 60 taps failed, 4cb1a2dd 21 of 60 (different runs, same host, same time; treat the gap as noise). The precache grew by 87 KiB across the range (4538 to 4625 KiB raw), so the install time is the same within noise. Why the harness passed every run on earlier builds is UNKNOWN from this data: the plausible reading is timing luck plus host load, not a code change.

## Fix

`controlledAtBoot` (`navigator.serviceWorker.controller !== null` read at boot, before the worker is registered): only a page that was already controlled can be running a stale build. A first visit has just been fetched from the network, so it needs no reload. The update path (a controlled page gets a new worker) still reloads once. Same long-tailed model, 4x throttle, 60 runs: 0 of 60 reloaded, 0 of 60 taps failed, the menu is ready at a median 2.5 s and never later than 3.5 s.

## Harness advice (QA)

Do not tap on a timer. Wait for the splash to be gone (`document.getElementById('mazer-boot-splash')` is absent or has `pointer-events: none`) and for `window.__MAZER_BOOT_STATUS__.splashRemoved`, or, until the fix is live, also wait for `navigator.serviceWorker.controller` and then for the splash again (a first visit on a build without the fix reloads once).

## Reproduce

`npx vite build --outDir <dir>` then `node scripts/analysis/measure-splash-tail.mjs --target=<dir> --n=60 --profile=wan --throttle=4` (or `--target=https://mazer.fawxzzy.com` for the live site; it records main-frame navigations, the reload time, the service worker state, long tasks, the request waterfall of slow runs and host CPU).
