# Mazer settings sheet spec (menu + pause), reset progress, guide data

Date 2026-11-06. Status: WIRED in `src/scenes/MenuScene.ts` (Wave 5C wiring lane, see "Wiring status" at the end). The spec sections below are the contract; the "MenuScene lines the wiring lane replaces" table is kept as the record of what was replaced.

Owner decision (Zac): the in-game Pause > Settings look is correct; the main-menu Settings sheet must match it fully (same structure). Add a `Reset progress` button to the main-menu Settings list: reset the account's full maze progression only. Standing rule: the Guide's UI reflections are updated with every game/UI change.

## Modules

| File | Role |
| --- | --- |
| `src/legacy-runtime/legacySettingsSheetPlan.ts` | One view model + pure layout plan for both contexts (`menu`, `pause`). Row vocabulary, order, sizes (token terms), 320/390/1280 geometry. No close affordance: the primary top row is the exit. |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | Reset reducer (idle, confirm, working, done/failed/blocked/cancelled), strategy (server-first vs local-only vs blocked), baseline-state function, local-effects plan, confirm copy. |
| `src/legacy-runtime/legacyGuideContent.ts` | The Guide data: rows, icon specs (tied to the board draw functions), pending rows, keyboard bindings. |
| `tests/reset/legacy-settings-sheet-plan.test.ts`, `legacy-progression-reset-flow.test.ts`, `legacy-guide-content-drift.test.ts` | Plan geometry at 320x568, 390x844, 1280x720; reducer and reset function; guide drift guard. |

## Structure (both contexts)

Card (centered in the whole panel, same width in both contexts: 360 max compact, 400 regular), centered title, scrolling body. There is no Close pill, X or back arrow on the settings or guide sheets and no header reserve above the card: the primary top row is the exit (Resume in pause, Back to Menu in the menu) and the Guide keeps its pinned `Got it` footer.

