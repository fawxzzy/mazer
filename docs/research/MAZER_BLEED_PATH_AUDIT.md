# Bleed-off path audit and limits (L8)

A bleed-off path is a pair of opposite border openings on one line (a row for left/right, a column for
top/bottom): stepping out of one re-enters the other. Code: `src/legacy-runtime/legacyBleedPaths.ts`.
Measurement script: `npx vite-node scripts/analysis/measure-bleed-paths.ts [seeds] [least-saving]`.

## Measurement (gameplay budget ladder, 6 seeds per row, phone 23:51 and desktop 45:27 boards)

"Route ratio" is the shortest route with every wrap open divided by the shortest route with no wrap. "Worst
single saving" is the biggest share of the direct route one path removes on its own.

| Level | Paths per axis (h/v, max) | Route ratio min / mean (phone) | Route ratio min / mean (desktop) | Worst single saving (phone / desktop) |
|---|---|---|---|---|
| 2-8 | 0 / 0 | 100% | 100% | 0% |
| 10 | 0 / 1 | 34% / 66% | 62% / 89% | 66% / 38% |
| 20 | 0 / 1 | 43% / 59% | 69% / 84% | 57% / 31% |
| 30 | 1 / 1 | 17% / 61% | 44% / 75% | 83% / 56% |
| 50 | 1 / 1 | 36% / 61% | 17% / 60% | 64% / 83% |
| 100 | 1 / 1 | 53% / 77% | 23% / 71% | 47% / 77% |
| 120 | 0 / 1 | 55% / 79% | 71% / 88% | 45% / 29% |
| 140-288 | 0 / 0 | 100% | 100% | 0% |

Conclusions:
- The ladder already has at most one path per axis (levels 10-120); the count cap is not what hurts.
- The damage is placement. The carve-cost pick of the mandatory line routinely lands a wrap that removes
  half to four fifths of the shortest route (mean route left: 59-79%, worst 17%). The felt-difficulty
  tuner prices the wrap saving, so levels still land on target, but the wrap is the dominant shortcut.
- Band profiles (menu demo, default profile) carry many openings by design (MAZER-VIS-052) and are not part
  of gameplay; they are left unchanged.

## What shipped

1. `legacyBleedPaths.ts`: list paths per axis, wrap-aware shortest route with any path closed, audit
   (with / without each path), and limits: cap per axis (1; 2 only when the axis is 41+ cells and the profile
   asked for 2+ per side; two on one axis must be at least max(8, axis/3) lines apart), a single path may not
   save more than 30% of the direct route, kept paths may not take the route below 60% of direct. A required
   axis (mandatory opposite-border connection) always keeps its least harmful path. Deterministic: ordered by
   saving, then line.
2. Earlier placement: profile option `bleedPlacement: 'least-saving'` picks each mandatory line by trial
   (carve the spokes on a copy, measure) aiming the saving at 15% of the direct route. With it, levels 10-120
   measure (6 seeds): route ratio mean 84-95%, worst single saving 16-35% (was 29-83%).
3. Limits run in generation, after the border openings are normalised, for gameplay profiles only (budget
   ladder or `bleedPlacement` set). For the shipped ladder they change nothing (golden fingerprints hold).
4. Gate-ready: `BleedPath.gated` plus `isBleedPathAvailable(path, triggeredKeys)`; `auditBleedPaths` and the
   search take the triggered set, so a gated path is unavailable until lit. No gate tile is built (L10).

## Switched on: ladder default (L8b, 2026-11-19)

Owner pick (2026-11-19): `bleedPlacement: 'least-saving'` is now part of the budget-ladder base profile
(`legacyGeometryBudget.ts`, `BASE_PROFILE`), so every ladder level picks its wrap line by trial. The menu demo
keeps the old seeded pick (its levels 10-13 borrow the ladder profile and drop the key; levels 14+ use the band
profile, which never had it), and the band/default profiles are unchanged (MAZER-VIS-052).

Before / after, measured with `npx vite-node scripts/analysis/measure-bleed-paths.ts <seeds> seeded|shipped <levels>`
(`seeded` forces the old carve-cost pick, `shipped` is the new default), both frozen boards:

