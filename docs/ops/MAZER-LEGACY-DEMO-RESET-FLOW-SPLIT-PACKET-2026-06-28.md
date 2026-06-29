# Mazer Legacy Demo Reset-Flow Split Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Status: landed locally and verified

## Purpose

Close the false gap between repo docs and runtime truth by restoring the missing same-maze AI reset branch in the recovered demo walker.

Before this packet:

- the docs claimed the rebuild already distinguished:
  - goal-driven maze regeneration
  - AI path-stack exhaustion with same-maze reset
- the actual runtime only implemented the goal-regeneration branch

## What changed

- Updated `src/domain/ai/demoWalker.ts` so the recovered humanized walker can now:
  - enter `reset-hold` with `resetReason = 'ai-path-exhausted'`
  - restart on the same maze without requesting regeneration
  - flip the carried `aiLogicSwitch` state on same-maze reset
  - keep goal completion as the only branch that requests a new maze
- Added focused verification in `tests/ai/demo-walker.test.ts` for:
  - same-maze AI-only reset
  - no regeneration on that branch
  - logic-switch flip on replay
  - later goal reach and normal regeneration path

## Truthful effect

The menu demo lane now distinguishes the two legacy reset classes:

- `goal` -> hold -> regenerate next maze
- `ai-path-exhausted` -> hold -> replay same maze from start

This is a real behavioral restoration, not only a docs rewrite.

## Boundaries preserved

- No deploy
- No infra mutation
- No app identity change
- No ATLAS root packet reopened
- No play-mode shell rewrite
- No visual shell replacement

## Verification

Commands run:

- `npx vitest run tests/ai/demo-walker.test.ts`
- `npm run verify`

Result:

- focused AI/reset tests passed
- repo `verify` passed

## Remaining truth

This does not claim full demo AI parity yet.

Still open:

- exact visited-history semantics through AI-only reset
- exact legacy potential-tile exhaustion behavior beyond the bounded reproduced branch
- trail color-revert semantics tied to backtrack undo flags
- final screenshot-grade visual parity
