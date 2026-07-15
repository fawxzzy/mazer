# Mazer Visual Defaults Fresh-Session Proof — 2026-07-15

## Outcome

The `mazer-visual-defaults-menu-controls` acceptance surface is terminal on
merged product main plus proof commit `117b28ad893b6a7a694c0522c612e2c2f61d22c8`
in PR #71. The maintained UI runner now has an explicit `fresh` preference
fixture that leaves browser storage empty and fails if documented defaults drift.

Fresh guest and authenticated captures prove Camera Follow off, Trail Fade off,
Trail Shine on, Animated BG on, Dark Mode on, Stick controls, and 30% movement
speed. The runner also waits for two animation frames after diagnostics settle so
screenshots and canvas paint are correlated.

## Verification

- 86 focused menu, defaults, renderer, and capture-contract tests passed.
- Capture script syntax check passed.
- Clean-commit fresh guest 360x720 @2x proof passed.
- Clean-commit fresh authenticated 360x720 @2x proof passed.
- Clean-commit fresh authenticated 1440x900 @1x proof passed.
- All three summaries report commit `117b28ad`, `dirty=false`, and fixture `fresh`.
- Local-only artifacts:
  - `tmp/captures/mazer-ui-surfaces/2026-07-15T05-58-32-732Z`
  - `tmp/captures/mazer-ui-surfaces/2026-07-15T05-58-53-613Z`
  - `tmp/captures/mazer-ui-surfaces/2026-07-15T05-59-20-269Z`

## Post-work review

- Only the maintained proof runner, its source-contract test, and this receipt changed.
- Runtime defaults and product behavior were not changed.
- PR #70 supplies the mobile Options/Pause centering, containment, and scroll-flow repair.
- No protected AI source, dependencies, secrets, Supabase data, or production deployment changed.
- No Discord live write or full-board sync ran.
- Exact card target: `mazer-visual-defaults-menu-controls`, thread/starter
  `1525063361887338527`; completion is queued for exact-card replay when Discord is reachable.

## GitHub disposition at receipt creation

- Base: `main` at `b1e059473eaf1c7ff17115402e087e73f6e88d6e`
- Proof commit: `117b28ad893b6a7a694c0522c612e2c2f61d22c8`
- PR: #71, draft
- Production: not deployed.
