# Mazer Legacy Generation Stage-7 Finalize Contract Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: generation / reset contract

## Why this packet exists

Queued generation requests made reset/build branches explicit, but legacy stage `7` was still effectively scene-local:

- play timer start still lived at the `startPlayMode()` call site
- title visibility still flipped outside the generation consumption contract
- spawn/trail initialization still depended on scene-local branching instead of an explicit finalize state

That left one named part of the legacy staged lifecycle only half-ported.

## Landed scope

- add `consumeLegacyGenerationRequestState()` in `src/legacy-runtime/legacyGenerationLifecycle.ts`
- make the generation consumption contract carry:
  - play/menu title visibility
  - play timer start responsibility
  - initial player spawn and trail state
- route `MenuScene.ts` through that stage-7 finalize contract instead of splitting those responsibilities across play/menu entry call sites
- add proof in:
  - `tests/reset/legacy-generation-lifecycle.test.ts`
  - `tests/reset/legacy-reset.test.ts`
- resync the marker and owner-map docs

## Boundaries preserved

- no full staged generator rewrite
- no process `8` reset-port claim
- no topology generation rewrite
- no menu shell rewrite
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-generation-lifecycle.test.ts`
- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run verify`

## Ratchet result

This packet earns the next bounded generation ratchet.

- `73% -> 74%`

Reason:

- one named completion-marker segment changed with proof
- stage `7` finalize responsibilities are now explicit in the generation consumption contract
- play/menu entry no longer hide timer/title/spawn reset semantics in unrelated scene call sites
- the packet stayed inside the generation/reset owner chain without overstating the remaining staged-process gap

## Next honest slice

The next bounded generation lane should be one of:

- process `8` reset semantics
- deeper staged `0/3/4/5/6` lifecycle extraction
- overlay field-by-field responsibility cleanup if generation exactness is paused
