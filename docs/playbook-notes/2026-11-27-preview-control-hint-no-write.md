# 2026-11-27 - Level Preview no longer writes the level-1 control hint to the device

- WHAT changed:
  - `src/render/legacyControlHintOverlay.ts`: on a Level Preview route (`isLegacyLevelPreviewRoute(win.location.search)`, so `?previewLevel=N` and the hazard lab jump `?lab=hazards&level=N`), the hint's ack store uses an in-memory `createLegacyLevelPreviewStorage()` instead of `window.localStorage`. The hint still shows and hides exactly as before; only where its "seen" mark lives changes. Normal play is unchanged.
  - `tests/legacy-runtime/legacy-control-hint.test.ts`: preview routes see zero `getItem` / `setItem` / `removeItem` on a spy device storage while the hint still shows and hides on the first move; a device ack is not read in preview; normal-play routes still read and write `mazer.tutorial.acks:device`.
  - `docs/ui/MAZER-LEVEL-PREVIEW-2026-11-09.md`: safety guarantee 5 added.
- WHY it changed:
  - First-time cards spec (docs/design/MAZER-FIRST-TIME-CARDS-SPEC-2026-11-26.md) finding F15, slice 0: the hint is installed at boot with `window.localStorage` and no preview check, so `?previewLevel=1` wrote `mazer.tutorial.acks:device` to the real device, breaking "preview writes nothing".
- Rule: anything installed at boot (before MenuScene exists) cannot rely on `MenuScene.resolveBrowserLocalStorage()` for the preview sandbox; it must check `isLegacyLevelPreviewRoute` itself and use in-memory storage.
- Evidence: reproduced in headless Chromium at 390x844 against the dev server before the fix: localStorage `[]` before, `["mazer.tutorial.acks:device"]` after the first move on `?previewLevel=1&runtimeDiagnostics=1`. After the fix: `[]` before and after, hint shown with the same copy; normal play (`?runtimeDiagnostics=1&authFixture=authenticated`, Play started) still writes the key. The 4 new preview tests fail without the source change and pass with it.
- Decision: the spec's slice 0 row suggests returning a no-op in preview; this change keeps the hint visible in preview but in memory, as the lane brief asked ("preview writes only to memory"), so preview boards still show the real level-1 hint for options pages and screenshots.
- Status: source only; not deployed. Nothing checked on a real phone.
