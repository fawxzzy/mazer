# Mazer settings sheet spec (menu + pause), reset progress, guide data

Date 2026-11-06. Status: WIRED in `src/scenes/MenuScene.ts` (Wave 5C wiring lane, see "Wiring status" at the end). The spec sections below are the contract; the "MenuScene lines the wiring lane replaces" table is kept as the record of what was replaced.

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
| `goal-legend-calls-chip-marker-draw` | The Goal icon calls `drawBoardMarkers` (goal) from `src/render/boardTileBake.ts` through `PhaserGraphicsTileContext`, over a chip tile: the same function the board uses for the live goal (Chip wiring, 2026-11-06). |
| `player-marker-draw-bound-to-board-graphics` | `fillLegacyPlayerMarkerTile` draws into the board's dynamic graphics, the shared glow canvas image and the live motion state, so the Guide cannot call it. The Guide icon is a guide-local rounded square using the same ratio constants, accent stroke and the `player.core` token. When Chip lands, switch it to `drawBoardMarkers` (player). |
| `stick-mirrors-play-stick-style-independent` | Mirrors the floating stick ring and knob drawn in play; independent of tile style. |
| `trail-legend-uses-chip-tile-geometry` | The trail legend is three chip tiles in an L (cells from the board's `computeChipGeometry`, via `resolveChipGridGeometry`) with a miniature trail line over the same dark underlay the board trail uses. The tile geometry is shared with the board; the trail line is a guide-local miniature of the canvas trail. |
| `wrap-legend-calls-edge-marker-draw` | The legend calls `drawEdgeMarker` (the perimeter diamond) instead of a bespoke glyph. Diamonds are unchanged by Chip. Their lit-on-wrap behavior is source-claimed, not observed (audit F17); the copy does not mention it. |
| `level-numeral-calls-wordmark-chip-draw` | The level numeral is drawn by `drawLegacyGlyphWordTileBlock`, the dot-matrix chip renderer the level announcer and wordmarks use, at icon scale. |
| `start-legend-calls-chip-marker-draw` | The Start row (added with Chip) calls `drawBoardMarkers` (start): corner brackets and a centre dot, over a chip tile. The copy names no colour. |
| `rank-letters-not-visible-anywhere` | Pending row. Rank letters are not shown (`drawLegacyProgressionBadge` draws nothing). No rank copy until a player-facing rank surface exists. |
| `level1-coach-is-owner-decision` | Pending row. A one-line level-1 coach is a separate owner decision; `src/tutorial/*` is unused. |

## Wiring status (2026-11-06, Wave 5C wiring lane)

What shipped in the wiring PR:

- One painter for both contexts: `buildOptionsOverlay` and `buildPauseOverlay` are thin entries into `buildLegacySettingsSheetOverlay(context)`, which paints `buildLegacySettingsSheetPlan`. Menu hides Resume, the Settings disclosure and Quit to Menu; pause hides the Account section (Reset progress, Sign out). The Settings group (How to play, Display, Board Zoom, Trail Fade, Trail Shine, Animated Background) is the same plan rows at the same size in both.
- Labelled `Close` pill (`createOverlayClosePill`, 76x44, right-aligned to the card, in the header reserve) replaces the bare chevron on the settings and guide sheets. The leaderboard and account overlays keep `createOverlayBackChevronButton` (out of scope).
- Rows keep the full inner width while scrolling; the scroll rail sits in the card padding (`scrollRailViewport`). Toggle labels wrap to two lines and never shrink under 14 px; the state word is its own column.
- The Guide is a sheet, not a dropdown: opened by the `How to play` row from both contexts, painted from `buildLegacyGuideSheetModel` and `buildLegacyGuideSheetPlan`, `Got it` footer pinned. It is a sub-view of the options/pause overlay (`settingsGuideOpen`), so Pause keeps holding the run while it is open. Back, Escape, Close and `Got it` return to Settings.
- Guide icons: goal star (`drawLegacyGoalStarMarker`) and wrap diamond (`drawEdgeMarker`) call the board draw functions. Player, move stick, trail swatch and level numeral are guide-local (reason ids in the table above; trail and levels stay `chip-wiring`). The old "begin at gold" start row is gone.
- Reset progress (menu Settings, Account section): two-step. Step 1 is the confirm card (`Level N -> Level 1`, one consequence line, Cancel first and default, `Reset to Level 1` armed after 600 ms). Step 2 is the result on the same card (working, done, failed or blocked). Account scope names the leaderboard standing; device scope says "on this device". Cancel, Back and Escape return to the Settings sheet (overlay routing now treats `options` as a recorded origin).
- `resetLegacyPlayerProgression` is server-first and async: for a signed-in provider-eligible account with remote progression on, it awaits `writeLegacyRemoteProgressionState(..., 'replace')` (`mazer_reset_progression`), and only on success applies the local effects (baseline for both tracks, outbox and cycle telemetry removed) using the keys of the account the reset was requested for. A failed or conflicting server call leaves local progression untouched and shows the failure. Guests or remote-off reset the device key only. A reset requested while a run is active is blocked.

Not done, deliberately:

- The URL-flagged advanced rows (Maze Scale, Camera Scale, Path/Wall RGB; `?advancedOptions=1`) and the hidden Move Speed slider are no longer painted: they are not part of the shared spec and had no plan vocabulary. `resolveLegacyAdvancedOptionsVisible` is kept.
- Multi-device reset epoch (BLOCKED-ON-OWNER, see above) and clearing the legacy guest progression key on account reset are not implemented. Guest play is disabled (`LEGACY_GUEST_PLAY_ACCESS_ENABLED = false`), so the guest-key re-import path only matters for progress saved before that.
- `scripts/analysis/capture-ui-surfaces.mjs` still expects the old Guide dropdown (`guidePanel` bounds, GUIDE label) and the docked Sign out bar; it needs a follow-up in its own lane (out of scope here).
- `legacyPauseMenuView.ts` (layout) and `legacyUiStandards.ts` (`resolveLegacyOptionsGuideLayout`, toggle/feature layouts) are no longer consumed by the scene; they stay for their own tests and are candidates for removal.

## Chip wiring status (2026-11-06)

The `chip-wiring` guide todos are closed: goal, start, trail and levels icons now share a board draw (see the reason ids above); `you` and `move` stay guide-local. The pending `start-marker` row became the shown Start row. The drift test pins this (`tests/reset/legacy-guide-content-drift.test.ts`).
