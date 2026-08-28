# ADR: Generation V2 Wave 2 Foundation

## Status

Proposed, `2026-08-28`. Written as Generation V2 Wave 1.5 PR C, the third
of three dependency-ordered PRs (PR A: `#318`, contracts/identity/seeding;
PR B: `#319`, generator-convergence harness). This ADR is the decision
point Wave 1.5 exists to produce -- Wave 2 itself is not implemented here.

## Context

Two maze generators already exist in this repository:

- **`src/legacy-runtime`** -- today's real production generator. Powers
  every play-mode and menu-demo maze live users see. Has a whole dedicated
  contract doc ([`MAZER-EDGE-WRAP-TOPOLOGY-CONTRACT.md`](MAZER-EDGE-WRAP-TOPOLOGY-CONTRACT.md))
  for its wrap/bleed topology feature, and a bounded-candidate-search
  selection mechanism tuned against real progression data
  (`legacyProgression.ts`'s `targetComplexity` axis).
- **`src/domain/maze`** -- a presentation/demo-only generator. Not wired
  into gameplay, progression, or Supabase. Has its own A* solver, an
  explicit anti-straightness generation phase, and a shortcut-carving
  concept, none of which exist in legacy-runtime.

Generation V2 (`src/domain/mazeV2/`) is a from-scratch, fully additive,
offline-only domain model -- contracts, identity/hashing, and a neutral
canonical-maze + shared-analyzer pair (Wave 1 + Wave 1.5 PR A + PR B) --
built with the explicit goal of eventually replacing however maze
generation works in production, once a real Wave 2 generator exists behind
it. **No Wave 2 generator exists yet.** This ADR decides what it should be
built from.

The original Wave 1.5 brief carried a stated hypothesis: "Option B --
extracting `domain/maze` primitives into a shared engine -- is likely
strongest." PR B was commissioned specifically to test that hypothesis
against real, measured evidence rather than accept it on priors. **The
evidence changes the answer** -- see Decision below.

## Decision drivers

1. **legacy-runtime's felt difficulty and wrap topology are live,
   production-tuned, and load-bearing.** Any foundation choice that risks
   silently changing them for existing players is a real cost, not a
   free architectural preference.
2. **Neither engine has a recipe resolver** (target vector -> absolute
   generator parameters). Whichever foundation is chosen, Wave 2's first
   real implementation work is building that resolver either way -- it is
   not evidence in favor of either engine.
3. **PR B's capability matrix showed the two engines are closer to
   complementary than redundant** -- legacy-runtime owns wrap/bleed
   topology and working route-length targeting; `domain/maze` owns an
   explicit anti-straightness pass and shortcut carving. Neither owns
   deceptive dead-end placement.
4. **PR B's measured findings showed `domain/maze`'s default carving
   character is dramatically different from legacy-runtime's** -- 31.5-173
   junctions and 22-164 dead ends per maze at the lowest complexity recipe,
   versus legacy-runtime's 0.625 junctions and 0 dead ends at the same
   nominal complexity. This is not a tuning knob away from parity; it is a
   different carving algorithm's inherent shape (a full perfect-maze
   spanning-tree carve versus legacy-runtime's much sparser, open-corridor-
   biased carve).
5. **Timeline and blast radius**: this repo's own migration-discipline
   history this session (see PR #314's revert of an in-place migration
   edit) argues for the smallest-blast-radius path that still gets Wave 2
   built on a real contract, not the most architecturally elegant one.

## Options considered

### Option A -- Extend legacy-runtime in place

Keep legacy-runtime as Wave 2's foundation; add missing capabilities
(anti-straightness, shortcuts) directly into it over time; build the
recipe resolver against its existing candidate-search/profile machinery.

- **For**: zero risk to the wrap topology contract or production felt
  difficulty -- nothing about the proven carving changes. Every existing
  test, contract doc, and tuning investment stays valid.
- **Against**: doesn't reuse `domain/maze`'s two genuinely useful,
  already-built primitives (anti-straightness pass, shortcut carving) --
  those would need to be re-implemented against legacy-runtime's own
  representation rather than imported.

