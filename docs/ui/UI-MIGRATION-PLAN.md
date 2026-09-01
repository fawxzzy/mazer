# Mazer UI Migration Plan (corrected)

An earlier draft of this document proposed a fresh 8-PR migration sequence
(tokens -> primitives -> per-screen migrations) as if this were a new
initiative. It is not. Per `UI-AUDIT.md` §0, a real dependency-ordered "UI
rework" wave system already exists, already on `main`, with its own
governance (`docs/architecture/MAZER-UI-REWORK-*.md`,
`docs/contracts/mazer-ui-rework-*.v1.json`,
`tests/architecture/decision-registry-contract.test.ts`). This document's
job is now just to state the real current status and defer to that system,
not to propose a competing one.

## Current status (read directly from the wave docs, 2026-08-29)

| Wave | Scope | Status |
|---|---|---|
| 0A | Decision registry, architecture guardrails | done |
| 1A | Shared state/commands/view-models foundation | done |
| 1B | Design tokens | done |
| 1C | Diagnostics schema split (`docs/architecture/MAZER-UI-REWORK-DIAGNOSTICS-V1.md`) | done |
| 2A / 2A.1 | DOM primitives (`src/ui/dom/*`) | done, deliberately unmounted |
| 2B | Topology/path geometry contract | done |
| 2C | Asset/icon generator | unclear (no spec) |
| **3A** | **Command bridge / live-scene mapping** | **not started — the actual next wave** |
| 3B | Auth migration (`legacyAuth.ts`, `legacyPlayerMessage.ts`), owner `auth-migration-integrator` | not started, gated behind 3A |
| 4D | Phaser board/title renderer switch | not started, gated behind 3A — **must ship before 3C starts, per AGENTS.md's board-first rule** |
| 3C | DOM primitive mounting, view-model projection, one-overlay enforcement | not started, gated behind 3A **and** 4D |

## Missing step, added per owner direction (2026-08-30): a systematic per-asset/animation pass

Nothing in this document, or anywhere in the registered wave system,
currently covers going through **every individual UI graphic and
animation one at a time** — auditing whether it already uses a real
asset, deciding if it needs a new one made and integrated, or confirming
it's fine to stay procedural. Wave 2C ("Asset/icon generator") is the
only wave-table slot that could plausibly hold this, and it has **zero
backing**: no spec file, and no entry at all in
`docs/contracts/mazer-ui-rework-decision-registry.v1.json` (confirmed —
searched for `"2C"` and `icon-generator`/`asset-generator`, no matches).
Nobody has ever defined this wave's scope, owner, or paths. That's the
gap this section records.

**Known universe of individual UI graphics/animations**, compiled from
this session's own audit work (`UI-AUDIT.md` §4's full 64-function
inventory is the authoritative list — this is a summary, not a
replacement for it):

- **Real bitmap assets already wired in** (this session): the 3 canonical
  HUD icons (profile/leaderboard/settings header icons, menu profile
  button, overlay username button, touch-control settings cog) via
  `applyLegacyHudIconFrame`; the player trail overlay
  (`drawLegacyPlayerTrailTileOverlay`); the bleed-path material
  (`drawLegacyBleedPathImage`); the floor material
  (`boardFloorTileSprite`); the energized-diamond and teleport-beam
  textures used by the title's orbit sigils and player-transfer beams.