| Sample | Mean route left (all wraps open / no wrap) | Mazes whose route drops under 50% | Off the felt window | Build ms mean (max) |
|---|---|---|---|---|
| Levels 10-120 step 10, 20 seeds (480 mazes), before | 71% | 115 | 0 | 80 (394) |
| same, after | 87% | 3 | 0 | 30 (199) |
| Every level 10-139, 6 seeds (1560 mazes), before | 73% | 345 | 0 | 58 (301) |
| same, after | 88% | 13 | 0 | 54 (328) |

Per band (20 seeds, phone / desktop mean route left, before -> after): L10 70/88 -> 95/91, L30 58/58 -> 89/87,
L50 69/59 -> 85/82, L70 72/61 -> 80/82, L100 76/69 -> 90/89, L120 76/88 -> 91/91. Build time is wall clock on a
dev machine and noisy (a second 20-seed run gave 52 -> 23 ms mean); it did not rise in any run (cause not profiled; plausibly fewer base candidates rejected by the tuner).

What remains: a required axis always keeps its least harmful line, so a few mazes (13 of 1560) still lose
more than half of the route to a wrap (worst 30%, level 71 desktop) when no line on that axis is modest. The
L10 gate tile can hide those; a later pass could also re-roll the base when the best line saves over 50%.

Re-pinned deliberately: the ladder golden fingerprints (`tests/fixtures/progression-ladder-golden.v1.json`,
also read by the hazard flag parity test): 111 phone and 102 desktop levels moved, all inside the wrapped band
10-133; levels 1-9 and 134-300 are byte-identical. The gameplay profile sha256 in `legacy-menu-demo-bleed`
(the 47 ladder profiles gain the one key; without it they hash to the old pin). The wrap-pricing tuner test
allows one of its eight new bases to miss the window (the generator walks on to the next base for those).

## Bleed gates (L10, Gate D "Pulse ring")

Some wrapped levels hide one bleed-off path behind a gate tile: a dashed ring with two chevrons along the
path's axis. Its two border openings are wall (drawn and navigated) until the player passes over the gate;
the ring then lights (0.6 s), and the path draws in on the pulse (1.6 s; instant under Reduce Motion).

- Cadence (`src/legacy-runtime/legacyBleedGates.ts`): no gate before level 20 (`BLEED_GATE_FIRST_LEVEL`;
  wraps start at 10). From 20 a level asks for a gate with a chance rising 0.3 -> 0.7 by level 100, decided
  by a hash of the level alone. Wraps fade out by 140, so gates do too. At most one gate per maze.
- Placement: the bleed path that saves the most; hiding it must not strand any floor. The gate tile is at
  least `max(8, 15% of the hidden route)` walking steps from the path's mouths (never adjacent), off every
  shortest route (with the path hidden and with it open), and walking to it first must still beat ignoring
  it. Dead ends are preferred. A level that asks but has no such tile carries no gate.
- Golden seeds (seed 20261106 + level): gated phone levels include 28, 31, 32, 34, 36, 42, 46, 56; desktop
  22, 24, 28, 31, 32, 34, 42, 46. Live games use their own seeds, so a given level may or may not be gated.
  With least-saving placement (L8b) fewer asking levels find a gate tile: over levels 20-139 (69 ask) the
  golden seeds gate 35 phone / 37 desktop mazes, down from 46 / 45 with the old pick (a modest wrap rarely
  makes the detour to a far gate worth it). Cadence (which levels ask) is unchanged.
- Determinism: gates are a post-pass on the finished maze (`legacyGenerationLifecycle.ts`); the grid, start,
  goal and solution path are untouched, so the ladder golden fingerprints do not move.
- Runtime (`legacyBleedGateState.ts`): lit state is per attempt (reset on restart), keyed by the maze's gates
  array. Pass-over checks the player tile and the last 4 trail tiles.
- Pricing: `measureLegacyGatedWrapSaving` prices an unlit gated path as unavailable until the gate is walked
  to. The felt tuner's `wrapStats` still prices the open maze, so a gated level plays somewhat harder than its
  slot. Follow-up: re-land gated levels in the felt tuner (it moves ladder ordering, so it needs a re-baseline).
- Menu demo: the AI walks to the gate first (leg 1 on the hidden maze), then on to the goal through the wrap
  (leg 2), with one continuous trail (`legacyMenuDemoBleedGates.ts`).