- Pause: `Paused`; `Resume` (primary); `Settings` disclosure (collapsed by default) containing the Settings group; `Quit to Menu` (tertiary).
- Menu: `Settings`; `Back to Menu` (primary, CLOSE_OVERLAY; same slot, size and emphasis as pause's `Resume`); the Settings group always open; `Account` heading; `Reset progress` (danger-outline); 24 px separation; `Sign out` (danger, signed-in only).
- Settings group (identical rows, identical geometry in both): `How to play` (opens the Guide sheet), `Display` heading, `Trail Fade`, `Trail Shine`, `Animated Background` toggles. State words (`On`, `Off`, `Animated`, `Still`) are their own column, never merged into the label.
- Sizes: action 48, toggle/nav row 52, heading 24, gaps 8/12, card padding 20/24, label font 16 (never below 14, wraps to two lines), state font 13.

### Exit contract (2026-11-06, Zac: "remove both [the close button and the back arrow] cause we already have a resume button, then recover that space")

- Pause: the primary `Resume` row (RESUME_RUN) is the exit. Escape and hardware back still resume.
- Menu: the menu has no Resume, so removing Close alone would strand touch users. Decision (owner may overrule): the menu context gets the SAME structure as pause, a primary top action row in the same slot as `Resume`, labelled `Back to Menu` (command CLOSE_OVERLAY, primary emphasis, 48 px). Escape, hardware back and a tap on the dimmed scrim outside the card also close it (scrim tap is menu Settings only: not pause, where an accidental outside tap must not resume the run, and not the Guide sub-view). No arrow glyph or X is used.
- Guide sub-view: `Got it` (pinned primary footer) is its exit; Escape and back return to Settings. No Close pill or chevron.
- Reclaimed space: the 46 + 6/8 px header reserve that held the pill is gone from both sheet plans (`availableHeight = panel.height`), so the card is centred in the full panel and gets the freed height (at 320x568 the card is 552 px tall instead of 500; 390x844 and 1280x720 menu sheets now fit without a scroll rail). The scroll rail still appears only when content truly overflows the body. Leaderboard and account overlays are unchanged (they keep `LEGACY_OVERLAY_HEADER_RESERVE` and the back chevron).

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
| `player-legend-calls-shared-marker-draw` | The You icon calls `drawPlayerMarker` from `src/render/playerMarker.ts`, the one draw the human player's marker in play and the menu demo's AI also use (same block, keyline, ring, accent stroke), frozen: no ping, reduced motion. Only the soft shadowBlur glow is left out, because it is a canvas image the board composites underneath (2026-11-11). |
| `stick-mirrors-play-stick-style-independent` | Mirrors the floating stick ring and knob drawn in play; independent of tile style. |
| `trail-legend-uses-chip-tile-geometry` | The trail legend is three chip tiles in an L (cells from the board's `computeChipGeometry`, via `resolveChipGridGeometry`) with a miniature trail line over the same dark underlay the board trail uses. The tile geometry is shared with the board; the trail line is a guide-local miniature of the canvas trail. |
| `wrap-legend-calls-edge-marker-draw` | The legend calls `drawEdgeMarker` (the perimeter diamond) instead of a bespoke glyph. Diamonds are unchanged by Chip. Their lit-on-wrap behavior is source-claimed, not observed (audit F17); the copy does not mention it. |
| `level-numeral-calls-wordmark-chip-draw` | The level numeral is drawn by `drawLegacyGlyphWordTileBlock`, the dot-matrix chip renderer the level announcer and wordmarks use, at icon scale. |
| `online-count-calls-menu-counter-chip-draw` | The Online icon calls `drawLegacyPresenceGlyphWord`, the chip draw behind the main-menu online counter (MAZER-UI-024), with a sample two-digit number. |
| `start-legend-calls-chip-marker-draw` | The Start row (added with Chip) calls `drawBoardMarkers` (start): corner brackets and a centre dot, over a chip tile. The copy names no colour. |
| `rank-letters-not-visible-anywhere` | Pending row. Rank letters are not shown (`drawLegacyProgressionBadge` draws nothing). No rank copy until a player-facing rank surface exists. |
| `level1-coach-is-owner-decision` | Pending row. A one-line level-1 coach is a separate owner decision; `src/tutorial/*` is unused. |

## Board Zoom removed (2026-11-06)

Owner decision (Zac): "remove the board zoom setting". The board is a frozen size by product decision; difficulty never comes from zoom or board size. The slider row, its `slider` row kind, the `board-zoom` row id, `LegacySettingsSliderKey`, `sliderRowHeight`, `createBoardZoomSliderRow`, `applyLegacyCameraZoom`, `legacyCameraZoom.ts`, the `camScale` setting (`LegacySettings`, option fields, overlay field commit, persisted game-toggle preferences, remote profile `settings` payload) and the `userBoardZoom` visual diagnostic are all deleted. Persistence rule: an older build's stored `camScale` is never read back into settings (the preferences normalizer builds an explicit object), is never re-written, and is scrubbed from the scoped game-toggle blob on load (`scrubRemovedCameraZoomFromGameToggleStorage`); a remote `settings.camScale` is ignored the same way and drops out of the next remote write. Nothing else can drift zoom: `boardZoomContainer` is only a draw-order container and stays at 1x (pinned), the Phaser `wheel` handler only scrolls overlays, there is no pinch handler, and `?advancedOptions=1` / `?devOptions=1` no longer paint any zoom row (only the flag resolver remains). Reflow after removal: the sheet plan is unchanged apart from the missing 68 px row, so the sheet stays centred with rows >= 48/52 px; the rail appears only on true overflow (signed-in menu at 320x568: 590 px natural vs 552 px panel).

## Wiring status (2026-11-06, Wave 5C wiring lane)

What shipped in the wiring PR:

- One painter for both contexts: `buildOptionsOverlay` and `buildPauseOverlay` are thin entries into `buildLegacySettingsSheetOverlay(context)`, which paints `buildLegacySettingsSheetPlan`. Menu hides Resume, the Settings disclosure and Quit to Menu; pause hides the Account section (Reset progress, Sign out). The Settings group (How to play, Display, Trail Fade, Trail Shine, Animated Background) is the same plan rows at the same size in both.
- (Superseded 2026-11-06, see Exit contract.) The labelled `Close` pill (`createOverlayClosePill`) that first replaced the bare chevron on the settings and guide sheets was removed; the primary Resume / Back to Menu row is the exit. The leaderboard and account overlays keep `createOverlayBackChevronButton` (out of scope).
- Rows keep the full inner width while scrolling; the scroll rail sits in the card padding (`scrollRailViewport`). Toggle labels wrap to two lines and never shrink under 14 px; the state word is its own column.
- The Guide is a sheet, not a dropdown: opened by the `How to play` row from both contexts, painted from `buildLegacyGuideSheetModel` and `buildLegacyGuideSheetPlan`, `Got it` footer pinned. It is a sub-view of the options/pause overlay (`settingsGuideOpen`), so Pause keeps holding the run while it is open. Back, Escape and `Got it` return to Settings.
- Guide icons: goal star (`drawLegacyGoalStarMarker`) and wrap diamond (`drawEdgeMarker`) call the board draw functions. Player, move stick, trail swatch and level numeral are guide-local (reason ids in the table above; trail and levels stay `chip-wiring`). The old "begin at gold" start row is gone.
- Reset progress (menu Settings, Account section): two-step. Step 1 is the confirm card (`Level N -> Level 1`, one consequence line, Cancel first and default, `Reset to Level 1` armed after 600 ms). Step 2 is the result on the same card (working, done, failed or blocked). Account scope names the leaderboard standing; device scope says "on this device". Cancel, Back and Escape return to the Settings sheet (overlay routing now treats `options` as a recorded origin).
- `resetLegacyPlayerProgression` is server-first and async: for a signed-in provider-eligible account with remote progression on, it awaits `writeLegacyRemoteProgressionState(..., 'replace')` (`mazer_reset_progression`), and only on success applies the local effects (baseline for both tracks, outbox and cycle telemetry removed) using the keys of the account the reset was requested for. A failed or conflicting server call leaves local progression untouched and shows the failure. Guests or remote-off reset the device key only. A reset requested while a run is active is blocked.

Not done, deliberately:

- The URL-flagged advanced rows (Maze Scale, Camera Scale, Path/Wall RGB; `?advancedOptions=1`) and the hidden Move Speed slider are no longer painted: they are not part of the shared spec and had no plan vocabulary. `resolveLegacyAdvancedOptionsVisible` is kept.
- Multi-device reset epoch (BLOCKED-ON-OWNER, see above) and clearing the legacy guest progression key on account reset are not implemented. Guest play is disabled (`LEGACY_GUEST_PLAY_ACCESS_ENABLED = false`), so the guest-key re-import path only matters for progress saved before that.
- `scripts/analysis/capture-ui-surfaces.mjs` still expects the old Guide dropdown (`guidePanel` bounds, GUIDE label) and the docked Sign out bar; it needs a follow-up in its own lane (out of scope here). Its `closeOverlayToMenu` also clicks the `backChevron` diagnostic to leave Options; Options no longer registers one, so that step must press Escape or click `Back to Menu` instead (same follow-up).
- `legacyPauseMenuView.ts` (layout) and `legacyUiStandards.ts` (`resolveLegacyOptionsGuideLayout`, toggle/feature layouts) are no longer consumed by the scene; they stay for their own tests and are candidates for removal.

## Chip wiring status (2026-11-06)

The `chip-wiring` guide todos are closed: goal, start, trail and levels icons now share a board draw (see the reason ids above); `you` and `move` stay guide-local. The pending `start-marker` row became the shown Start row. The drift test pins this (`tests/reset/legacy-guide-content-drift.test.ts`).
