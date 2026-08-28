# Mazer Generation V2 -- Wave 1.5 PR B: Generator-Convergence Findings

- Date: `2026-08-28`
- Branch: `claude/mazer-menu-row-button-geometry-fix-rescued`
- Segment: Generation V2 Wave 1.5, PR B of three (PR A: contracts/identity/seeding, done; PR B: this doc; PR C: ADR, next)
- Owner chain: `src/domain/mazeV2/canonicalAnalyzer.ts`, `src/domain/mazeV2/adapters/*`, `scripts/analysis/mazev2-convergence.ts`
- Mode: offline, additive, read-only investigation -- no production code touched

## Objective

Compare the two maze generators that already exist in this repository --
`src/legacy-runtime` (today's real production generator) and
`src/domain/maze` (a presentation/demo-only generator, not wired into
gameplay) -- on genuinely equal footing, to give PR C's ADR real evidence
instead of a guess about which one (or neither) is the right foundation for
a Wave 2 generator.

## Scope note -- why 96 runs, not 960

The original Wave 1.5 brief specified a 15-recipe x 32-seed x 2-engine
corpus (960 runs) driven through a formal recipe resolver
(`MazeV2TargetRecipe` -> `MazeV2ResolvedGenerationContract`). That resolver
does not exist in either engine yet -- Wave 1.5's own `types.ts` explicitly
leaves per-axis target resolution unbuilt
(`MazeV2RecipeResolutionTargets`'s own header comment). Building a resolver
just to hit the brief's run count would mean fabricating a component Wave 2
hasn't designed yet.

Instead, this harness drives both engines from six concrete, neutral specs
(`CONCRETE_COMPARISON_RECIPES` in `mazev2-convergence.ts`, spanning
small/large boards x low/mid/high complexity) across eight committed seeds
= **96 real generation runs, 48 per engine**. Smaller than the literal
spec, but every number below came from an actual generator call, not an
extrapolation.

## The one shared analyzer

Both engines' output is bridged into the same neutral `MazeV2CanonicalMaze`
shape (`canonicalMaze.ts` for legacy-runtime, `adapters/canonicalMazeFromDomainMaze.ts`
for `src/domain/maze`), then measured by the **same** function,
`canonicalAnalyzer.ts`'s `analyzeMazeV2CanonicalMaze` -- fresh BFS-based
route/junction/dead-end/turn/cycle-rank computation from the raw walkable
grid, trusting neither engine's own internal bookkeeping. This is
deliberately a *different* entry point from `metrics.ts`'s
`analyzeLegacyMazeAsMazeV2Metrics` (PR A, already shipped and tested against
`LegacyMazeSnapshot`'s own legacy-only "direct floor vs playable route"
comparison) -- unifying the two is a reasonable future cleanup, not
attempted here to avoid destabilizing PR A's already-shipped contract.

## Capability matrix

Per-axis assessment from each adapter (`native` = direct generator input,
`adaptable` = achievable but not a first-class dial, `indirect` = emergent
side effect only, `unsupported` = no concept found at all):

| Axis | legacy-runtime | src/domain/maze |
|---|---|---|
| spatialLoad | adaptable -- one device-relative `scale` number, not literal width/height | adaptable -- width/height are quantized through an internal logical-carving lattice before rendering |
| routeBurden | native -- `targetComplexity` directly drives the bounded-candidate-search route-length target | adaptable -- `minSolutionLength` is a floor, not a precise target |
| decisionBurden | adaptable -- emergent from carving params | indirect -- emergent from family/braid tuning |
| deadEndDeception | indirect -- no explicit deceptive-branch placement | unsupported -- no concept found in `generator.ts`/`core.ts`'s public surface |
| turningLoad | indirect -- no explicit turn-shaping found | **native** -- explicit anti-straightness generation phase (`MazeGenerationPhase` includes `'anti-straightness'`) |
| routeAmbiguity | adaptable -- braid ratio adds loops but isn't itself a target | adaptable -- same pattern |
| shortcutRelief | **unsupported** -- no shortcut-carving concept found | **native** -- `MazeEpisode.shortcutsCreated`/`shortcutCountModifier` are first-class |
| wrapPressure | **native** -- wrap/bleed topology is a tuned, first-class feature (aggregate counts only; see per-pair bridge-fidelity gap below) | **unsupported** -- no wrap/bleed concept anywhere in the type contract |

**Reading this matrix**: the two engines are close to complementary, not
redundant. legacy-runtime owns wrap/bleed topology and route-length
targeting; `src/domain/maze` owns anti-straightness shaping and shortcut
carving. Neither owns deceptive dead-end placement. This is the strongest
single input PR C's ADR has for evaluating "Option B: extract
`src/domain/maze` primitives into a shared engine" -- that option inherits
real, useful capabilities (anti-straightness, shortcuts) but would need to
either import or re-derive wrap/bleed topology and route-length targeting
from legacy-runtime, both non-trivial.

## Measured findings (96 real runs)

Full per-run data: `mazev2-convergence-runs.json`. Per-recipe summary:
`mazev2-convergence-summary.json`. Rendered report:
`mazev2-convergence-report.html`. All three written by
`scripts/analysis/mazev2-convergence.ts` to
`C:\ATLAS\tmp\captures\mazev2-convergence\` (gitignored scratch output, not
committed -- regenerate with `npx tsx scripts/analysis/mazev2-convergence.ts`).

1. **`src/domain/maze` produces dramatically denser topology than
   legacy-runtime at comparable complexity.** At the lowest complexity
   recipe (`small-low`/`large-low`, `targetComplexity: 8`), legacy-runtime
   averaged **0.625 junctions and 0 dead ends** per maze, while
   `src/domain/maze` averaged **31.5-173 junctions and 22-164 dead ends** on
   boards of similar scale. This isn't a bug in either engine -- it reflects
   a genuine difference in default carving character: `src/domain/maze`
   carves a full perfect-maze spanning tree by default (branch-dense,
   many dead ends, by construction), while legacy-runtime's low-complexity
   output favors long open corridors with very little branching. **This
   matters directly for PR C**: adopting `src/domain/maze`'s carving as
   Wave 2's foundation (Option B) would substantially change the game's
   felt branchiness/difficulty curve at low levels unless heavily re-tuned
   first -- it is not a drop-in replacement for legacy-runtime's current
   feel.

2. **legacy-runtime's `small-*` and `large-*` recipes produced IDENTICAL
   metrics.** This is a real adapter limitation, not a generator finding:
   `legacyRuntimeAdapter.ts` cannot route the neutral spec's `width`/`height`
   into `createLegacyRuntimeMazeForMode` at all -- that function takes one
   device-relative `scale` number, held fixed at `COMPARISON_BOARD_SCALE = 50`
   for this whole harness (mirroring the existing offline lab's own
   isolation choice). The `small-*`/`large-*` distinction was only ever
   exercised on the `src/domain/maze` side. A future iteration of this
   harness that wants a genuine board-scale axis for legacy-runtime would
   need to vary `scale` directly instead of `width`/`height`.

3. **Both engines' "requested size" is approximate, not exact -- for
   different reasons.** `src/domain/maze` quantizes requested width/height
   through `normalizeLogicalSize` (`max(4, floor((n+1)/2))`) before doubling
   back up for the playable raster, so a requested 16 becomes a 15-wide
   board, not 16. legacy-runtime has no width/height input at all, only
   `scale`. Neither engine's canonical-maze bridge should be trusted to
   produce exactly the dimensions a caller asked for -- confirmed by this
   PR's own adapter tests, which deliberately assert `width > 0` /
   `height > 0` rather than exact equality after the first version of this
   harness caught the mismatch (8 returned instead of 16 for
   `src/domain/maze`; 49 instead of 16 for legacy-runtime).

4. **`src/domain/maze` is meaningfully faster at large boards, comparable at
   small ones.** At the `large-*` recipes (50x50 requested), legacy-runtime
   averaged 55-172ms per generation versus `src/domain/maze`'s 112-126ms --
   actually slower for domain-maze at the top end once its own quantized
   board is larger than legacy-runtime's fixed scale-50 board. At `small-*`
   recipes, both are within the same rough range (12-165ms). Generation
   duration is not a strong differentiator either way at these sizes.

5. **detourRatio behaves oppositely across complexity for the two engines.**
   legacy-runtime's detour ratio *increases* with `targetComplexity` (3.29 ->
   5.36), meaning higher complexity produces routes proportionally further
   from the direct Manhattan distance -- consistent with `targetComplexity`
   being a real, working route-length dial. `src/domain/maze`'s detour ratio
   *decreases* with the same complexity dial (2.01 -> 1.30 at small scale),
   because `minSolutionLength` is only a floor -- raising it doesn't push the
   route further from Manhattan distance once the perfect-maze carve already
   exceeds that floor by default. This is further evidence for capability
   row 2 above (`routeBurden`: `native` for legacy-runtime, `adaptable` for
   `src/domain/maze`) rather than a new finding.

## Reuse inventory -- `src/domain/maze` primitives worth carrying into Wave 2

Concrete, real components (not aspirational) a Wave 2 generator could
directly reuse or closely model, regardless of which ADR option is chosen:

- **`grid.ts`'s `MinHeap` + `AStarScratch`** -- a real, allocation-conscious
  A* implementation distinct from legacy-runtime's BFS-based shortest path.
  Worth keeping as Wave 2's solver regardless of which carving algorithm
  wins, since neither existing engine's solver is tied to its own carving
  logic.
- **The anti-straightness generation phase** (`MazeGenerationPhase` /
  `MazeGenerationTrace`) -- the only engine of the two with an explicit,
  named turning-shape pass. `turningLoad`'s `native` rating above is
  entirely due to this.
- **Shortcut carving** (`MazeEpisode.shortcutsCreated`,
  `shortcutCountModifier`, the `isLegacyRasterShortcutCandidate`-style
  logic in `generator.ts`) -- legacy-runtime has no equivalent concept at
  all; this is the only existing source for `shortcutRelief`.
- **`MazeFamily` presentation presets** (`classic`/`braided`/`sparse`/
  `dense`/`framed`/`split-flow`) -- a genuine existing vocabulary for
  spatial-character variation that neither the mazeV2 target vector nor
  legacy-runtime currently expose as a named concept.
- **`MazeGenerationTrace`** -- step-by-step provenance of which tiles were
  touched during which phase (seed/carve/braid/family/presentation/
  anti-straightness). No equivalent exists in legacy-runtime; potentially
  valuable for Wave 2 debugging/visualization tooling regardless of which
  carving algorithm is chosen.

Not reusable as-is: `core.ts`'s carving algorithm itself is tightly coupled
to this engine's own `MazeCore`/quantized-lattice representation and its
total absence of wrap/bleed topology -- adapting it to legacy-runtime's
wrap-aware world would be a rewrite of the carving core, not a lift.

## What this PR does NOT do

- Does not implement a Wave 2 generator.
- Does not implement the target-vector -> absolute-axis recipe resolver
  (still unbuilt in both engines).
- Does not touch `MenuScene`, progression, Supabase, leaderboard, or
  production generation.
- Does not select a direction for Wave 2 -- that's PR C's ADR, informed by
  this doc.

## Proof

- `npx tsc --noEmit` -- clean.
- `npx vitest run tests/mazeV2/` -- 68/68 passing (adds
  `canonicalAnalyzer.test.ts` and `adapters.test.ts` to PR A's existing
  `hashing.test.ts`/`identity.test.ts`/`types.test.ts`).
- `npx tsx scripts/analysis/mazev2-convergence.ts` -- 96/96 real generation
  runs completed with no errors; artifacts written to
  `C:\ATLAS\tmp\captures\mazev2-convergence\`.
