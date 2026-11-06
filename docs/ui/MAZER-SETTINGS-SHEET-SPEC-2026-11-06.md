# Mazer settings sheet spec (menu + pause), reset progress, guide data

Date 2026-11-06. Status: pure modules and tests only. NOT wired. `src/scenes/MenuScene.ts` is untouched.

Owner decision (Zac): the in-game Pause > Settings look is correct; the main-menu Settings sheet must match it fully (same structure). Add a `Reset progress` button to the main-menu Settings list: reset the account's full maze progression only. Standing rule: the Guide's UI reflections are updated with every game/UI change.

## Modules

| File | Role |
| --- | --- |
| `src/legacy-runtime/legacySettingsSheetPlan.ts` | One view model + pure layout plan for both contexts (`menu`, `pause`). Row vocabulary, order, sizes (token terms), close affordance, 320/390/1280 geometry. |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | Reset reducer (idle, confirm, working, done/failed/blocked/cancelled), strategy (server-first vs local-only vs blocked), baseline-state function, local-effects plan, confirm copy. |
| `src/legacy-runtime/legacyGuideContent.ts` | The Guide data: rows, icon specs (tied to the board draw functions), pending rows, keyboard bindings. |
| `tests/reset/legacy-settings-sheet-plan.test.ts`, `legacy-progression-reset-flow.test.ts`, `legacy-guide-content-drift.test.ts` | Plan geometry at 320x568, 390x844, 1280x720; reducer and reset function; guide drift guard. |

## Structure (both contexts)

Card (centered, same width in both contexts: 360 max compact, 400 regular), labelled `Close` pill in the header reserve above the card (never a bare chevron), centered title, scrolling body.

- Pause: `Paused`; `Resume` (primary); `Settings` disclosure (collapsed by default) containing the Settings group; `Quit to Menu` (tertiary).
- Menu: `Settings`; the Settings group always open; `Account` heading; `Reset progress` (danger-outline); 24 px separation; `Sign out` (danger, signed-in only).
- Settings group (identical rows, identical geometry in both): `How to play` (opens the Guide sheet), `Display` heading, `Board Zoom` slider, `Trail Fade`, `Trail Shine`, `Animated Background` toggles. State words (`On`, `Off`, `Animated`, `Still`) are their own column, never merged into the label.
- Sizes: action 48, toggle/nav row 52, slider row 68, heading 24, close 76x44, gaps 8/12, card padding 20/24, label font 16 (never below 14, wraps to two lines), state font 13.

## Reset progress: scope and contract

- Clears: the account's player level, completed cycles and maze-progress fields AND the menu-AI track (server `mazer_reset_progression` resets both; the client must too, or the monotonic load-time merge re-inflates the other).
- Does not touch: account, profile, credentials, username, leaderboard identity, device settings (`mazer.game-toggles.v1`), auth keys, sync metadata (rewritten by the RPC success path).
- Server operation already exists: `mazer_reset_progression(p_expected_revision, p_expected_user_id)` via `writeLegacyRemoteProgressionState(..., 'replace')`. No new server or Supabase operation is needed for the base feature.
- Order for a signed-in account with remote progression on: confirm, then server first (await RPC success), then local effects (`LEGACY_PROGRESSION_RESET_LOCAL_EFFECTS`: write baseline, remove completion outbox, remove cycle telemetry). Offline is refused. Guest or remote-disabled: local effects only, copy says "on this device".
- UX: two steps, level shown ("Level 42 -> Level 1"), one consequence line, Cancel first and default, destructive button disabled for 600 ms, `Reset to Level 1`, 24 px away from Sign out, menu-only.

## MenuScene lines the wiring lane replaces (at `origin/main` `a1398b59`; other lanes are shifting these, search by method name)

