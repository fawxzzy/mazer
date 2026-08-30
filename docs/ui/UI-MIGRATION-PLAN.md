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
| 1C | Diagnostics schema split | skipped (no spec) |
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
- The one concrete, low-risk cleanup this audit found that doesn't touch
  wave-owned territory: `drawLegacyLeaderboardTitleGlyph`'s procedural
  bars could be swapped for the same `applyLegacyHudIconFrame` call the
  header button already uses (`UI-AUDIT.md` §3). Small, scoped, consistent
  with this branch's existing pattern of icon fixes — worth doing whenever
  it's next convenient, not urgent.
