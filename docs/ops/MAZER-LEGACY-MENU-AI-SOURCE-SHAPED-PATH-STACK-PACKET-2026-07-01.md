# Mazer Legacy Menu AI Source-Shaped Path Stack Packet

Date: 2026-07-01
Repo: `fawxzzy/mazer`
Branch: `codex/mazer-pass2-menu-parity`
Mode: owner-repo runtime parity packet

## Purpose

Restore the main-menu demo runner loop closer to the old Mazer AI behavior before continuing visual polish. This packet focuses only on the menu demo maze route and AI pathing segment, not a production deploy or infrastructure change.

## Source Chain

Legacy source:

- `Source/Mazer/Private/Player/MazerPlayer.cpp`
- `Source/Mazer/Private/MazerGameState.cpp`

Web owner chain:

- `src/domain/ai/demoWalker.ts`
- `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
- `tests/reset/legacy-menu-demo-lifecycle.test.ts`

## Runtime Change

The humanized menu runner route no longer injects synthetic detours into the canonical solution path. It now uses a source-shaped route planner:

- scans neighboring walkable tiles from the current AI tile
- rejects already visited neighbors
- admits candidates through the restored `AiTilePathCheck`-style onward-path gate
- queues valid potential tiles
- chooses the nearest valid unvisited candidate to the end tile for direct movement
- backtracks through the AI path stack when direct movement fails
- surfaces the first direct-fail recovery beat as `dead-end`
- marks the first recovery seam as the AI-only reset point
- replays the same maze after AI-only reset instead of regenerating

The fixed menu-demo bootstrap also stops before the first visible source-shaped dead-end/reset seam so the front-door loop starts in a clean explore pose while preserving the recovery loop for live playback.

## Marker Decision

The 1:1 completion marker moves from `88%` to `89%`.

This earns one point because the menu demo route now follows the old AI loop shape at the runtime behavior layer. It does not earn more because exact Unreal material color-revert timing, blueprint `_PlayerAiDelayDuration`, and every visited-flag side effect are still approximated.

## Validation

Focused validation completed during the packet:

```powershell
npm exec vitest -- run tests\ai\demo-walker.test.ts tests\reset\legacy-menu-demo-lifecycle.test.ts --reporter=dot
npm exec tsc -- --noEmit
npm exec vitest -- run tests\ai\demo-walker.test.ts tests\reset\legacy-menu-demo-lifecycle.test.ts tests\reset\legacy-reset.test.ts tests\reset\legacy-marker.test.ts --reporter=dot
npm run lint
npm run build
npm run verify
```

Result:

- `tests/ai/demo-walker.test.ts`: passed
- `tests/reset/legacy-menu-demo-lifecycle.test.ts`: passed
- expanded focused tests: `40` passed
- full verify tests: `20` files / `111` tests passed
- TypeScript check: passed
- build: passed
- verify: passed

Maintained-browser proof:

- URL: `http://127.0.0.1:4173/?runtimeDiagnostics=1&visualDiagnostics=1&v=menu-ai-source-path-stack`
- canvas count: `1`
- console errors/warnings: `0`
- menu mode: `menu`
- staged menu rows: `49 / 49`
- generation progress: `100%`
- runner mistakes enabled: `true`
- observed cues during polling: `backtrack`, `anticipate`, `reacquire`, `dead-end`
- runner telemetry observed: wrong-branch, backtrack, and recovery counts populated

## Boundaries

No deploy was attempted.
No Supabase, Vercel, or GitHub app resources were created.
No duplicate Mazer identity was created.
No ATLAS root branch should absorb this owner-repo runtime work except through a separate stack-lock / inventory resync branch.
