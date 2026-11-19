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

## Not switched on

`bleedPlacement: 'least-saving'` is NOT the ladder default: enabling it changes every wrapped ladder maze
and re-pins the golden fingerprints (`legacy-progression-ladder`, hazard flag parity, felt-tuner wrap
pricing) and shifts which levels land in their felt window. Recommended follow-up: flip it on as one ladder
re-baseline with an owner look at a few levels on a phone.
