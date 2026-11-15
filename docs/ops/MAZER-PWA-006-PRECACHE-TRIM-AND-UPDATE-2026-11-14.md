# MAZER-PWA-006: precache trim and deferred update (2026-11-14)

Headless proof only (`scripts/analysis/verify-offline-shell.mjs`, 22 checks, all pass). Nothing was checked on a real phone.

## Precache trim
`vite.config.ts` `workbox.globIgnores` now keeps these out of the precache: `sw.js` (legacy cleanup worker), the dev/QA entry pages (`proof-surfaces`, `visual-proof`, `watch-pass-*`, `planet3d`, `future-phaser`) and the chunks only they use (`snapshotCard`, `RuntimeAdapterBridge`, `preferences`, `IntentBus`). Offline they fall back to `index.html`; online they load from the network as before.

| | Entries | Reported size |
|---|---|---|
| Before | 41 | 2449 KiB |
| After | 17 | 2148 KiB (about 301 KiB less) |

Remaining chunk list: vendor, schema, phaser, modulepreload polyfill, main js/css, maze worker. The 934 KB `icons/mazer-app-icon.png` is still precached (follow-up candidate).

## Update behaviour (decided: deferred)
Before: a deploy reloaded a running session about 1.5 s after the update check. Now `skipWaiting` + `clientsClaim` still activate the new worker at once (the shell is never stranded or half-updated; old precache is removed), but the page reloads only when it is hidden AND the menu scene is idle (`MenuScene.mode === 'menu'`, unknown counts as busy) (`deferReload` in `src/boot/serviceWorkerLifecycle.ts`). A visible page or a hidden mid-run page keeps its session; a page that never becomes idle picks up the new build at its next launch. First install is unchanged (no reload). No prompt is shown.

24 h staleness cap (2026-11-15, silent update policy): a page that stays visible with the update pending for more than
24 h (`MAZER_UPDATE_STALENESS_CAP_MS`) applies it at the next safe moment even while visible: on a visibility change
(for example returning to the app) or at a re-check every minute after the cap, and only when the menu is idle. Mid-run
still always waits. The decision is `decideMazerDeferredUpdateReload`. There is no `minBuildId` floor: Mazer has no
app-version endpoint or build-id manifest to compare against (gap, not built).

## Mid-level restore (measured)
After the reload the scene is `menu` and the in-memory run is gone (sentinel lost): the endless checkpoint store is not wired, so nothing restores a mid-level position. That is why mid-run reloads are deferred. Residual risk: a stale long-lived page keeps references to old hashed assets (for example the maze worker URL) until it reloads.
