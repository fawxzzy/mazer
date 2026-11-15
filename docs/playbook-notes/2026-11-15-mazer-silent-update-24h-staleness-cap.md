# 2026-11-15 Silent update: 24 h staleness cap on the deferred service worker reload

- WHAT changed: `src/boot/serviceWorkerLifecycle.ts` keeps the MAZER-PWA-006 deferral (reload only when hidden and the menu is idle) and adds a 24 h cap. A page that stays visible with the update pending for more than 24 h (`MAZER_UPDATE_STALENESS_CAP_MS`) applies it at the next safe moment: a visibility change, or a re-check every minute (`MAZER_UPDATE_RECHECK_MS`) after the cap. Mid-run always waits. The pure decision is `decideMazerDeferredUpdateReload({ hidden, safeToReload, pendingSinceMs, nowMs })`. `deferReload` gained optional `now` and `setRecheckTimer` (defaults `Date.now` and an unref'd `setTimeout`), so `src/boot/main.ts` (integrator Wave 5C) is unchanged.
- WHY it changed: silent update policy (Zac 2026-11-14): updates never interrupt, but nobody stays stale. Before this, a page left open on the menu never picked up a deploy until it was hidden.
- Rule: never reload mid-run (run state is not restorable); a visible reload only happens after the cap and only on the idle menu.
- Gap: no `minBuildId` floor. Mazer has no app-version endpoint or build-id manifest to compare against.
- Evidence: `tests/reset/pwa-006-update-and-precache.test.ts` (decision table for visible/hidden/mid-run/under and over 24 h, re-check timer, return-to-stale-page), `npx tsc --noEmit`, the full vitest run.
- Status: source and headless unit tests only; real installed iOS background/foreground update timing not verified.