### Option B -- Extract `domain/maze` primitives into a shared engine (the original hypothesis)

Adopt `domain/maze`'s carving core (`core.ts`'s `buildMazeCore`) as Wave
2's foundation; port legacy-runtime's wrap/bleed topology and route-length
targeting on top of it.

- **For**: inherits anti-straightness and shortcut carving for free;
  `domain/maze`'s `MazeGenerationTrace` gives real step-by-step generation
  provenance neither the current production generator nor Option A has.
- **Against, backed by PR B's actual measurements**: the carving core
  itself produces dramatically different topology by default (finding #1
  in PR B's doc) -- adopting it wholesale is not a neutral engine swap, it
  is a full difficulty-curve rework that would need extensive re-tuning
  against real progression data before it could safely reach production.
  It also has **no** wrap/bleed topology concept at all in its type
  contract -- porting legacy-runtime's wrap feature onto it means writing
  wrap support into a carving algorithm that was never designed with edge
  connectivity in mind, a materially larger lift than the original
  hypothesis assumed. And `domain/maze`'s own width/height handling is
  approximate (quantized through `normalizeLogicalSize`, PR B finding #3),
  another contract mismatch to absorb.

### Option C -- Greenfield Wave 2 generator, built fresh against the MazeV2 contract

Design a new carving algorithm from scratch, targeting
`MazeV2ResolvedGenerationContract` directly; treat both existing engines
purely as reference material, porting isolated primitives (A* solver,
anti-straightness shaping, shortcut heuristic, wrap/bleed topology logic)
into the new codebase rather than inheriting either one's carving core.

- **For**: cleanest long-term contract fit -- built against
  `MazeV2LogicalCapacity`/`MazeV2TargetVector` from day one instead of
  retrofitted onto either legacy engine's own opinions about width/height,
  scale, or complexity.
- **Against**: highest short-term cost and risk -- a new carving algorithm
  has no production track record at all, and re-deriving wrap/bleed
  topology from scratch discards legacy-runtime's already-proven,
  contract-documented implementation for no measured benefit.

### Option D -- Permanent dual-generator split

Keep legacy-runtime for production play/menu-demo mazes indefinitely; keep
`domain/maze` (or a lightly evolved version of it) scoped to non-gameplay
presentation contexts only; never converge them, and never build a Wave 2
generator that replaces either.

- **For**: zero migration risk of any kind.
- **Against**: abandons Generation V2's actual purpose (a single
  future foundation genuinely built), and leaves the two engines'
  overlapping-but-inconsistent capabilities (this ADR's whole reason for
  existing) permanently unresolved rather than deliberately chosen.

## Decision

**Option A, augmented with targeted, isolated ports from `domain/maze` --
not Option B as originally hypothesized.**

Wave 2's generator foundation is legacy-runtime's own carving core and
wrap/bleed topology machinery, kept exactly as production-proven today.
Two specific, self-contained primitives from `domain/maze` are ported (not
inherited wholesale) into that foundation as Wave 2 lands:

1. **An explicit anti-straightness shaping phase**, modeled on
   `domain/maze`'s `MazeGenerationPhase`/`MazeGenerationTrace` pattern, run
   as an additional pass over legacy-runtime's own carved grid rather than
   a different carving algorithm.
2. **A shortcut-carving concept**, adapted to legacy-runtime's own tile
   representation, giving `shortcutRelief` a real generator-side
   implementation for the first time (today legacy-runtime is rated
   `unsupported` on this axis -- see PR B's capability matrix).

`domain/maze`'s A* solver (`grid.ts`'s `MinHeap`/`AStarScratch`) is also
worth adopting as Wave 2's solve strategy regardless of carving choice,
since neither engine's solver is tied to its own carving logic -- this is
a low-risk, high-value port independent of the rest of this decision.

This reverses the brief's original hypothesis. That reversal is the
correct outcome of commissioning PR B: the hypothesis was reasonable
before real measurement existed, and the measurement said something
different. Adopting `domain/maze`'s carving core wholesale (true Option B)
would mean re-tuning felt difficulty from scratch against a carving
algorithm with zero production history, to gain two primitives that port
cleanly on their own without requiring that risk.

## Architecture boundaries for Wave 2

- **Wave 2's generator lives in a new module** (`src/domain/mazeV2/generator/`,
  name not yet finalized) that produces `MazeV2CanonicalMaze` and
  `MazeV2MeasuredMetrics` (via `canonicalAnalyzer.ts`, unchanged) directly
  -- it does not produce a `LegacyMazeSnapshot` and is not required to
  match legacy-runtime's own internal types, only its carving behavior and
  wrap/bleed contract.