- **Still procedural, not yet given a real asset**: the Leaderboard
  screen's own title icon (`drawLegacyLeaderboardTitleGlyph`) — a
  hand-drawn "three ascending bars" reimplementation of an icon that
  already has a real asset one screen away (`UI-AUDIT.md` §3); the
  Guide's illustrative icons (`drawLegacyOptionsGuideGlyph(s)`,
  move/trail concept icons) — a third procedural visual language,
  distinct from both the HUD icons and the real gameplay VFX assets they
  describe; the backdrop starfield (`drawBackdrop`'s star loop) —
  redesigned this session for twinkle/size behavior, but still rendered
  as procedural circles/sparkles, not an asset; the title/orbit-diamond
  choreography (`drawLegacyMenuPathTitleCell/PrismSweep/GemFacets/Diamond/OrbitSigils(Twinkle)`),
  player spawn burst (`drawLegacyPlayerSpawnBurst`), and the pulse-glow/
  spark elements inside `drawLegacyPlayerTransferEnergy`.
- **Deliberately procedural, not a gap**: the shared tile-font glyph
  renderer (`drawLegacyGlyphWordTileBlock` — title, level number,
  Start/Login only) is a typographic system, not a missing image asset;
  don't "fix" this one by generating a picture for it.

**Why this can't just be done freestanding:** almost every function above
lives in `src/scenes/MenuScene.ts`, which the decision registry assigns
exclusively to Wave 3A, and every one of them is Phaser-side world/board
presentation, which `renderer-ownership-split` assigns to Phaser and — for
the actual shipped renderer — to Wave 4D specifically. A per-asset pass
has to route through the same wave-ownership rules as everything else in
this plan (fresh-main preflight, exclusive writer, no drive-by edits from
outside the assigned wave), not happen as an ad hoc side effort. Two ways
this could be structured, for whoever picks it up:

1. **Define Wave 2C for real** — write the missing spec, register it,
   and scope it to the audit-and-source half of this work (deciding what
   needs a new asset, sourcing/generating it — e.g. the ChatGPT-image
   workflow the owner has described elsewhere — and handing off finished
   assets), leaving the actual `MenuScene.ts` integration to whichever
   wave owns rendering at the time (today 3A/4D).
2. **Fold it into Wave 4D's own scope** as an explicit checklist item —
   the renderer-switch wave already touches this exact rendering code, so
   auditing/replacing individual graphics as part of that pass avoids a
   second wave needing write access to the same files.

This document doesn't pick between those two — it's recorded here so the
next redesign step doesn't skip straight from "wire the architecture" to
"ship" without ever systematically working through the asset list itself,
which was an explicit part of the original ask.

**Correction (2026-08-30):** an earlier version of this note said no
dependency was registered between 3A and 3B. Wrong — `scripts/check-decision-registry.mjs`'s
`INTEGRATOR_WAVE_ORDER = ['0C', '1B', '1C', '3A', '3B', '5B']` is enforced
as a locked dependency order (see `UI-AUDIT.md`'s ordering correction for
the exact mechanism). 3B follows 3A in the registered integrator
sequence — it has its own exclusive owner and disjoint path set, but that
doesn't make it unordered relative to 3A. Independently, no ordering
between 3B and 4D is invented here; the board-first sequence (3A → 4D →
3C) is its own separate contract.

## Who owns Wave 3A

Not this worktree/branch by default. This session's own work
(`claude/mazer-menu-row-button-geometry-fix-rescued`) has been targeted
bug/visual fixes to the existing `MenuScene.ts` rendering, confirmed to not
conflict with the registry's wave-ownership lock
(`tests/architecture/decision-registry-contract.test.ts` passes against
these changes). Implementing Wave 3A itself — mapping the live scene into
the Wave 1A state/command model, making the bridge load-bearing — is a
separate, larger undertaking with its own registered scope and, per this
account's own working notes, is more likely to be the other agent/process
that authored Waves 0A-2B than something to start unprompted from an
audit pass. If the owner wants this session specifically to pick up Wave
3A, say so explicitly — it hasn't been assumed here.

## Visual verification gate (required, not supplementary — with a baseline caveat)

`npm run visual:ui-surfaces` (see `UI-AUDIT.md` §7) is a required automated
gate for every UI migration PR under Wave 3A/3B/3C/4D, not a nice-to-have.
**Correction:** an earlier version of this line omitted 3B. It shouldn't
have — this audit's own scope explicitly covers auth/profile, the harness
already captures the Auth surface, and a Wave 3B PR touching
`legacyAuth.ts`/`legacyPlayerMessage.ts` has just as much potential to
regress the sign-in screen as a 3A/3C/4D PR has to regress anything else.
Combined with the Deployment Contract section's own finding that
`verify.yml` doesn't run this harness at all, an excluded 3B would have
meant no automatic *and* no plan-required manual check on the one surface
this harness already covers well. User- or ChatGPT-supplied screenshots
and recordings are useful
*supplementary* evidence — subjective visual feedback, physical-device
behavior, animation timing, production-only rendering defects — but they
do not replace it: at a pinned seed (see below) the harness's maze
topology and 39-check assertion results are reproducible run to run in a
way ad hoc screenshots never are — the raw PNGs themselves are not yet
full pixel-diff material (see below). No migration PR should waive this
gate in favor of manually-supplied images.

**Pin the repository's canonical seed — the default invocation is not
even topology-deterministic, and pinning a seed still doesn't make the
screenshots pixel-deterministic.** Two corrections, not one:

1. **Use `3749`, not a placeholder.** An earlier version of this line
   said "pass a fixed `--maze-seed`" with a bare `<fixed value>`
   placeholder — literal shell syntax Bash parses as redirection, and
   even fixed, an arbitrary per-caller value would mean captures from
   different PRs share no comparable baseline. `3749` is the repository's
   own existing maintained proof seed, already used this exact way
   elsewhere (`docs/research/MAZER_UI_VISUAL_SYSTEM_NEXT_CHUNK_PLAN.md:22`:
   `npm run visual:ui-surfaces -- --skip-build --maze-seed 3749`) and
   across dozens of other scripts/docs/tests. **Every invocation of this
   gate must use exactly `--maze-seed 3749`**, not an arbitrary value
   each caller picks. (Without it, `capture-ui-surfaces.mjs`'s
   `resolveRoute()` never sets the `mazeSeed` URL param, and
   `resolveInitialLegacyRuntimeSeed()` mixes `Date.now()`/`Math.random()`
   into a fresh maze every run —
   `src/legacy-runtime/legacyRuntimeSeed.ts`.)
2. **Pinning the maze seed only fixes maze topology, not the screenshot
   pixels.** `createLegacyMenuBackdropStars()` — the animated starfield
   visible behind menu/auth/options/pause — is called with no arguments
   at its one live call site (`MenuScene.ts:5911`) and defaults its `random`
   parameter to `Math.random`; nothing in `capture-ui-surfaces.mjs` or its
   URL params reaches that seam. Animation timing also advances the stars
   before capture. So even at `--maze-seed 3749`, repeated runs can still
   produce different pixels on every screen with the backdrop layer. The
   gate's *topology* and *assertion* results (the 39 structural checks) are
   reproducible at a pinned seed; the *raw PNGs* are not full pixel-diff
   material until the backdrop RNG gets its own deterministic seam (or
   pixel-diffing is dropped in favor of the assertion set, which is what
   this gate actually enforces today). Don't oversell this as
   screenshot-level reproducibility — it isn't, yet.

**Baseline this before enforcing it as a hard pass/fail gate.** This
session's own run of the harness (`UI-AUDIT.md` §7) already found this
checkout fails 2 checks today — `options-bottom-account-action` and
`mobile-overlay-scroll-reachability` — unrelated to any UI-migration work,
and `capture-ui-surfaces.mjs` exits nonzero on any failing check. Requiring
"the gate passes" verbatim would make every future migration PR fail CI
on day one for a pre-existing reason it didn't cause. Before treating this
as a hard required gate: either fix those 2 checks first, or record them
as an explicit known-baseline exception (e.g. an allow-list the harness
checks new failures against) so "required" means "no new failures beyond
the recorded baseline," not "zero failures including ones nobody
introduced." Whoever picks up the first migration PR should resolve this
baseline question before wiring the gate into CI as blocking.

Failure procedure, if the harness fails locally (as it did once this
session — see §7's crash-then-retry note):

1. Run `npm run visual:ui-surfaces -- --maze-seed 3749` (never the bare,
   seedless invocation, and never a different ad hoc seed value) and
   capture the exact stdout/stderr.
2. Classify the failure before treating it as a harness defect: browser
   binary missing/outdated, preview server didn't start or wasn't ready,
   the capture route (`?content=core-only&theme=aurora&runtimeDiagnostics=1`)
   didn't resolve, `window.__MAZER_QA__`/runtime diagnostics never
   populated, filesystem/output-directory permissions, a timeout, or an
   actual capture/assertion bug.
3. Repair the local environment (reinstall Playwright browsers, retry
   with `--skip-build` against an already-built `dist/`, etc.) or run the
   gate in a known-good clean checkout.
4. Never merge a UI migration PR on the basis that the gate "couldn't run
   here" — get it running, or get a clean-checkout run, before treating
   the change as verified.

## Deployment contract

CI verification, a local production build, a preview deployment, and an
actual production deployment are four separate steps with different
authorization requirements — this plan does not blur them:

- **CI verification, as it actually runs today** (`.github/workflows/verify.yml`,
  the only PR workflow): type-check (`npm run lint`), a curated subset of
  `vitest` suites, `npm run build`, and 10 sharded AI-navigation-acceptance
  runs. Runs automatically per PR, no approval needed. **Correction: an
  earlier version of this bullet also listed the architecture/
  decision-registry test and `visual:ui-surfaces` here — neither actually
  runs in CI.** `tests/architecture/decision-registry-contract.test.ts`
  has only ever been run manually in this session (via `npx vitest run`),
  never by the workflow, and `visual:ui-surfaces` isn't referenced
  anywhere under `.github/workflows/`. Until one of the two happens —
  wiring the baseline-aware visual gate (and the decision-registry test)
  into `verify.yml`, or explicitly documenting them as required *manual*
  checks a reviewer runs before approving — a UI migration PR can merge
  with green CI despite neither having actually run. Whoever picks up the
  first migration PR should close this gap rather than let "required"
  keep meaning "required if someone remembers to run it locally."
- **Local production build** (`npm run build`) and **preview deployment**
  (e.g. `vercel` without `--prod`): routine engineering steps, no
  additional approval needed beyond the standing pipeline authorization
  already in effect for this session.
- **Production deployment, promotion, alias cutover, or rollback**:
  per `AGENTS.md` (`AGENTS.md:9-11`), approval-gated. Requires fresh,
  explicit operator wording in the current thread — `deploy to
  production`, `deploy to prod`, or `promote Mazer on Vercel`. PR
  approval, plan approval, "continue," or "proceed" does not authorize a
  production mutation, per those same lines. This applies to any future
  UI-migration PR exactly as it already applies to this session's own
  bug-fix PRs — the wave system doesn't get a separate, looser deployment
  rule.

## First integration proof (not implemented in this PR)

Dependency-status report, per the wave table above: **Wave 3A (command
bridge / live-scene mapping) is the first incomplete registered
integrator wave.** It gates both 3C (DOM mounting) and 4D (renderer
switch) — neither can start correctly before it.

**Ordering is settled, per explicit owner decision (2026-08-30):** an
earlier version of this section presented Wave 4D's board renderer and
Wave 3C's DOM-mounting proof as two interchangeable candidates, on the
reasoning that `AGENTS.md`'s board-first rule ("core board simulation and
rendering precede shell polish," `AGENTS.md:12`) "reads as favoring 4D"
without actually enforcing that reading. That was flagged as a real gap:
presenting them as a free choice still let an implementer start the DOM
proof first. The order is now explicit and mandatory:

**Wave 3A → Wave 4D → Wave 3C.** Wave 3A (command bridge) unblocks both.
Wave 4D (board/title renderer switch) comes next, per AGENTS.md's
board-first rule — it proves the topology contract (Wave 2B) and design
tokens (Wave 1B) actually drive shipped rendering, not just pass their
own isolated tests. **Wave 3C's DOM-mounting proof (the progression-reset
`ConfirmDialog`, `src/ui/dom/*`) does not start until Wave 4D has
shipped.** This is a hard sequencing rule, not a preference — do not
start the DOM proof "in parallel" or "as a smaller first step" ahead of
the board renderer.

Wave 3B (auth migration, `auth-migration-integrator`) keeps its own
existing registered scope exactly as the decision registry states it —
except that, per the ordering correction above (`INTEGRATOR_WAVE_ORDER`),
3B does follow 3A in the registered dependency sequence. No ordering
between 3B and 3C, or between 3B and 4D, is invented here; this section
fixes the 3C-vs-4D ordering and 3B's real 3A dependency, not an
independence 3B never actually had.

Once Wave 4D has landed, the Wave 3C proof would still need to prove:

- one DOM root mounted above the Phaser canvas, with real mount/cleanup;
- DOM-to-game command dispatch through the Wave 1A command model;
- one-overlay enforcement against the existing overlay state;
- Phaser input suspension while the DOM modal is open;
- keyboard focus trap, Escape-to-cancel, and focus restoration to the
  invoking control on close;
- responsive/safe-area placement;
- a passing `visual:ui-surfaces` capture of the new surface — **currently
  impossible as stated, and not this PR's (or this proof's) call to fix
  directly**: the harness doesn't open or capture the progression-reset
  confirmation overlay at all (`UI-AUDIT.md` §7's recorded gap). Extending
  `capture-ui-surfaces.mjs` isn't a free-standing task either — the
  decision registry (`integratorWaveOwnership.assignments`) assigns that
  script exclusively to Wave 0C's `measured-baseline-integrator`. Doing it
  as an ad hoc part of a Wave 3C proof would itself violate the same
  wave-ownership rule this whole plan otherwise insists on. Whoever picks
  up this proof needs an explicit Wave 0C handoff (or a registry
  amendment) for the harness extension, not a same-PR fix.
- fixing the real routing defect already confirmed at this exact surface,
  not silently reproducing it in DOM form: the overlay has two entry
  points (Account and Pause, see `UI-AUDIT.md`'s P1 issue log and
  `UI-SCREEN-MAP.md`'s progression-reset row) but Cancel always returns to
  Pause regardless of which one opened it. **This is recorded as its own
  separate P1 follow-on, not fixed in this docs-only PR** — either as a
  Wave 3A correctness-acceptance item (since 3A owns the command-bridge
  work this dialog's routing would run through) or as its own narrowly
  authorized bugfix PR that respects the decision registry's
  `MenuScene.ts` wave-3A ownership. The desired contract, for whoever
  picks it up: opened from Account → Cancel returns to Account; opened
  from Pause → Cancel returns to Pause; a confirmed reset follows its own
  explicit post-reset destination, independent of both. The fix should
  preserve an explicit invocation/return context rather than hardcoding a
  destination, the same shape `openOverlay`'s existing `overlayReturn`
  field already handles for other overlays.

This document does not implement Wave 4D or the Wave 3C proof — it stays
documentation-only, per this PR's own scope. It's recorded here so
whoever picks up Wave 3A next has the real ordering and the known defect
named up front, not re-derived from scratch.

## What this session's own future UI work should keep doing regardless

- Keep bug/visual fixes to `MenuScene.ts` scoped and small, the way the
  last several PRs in this branch already have been — that's consistent
  with `no-big-bang-menuscene-rewrite` and hasn't tripped the wave-ownership
  test so far.
- Before proposing any new token, component, or architecture decision for
  Mazer's UI, check `docs/architecture/MAZER-UI-REWORK-*.md` first. This
  plan's own first draft didn't, and it showed.
- Use `npm run visual:ui-surfaces -- --maze-seed 3749` (see `UI-AUDIT.md`
  §7) for visual verification going forward instead of ad-hoc Browser-pane
  screenshots — it actually works in this environment and already encodes
  real assertions, not just images. Always the canonical seed, never the
  bare invocation.
- The one concrete, low-risk cleanup this audit found — `drawLegacyLeaderboardTitleGlyph`'s
  procedural bars could be swapped for the same `applyLegacyHudIconFrame`
  call the header button already uses (`UI-AUDIT.md` §3) — is **not**
  scheduled here as an independent Gate 2 or a second migration
  authority. `MenuScene.ts` is assigned to the Wave 3A command-bridge
  integrator under `dependency-ordered-integrator-wave-ownership`; shared
  paths change only inside their declared wave with a fresh-main
  preflight and exclusive ownership. This fix is recorded as known
  migration debt for that wave to pick up (or, if it's genuinely wanted
  sooner, only after the decision registry is explicitly amended through
  the repository's own governance process — not by this plan asserting a
  parallel authority over the same file).