| Method | Line | Action |
| --- | --- | --- |
| `buildOptionsOverlay` | 11695 | Replace body with a painter of `buildLegacySettingsSheetPlan({context:'menu', signedIn})`. Remove the full-height sheet, Guide dropdown host and docked Sign out bar. |
| `createLegacyOptionsSessionActionBar` | 11770 | Delete (Sign out becomes a plan row). |
| `createLegacyOptionsInfoSection` | 11790 | Delete the dropdown. Reuse its icon draw calls for the Guide sheet (`legacyGuideContent.ts` rows). |
| `createLegacyOptionsGuideHeaderButton` | 12081 | Delete (replaced by the `how-to-play` row, 52 px). |
| `buildPauseOverlay` | 12219 | Paint from `buildLegacySettingsSheetPlan({context:'pause', settingsExpanded: this.pauseSettingsExpanded})`; label the back control `Close`. |
| `createOverlayBackChevronButton` | 14984 | Replace bare `<` with the labelled `Close` pill rect from the plan. |
| `createFeatureControlRows` | 13579 | Draw rows from plan items (fixed sizes) instead of scaling from `panel.width`. |
| `createToggleSwitchRow` | 13895 | Use plan `parts` (label, state, switch rects); drop the label/state merge and the 8-9 px floors. |
| `buildProgressionResetConfirmationOverlay` | 12555 | Repaint from `buildLegacyProgressionResetConfirmView`; Cancel default; add arm delay; show working/failed/blocked lines. |
| `resetLegacyPlayerProgression` | 15800 | Make server-first (await `writeLegacyRemoteProgressionState('replace')`), then `applyLegacyProgressionResetLocalEffects`; stop writing local before the RPC; keep message `progression.player.reset` or replace with the done line. |
| `syncLegacyRemoteProgressionState` | 16423 | Return the result to the reducer (`succeeded` / `failed` with `conflict` on revision `40001`). |
| `openOverlay` / `closeOverlay` | 15642 / 15701 | `confirm-progression-reset` return rule must include `options` (today only `pause` or `auth`). |
| Account screen link | 12841 | Keeps working; optionally point at the same confirm view. |

Also: `src/legacy-runtime/legacyPauseMenuView.ts` (`excludes` list and layout) and `legacyUiStandards.ts` (`resolveLegacyOptionsGuideLayout`, stale compass comment) become redundant once the plan is wired.

## Open items

See the investigation closeout (kept outside the repo, settings-reset-progress-2026-11-06) (multi-device resurrection needs a reset epoch: BLOCKED-ON-OWNER if wanted).

## Guide icon reasons

`reasonId` values in `src/legacy-runtime/legacyGuideContent.ts` (kept as ids so developer prose is not a player-facing literal):

| reasonId | Meaning |
| --- | --- |
| `goal-legend-reuses-scene-star-draw` | The legend already reuses the in-game goal star draw call; Chip wiring swaps that call and the legend follows. |
| `player-legend-icon-missing` | The legend has no player icon today. The wiring lane draws it through `fillLegacyPlayerMarkerTile` (Chip: `drawBoardMarkers` player), not a copy. |
| `stick-mirrors-play-stick-style-independent` | Mirrors the floating stick ring and knob drawn in play; independent of tile style. |
| `trail-legend-uses-old-path-material` | The legend swatch uses the old path material, not the board trail draw. Chip wiring points it at the board trail colors (open item A8, trail underlay on the chip floor). |
| `wrap-legend-must-call-edge-marker-draw` | The legend calls `drawEdgeMarker` (the perimeter diamond) instead of a bespoke glyph. Diamonds are unchanged by Chip. Their lit-on-wrap behavior is source-claimed, not observed (audit F17); the copy does not mention it. |
| `level-numeral-shares-old-path-material` | Numeral and START/MAZER wordmarks share the old path material (audit F13). Chip wiring decides migrate-or-accept; the legend numeral follows. |
| `start-marker-needs-chip-brackets` | Pending row. Chip draws gold corner brackets on the start tile (`drawBoardMarkers` start). Add a Start row, drawn by that function, in the PR that wires Chip. The old "begin at gold" copy is dropped: the live game shows no gold start marker in play. |
| `rank-letters-not-visible-anywhere` | Pending row. Rank letters are not shown (`drawLegacyProgressionBadge` draws nothing). No rank copy until a player-facing rank surface exists. |
| `level1-coach-is-owner-decision` | Pending row. A one-line level-1 coach is a separate owner decision; `src/tutorial/*` is unused. |
