# Mazer Legacy Generation Diagnostics Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: generation readback

## Why this packet exists

The runtime now knows which legacy build contract it is using, but that truth was not yet exposed on the maze snapshot or the scene diagnostics surface. Before opening the full staged process port, the app needs a stable readback seam for build kind and process-stage ids.

## Landed scope

- attach generation metadata to runtime-created legacy mazes
- publish build kind and process-stage ids through `__MAZER_VISUAL_DIAGNOSTICS__`
- add repo proof in `tests/reset/legacy-generation-diagnostics.test.ts`

## Boundaries preserved

- no generator algorithm rewrite
- no menu shell rewrite
- no play movement rewrite
- no deploy

## Proof plan

- `npm run test -- tests/reset/legacy-generation-diagnostics.test.ts`
- `npm run verify`

## Next honest slice

- use the new diagnostics seam during live localhost proof, or
- start the first actual staged process port packet
