# 2026-11-16 PWA update check on resume (spiral / rainbow trail "not visible")

- WHAT changed: `installMazerProductionServiceWorker` (`src/boot/serviceWorkerLifecycle.ts`) takes an optional `resumeUpdate` runtime; `src/boot/main.ts` wires it to `visibilitychange`. Each return to the foreground calls `registration.update()` again, at most once per 60 s (`MAZER_SW_RESUME_UPDATE_MIN_INTERVAL_MS`). A failed resume check is silent; the boot check still reports errors as before.
- WHY: the owner did not see the start spiral (VIS-053) or the full rainbow trail on the phone. The live bundle at `mazer.fawxzzy.com/?previewLevel=3` renders both headless (Chromium 390x844 default and Reduce Motion, WebKit). The code gap: the only update check ran once at boot, and a home-screen app is usually resumed from memory, not relaunched, so it could keep an old precached build for days.
- Rule: a long-lived PWA must re-check for updates on resume, not only at boot. The deferred reload (MAZER-PWA-006) still decides WHEN the new build is applied (next hide while on the menu).
- Evidence: unit tests in `tests/reset/pwa-006-update-and-precache.test.ts` (resume re-check, throttle, no check on hide, silent failure, main.ts wiring). Not checked on a real phone.
- Open: no visible build stamp exists, so the owner cannot tell which build a phone runs. Follow-up card proposed (placement is an owner call).
