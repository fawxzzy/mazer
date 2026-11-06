# Mazer run-status view-model (2026-11-05)

Board card: `mazer-shared-run-status-panel`. Scope of this packet: the pure view-model only.

## Status

- Source: `src/legacy-runtime/legacyRunStatusViewModel.ts` (pure; no Phaser, no rendering).
- Tests: `tests/reset/legacy-run-status-view-model.test.ts`.
- Not wired. `MenuScene` still does not use the panel or this module, consistent with the no score/rank panel stance in `docs/current-truth.md` and the guard assertions in `tests/scenes/menu-render-frame.test.ts`. `resolveLegacyRunStatusPanelLayout` is reused unchanged.

## Contract

`buildLegacyRunStatusViewModel({ mode?, rank?, mazeLevel?, score? })` returns two rows.

| Row | Text | Notes |
| --- | --- | --- |
| 1 (`rankRow`) | `Rank: <E..S>` | Rank-only public badge. Missing or invalid rank renders `Rank: --`. Never uses Skill or Player Skill wording. |
| 2 (`detailRow`) | `Maze Lvl <n> \| Score: <s>/100` | `Score: --/100` when no canonical score exists. |

- `mode` (`menu` or `play`) is accepted for call-site clarity and has no effect: menu and play produce identical output.
- Rank: trimmed, case-insensitive match against `E D C B A S`; anything else is the `--` placeholder.
- Maze level: number (safe integers only, floored), bigint, or unsigned decimal string. Values below 1 clamp to `1`; missing, NaN, non-numeric and unsafe numbers render `--`. Strings and bigint stay lossless above `Number.MAX_SAFE_INTEGER` (the visible ordinal has no application ceiling).
- Score: finite number only. Rounded half up, clamped to `0..100`. `undefined`, `null`, `NaN`, `Infinity` and non-numbers produce the `--` placeholder. The module only formats; it never calculates a score.
- Each row carries `text`, `segments` (atomic pieces for compact fitting) and `accessibilityLabel`. The model also carries `values` (normalized rank, level string, integer score or null) and a combined `accessibilityLabel`.
- Layout hook: `resolveLegacyRunStatusViewModelLayout(viewportWidth, availableWidth?)` returns `{ panel, maxTextWidth }`, where `panel` is the unmodified `resolveLegacyRunStatusPanelLayout` result and `maxTextWidth = floor((width - 2 * horizontalPadding) * textWidthSafetyRatio)`.

## Deliberate deviations from the board card text (needs owner decision)

- The card describes time on row one and `AI Rank` in menu context. This packet follows the packet brief instead: row one is the rank-only badge, and menu and play strings are identical (`Rank: X` in both). Adding a time row or an `AI Rank` menu prefix is a later, explicit decision.
- The card writes `Maze Lvl: N`; the brief specifies `Maze Lvl <n>` (no colon), which is what ships here.

## Later packet (not done here)

Wiring and rendering require:

1. `MenuScene` edits (draw the two rows with the layout hook, Pause placement in play), plus updating the `menu-render-frame` guard assertions that currently forbid the panel.
2. The canonical finalized 0-100 run score field exposed on the run result/telemetry path (`mazeCycleRunQualityScorer.mjs` computes a score, but the single canonical field for display is not yet selected). Until it exists, callers pass no score and the panel shows `Score: --/100`.
3. Viewport and text-fit proof at phone and desktop widths per the card's proof plan.
