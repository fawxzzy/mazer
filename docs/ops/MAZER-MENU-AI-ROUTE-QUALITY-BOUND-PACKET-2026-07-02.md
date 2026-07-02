# Mazer Menu AI Route Quality Bound Packet

Date: 2026-07-02
Mode: owner-repo runtime behavior fix
Branch: `codex/mazer-pass2-menu-parity`

## Scope

This packet tightens the menu-demo AI route planner after runtime diagnostics showed the representative split-flow attract loop could balloon into a long route while preserving the same wrong-branch/recovery cue family.

Touched owner chain:

- `src/domain/ai/demoWalker.ts`
- `tests/ai/demo-walker.test.ts`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/research/MAZER_MENU_GENERATION_AI_LOOP_MAP.md`
- `docs/current-truth.md`

## Runtime Change

`buildLegacyAiRunnerPlan()` now admits potential shortcut targets idempotently and stops first-mistake exploratory route construction after emitted `dead-end`, `backtrack`, and `reacquire` cue evidence exists.

After that seam, the route returns to canonical replay instead of continuing to explore the maze before replay.

## Proof Contract

`tests/ai/demo-walker.test.ts` now guards the representative split-flow route:

- route length must remain greater than the canonical path, preserving visible AI mistakes
- route length must stay at or below `4x` the canonical solution length
- traverse duration must remain under `60_000ms`
- wrong-branch, backtrack, recovery, dead-end, backtrack cue, and reacquire cue evidence must remain present
- the existing invalid-jump guard remains active across representative cases

## Marker Decision

The repo-wide legacy 1:1 marker ratchets from `92%` to `93%`.

The awarded segment is:

- `Demo route, backtracking, and pacing`: `10 / 12` -> `11 / 12`

This earns one point because the packet changes runtime route construction and adds a proof-backed guard against the menu AI loop regressing into runaway shortcut/backtrack noise.

It does not earn more because exact Unreal material color-revert timing, blueprint AI cadence, and full visited-flag side effects remain open.

## Validation

Passed:

```bash
npm exec vitest -- run tests\ai\demo-walker.test.ts --reporter=dot
```

The broader repo verification must be rerun before final closeout if more runtime/docs edits land after this receipt.

## Boundaries

- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate Mazer identity.
- No key rotation.
