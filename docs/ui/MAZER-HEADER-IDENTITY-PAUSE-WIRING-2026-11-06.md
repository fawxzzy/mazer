# Header identity and pause card wiring (2026-11-06)

Wires packets B and C of `MAZER-LEADERBOARD-PAUSE-IDENTITY-REDESIGN-2026-11-05.md`
into `MenuScene.ts`. Owner direction (Zac, 2026-11-05/06): remove the bottom
"Welcome" + username block and show the username top-left right of the profile
icon; redo the pause menu, keep its icon, drop the profile icon from the
pause/Options header.

## Facts

- Header identity: `createLegacyHeaderIdentityLabel` (replaces
  `createLegacyAuthenticatedWelcomeIdentity`). Placement is computed by the new
  pure module `legacyHeaderIdentityPlacement.ts`, which feeds
  `resolveLegacyHeaderIdentityLayout` the real profile frame
  (`resolveLegacyHeaderControlFrame`) and the real title left edge
  (`resolveLegacyMenuPathTitleLayout`), replacing the assumed 220 px title.
  Measured (runtime diagnostics, authFixture): 390x844 title left 113 / width
  164 (room ~53 px); 320x568 title left 99 / width 123 (room ~41 px).
- Long names (MAZER-ACCT-032): the label is never hidden for a name that does not
  fit. It shrinks to the minimum font and is cut with an ellipsis; it stays
  icon-only only when not even one character plus the ellipsis fits
  (`LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS = 1`). This replaces the earlier
  6-character rule and the 320 px short form (floor 4), which hid a 10-character
  name at 390 px. Desktop shows the whole name.
- Diamonds: the label is nudged down (never up, never below the profile icon's
  bottom edge) until its text rect clears every diamond bounding square by 1 px;
  if it cannot, it is hidden. At 320 px the nudge is ~3 px. The diamonds
  themselves are unchanged. Depth 3 (above the board, below overlays); the
  label object is named `header-identity` for QA.
- Pause card: `buildPauseOverlay` renders `buildLegacyPauseMenuViewModel()` -
  title, Resume, Settings (collapsed on every open; the three
  toggles via `createFeatureControlRows`), Quit to Menu. Overlay id `pause` is
  unchanged. Resume and Quit keep "bridge first (`RESUME_RUN` / `RETURN_HOME`),
  then `applyLegacyPauseCommand('resume' | 'return-menu')`". When Settings is
  open on a short viewport only the settings rows scroll. The card uses
  `bg.canvas` (`cyberArcadeMaterial.substrate.field`) with the standard mint
  stroke.
- Options: the profile/account icon is removed from its header
  (`createLegacyOverlayUsernameButton` deleted); the main menu's top-left
  profile icon is the only account entry.

## Decisions

- The pause header keeps the standard back chevron at the pause icon's
  position as an alias for Resume (open question 4 in the redesign doc: yes).
- No Guide card in Pause (open question 3: Pause is Resume / Settings / Quit).
- Quit to Menu has no confirmation (open question 2 unchanged; owner to confirm).
- `createLegacyOverlayHomeButton` (the old pause header home icon) and
  `LEGACY_PLAY_TOUCH_COG_HUB` (used only by it) are deleted.

## Follow-ups owned elsewhere (not edited here)

- `scripts/analysis/capture-ui-surfaces.mjs` (wave 0C) still expects `GUIDE`
  and an `Account` button in the Options/Pause surfaces.
- `scripts/analysis/live-auth-persistence-soak.mjs` (wave 5C, live auth only)
  still expects `['Trail Shine', 'Account']` for Options and
  `['Back', 'Guide', 'Trail Shine', 'Main Menu']` for Pause
  (now `['Back', 'Resume', 'Settings', 'Quit to Menu']`), and its test
  `tests/analysis/live-auth-persistence-soak.test.mjs` pins that text.
