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
| 3C | DOM primitive mounting, view-model projection, one-overlay enforcement | not started, gated behind 3A |
| 4D | Phaser board/title renderer switch | not started, gated behind 3A |

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
gate for every UI migration PR under Wave 3A/3C/4D, not a nice-to-have.
User- or ChatGPT-supplied screenshots and recordings are useful
*supplementary* evidence — subjective visual feedback, physical-device
behavior, animation timing, production-only rendering defects — but they
do not replace it: they aren't deterministic, don't run the same 39
assertion set on every change, and can't be diffed the way a committed
`report.md`/`summary.json` can. No migration PR should waive this gate in
favor of manually-supplied images.

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

1. Run `npm run visual:ui-surfaces` and capture the exact stdout/stderr.
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

- **CI verification** (tsc, vitest, the architecture/decision-registry
  test, `visual:ui-surfaces`): runs automatically per PR, no approval
  needed.
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

Once Wave 3A's prerequisites are satisfied, the recommended first *mounted
DOM* proof is the **progression-reset confirmation dialog**, built on the
existing `ConfirmDialog` primitive (`src/ui/dom/*`) — not a cosmetic
Phaser glyph swap like the leaderboard icon (see below). It's narrow
enough to still prove real architecture:

- one DOM root mounted above the Phaser canvas, with real mount/cleanup;
- DOM-to-game command dispatch through the Wave 1A command model;
- one-overlay enforcement against the existing overlay state;
- Phaser input suspension while the DOM modal is open;
- keyboard focus trap, Escape-to-cancel, and focus restoration to the
  invoking control on close;
- responsive/safe-area placement;
- a passing `visual:ui-surfaces` capture of the new surface.

This document does not implement that proof — it stays documentation-only,
per this PR's own scope. It's recorded here so whoever picks up Wave 3A
next has a concrete, low-risk first slice instead of re-deriving one.

## What this session's own future UI work should keep doing regardless

- Keep bug/visual fixes to `MenuScene.ts` scoped and small, the way the
  last several PRs in this branch already have been — that's consistent
  with `no-big-bang-menuscene-rewrite` and hasn't tripped the wave-ownership
  test so far.
- Before proposing any new token, component, or architecture decision for
  Mazer's UI, check `docs/architecture/MAZER-UI-REWORK-*.md` first. This
  plan's own first draft didn't, and it showed.
- Use `npm run visual:ui-surfaces` (see `UI-AUDIT.md` §7) for visual
  verification going forward instead of ad-hoc Browser-pane screenshots —
  it actually works in this environment and already encodes real
  assertions, not just images.
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