- **The wrap/bleed topology contract
  ([`MAZER-EDGE-WRAP-TOPOLOGY-CONTRACT.md`](MAZER-EDGE-WRAP-TOPOLOGY-CONTRACT.md))
  is authoritative and unchanged.** Wave 2's carving must satisfy it, not
  redefine it. `MazeV2CanonicalMaze.wrapPairs` graduates from "always empty
  in every bridge built so far" to genuinely populated once Wave 2 exists.
- **The recipe resolver (`MazeV2TargetRecipe` ->
  `MazeV2ResolvedGenerationContract`, still fully unbuilt) is Wave 2's
  first real implementation milestone**, not a Wave 1.5 deliverable and
  not assumed to exist by anything in PR A/B.
- **Legacy-runtime is not modified by Wave 2's early milestones.** Wave 2
  is built and validated entirely inside `src/domain/mazeV2/` against the
  offline lab/convergence harness this Wave already has, exactly like
  Waves 1/1.5. It only becomes load-bearing when a later, separate wave
  explicitly wires it into `MenuScene`/play-mode generation -- a cutover
  this ADR does not authorize and does not schedule.
- **`domain/maze` stays presentation/demo-only.** Nothing in this decision
  moves gameplay onto it, before or after Wave 2; the two ported primitives
  are copied/adapted into Wave 2's own module, not imported live from
  `src/domain/maze` (avoiding a runtime dependency between an offline
  domain module and a presentation module that has its own independent
  release cadence).

## Wave 2 implementation brief (not implemented in this PR)

Suggested milestone order for whichever future PR(s) take this on:

1. **Recipe resolver** -- `MazeV2TargetRecipe` + `MazeV2LogicalCapacity` ->
   `MazeV2ResolvedGenerationContract`'s currently-unbuilt per-axis absolute
   targets (`MazeV2RecipeResolutionTargets`). Blocks everything else; has
   no dependency on the carving decision above.
2. **Carving core**, built as legacy-runtime's algorithm re-expressed
   against `MazeV2CanonicalMaze` output instead of `LegacyMazeSnapshot`,
   with the anti-straightness and shortcut ports folded in from the start
   rather than bolted on after.
3. **Solver**, adopting `domain/maze`'s A* implementation directly.
4. **Re-run the Wave 1.5 PR B convergence harness a third time**, this
   time comparing Wave 2's real output against both existing engines on
   the same corpus, before any production wiring decision is made.
5. **Production cutover** is explicitly a separate, later decision --
   not scheduled or authorized by this ADR.

## Non-goals (unchanged from PR A/B)

Does not touch `MenuScene`, progression, Supabase, leaderboard, or
production generation. Does not implement the recipe resolver or a Wave 2
generator. Does not schedule a production cutover date.

## Risks and open questions

- **Anti-straightness/shortcut ports may interact unexpectedly with
  wrap/bleed topology** -- neither primitive was designed with edge-wrap
  connectivity in mind (they come from an engine that has none). Milestone
  2 above should treat this as a real integration risk requiring its own
  test pass, not an assumed-safe copy.
- **The recipe resolver's design is still completely open** -- this ADR
  picks a carving foundation, not a resolver design. That remains a full
  design problem for whichever PR takes on milestone 1.
- **This ADR's capability-matrix evidence comes from 96 runs, not 960**
  (PR B's own scope note). The qualitative finding (large default topology
  divergence) is unambiguous at this sample size, but per-axis numeric
  targets for the recipe resolver should not be calibrated directly off
  PR B's summary statistics without a larger, resolver-aware follow-up
  measurement.
