# Mazer Legacy Generation Queued Request Contract Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: generation / reset contract

## Why this packet exists

The repo already knew which generation stages and build kinds existed, but runtime reset behavior still collapsed into immediate `rebuildMaze()` calls inside `MenuScene.ts`.

That was weaker than the legacy truth:

- Unreal routed generation and reset through explicit game-state scheduling
- the web port still rebuilt instantly at the scene call site

## Landed scope

- extend `src/legacy-runtime/legacyGenerationLifecycle.ts` with:
  - named generation request reasons
  - queued generation request objects
  - request-consumption helpers
- route `MenuScene.ts` through queued generation requests for:
  - menu boot
  - menu return
  - menu demo goal regeneration
  - missing demo episode recovery
  - overlay-triggered maze rebuilds
- consume queued requests on scene update instead of collapsing every branch into direct rebuild calls
- publish pending generation request diagnostics in the repo-owned visual diagnostics surface
- add proof in:
  - `tests/reset/legacy-generation-lifecycle.test.ts`
  - `tests/reset/legacy-reset.test.ts`

## Boundaries preserved

- no full staged generator rewrite
- no menu shell rewrite
- no demo walker rewrite
- no HUD rewrite
- no production deploy

## Proof plan

- `npm run test -- tests/reset/legacy-generation-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Ratchet intent

This packet qualifies for a bounded `+1` on generation lifecycle exactness if generation/reset branches stop being implicit scene-local rebuilds and become explicit runtime requests without overstating full staged-process parity.

## Ratchet result

This packet earns the bounded generation ratchet.

- `71% -> 72%`

Reason:

- one named completion-marker segment changed with proof
- generation/reset branches are now explicit queued runtime contracts
- scene update now consumes generation requests instead of collapsing every branch into immediate rebuilds
- the packet stayed inside the generation/reset owner chain

## Next honest slice

The next truthful lane should be either:

- active-play HUD exactness, or
- deeper staged process-port work for `0/3/4/5/6/7/8`
