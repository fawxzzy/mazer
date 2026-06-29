# Mazer Legacy Generation Reset Map Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: generation / reset owner map

## Why this packet exists

The next major 1:1 gap is still the legacy staged generation and reset lifecycle. Before opening that rewrite, the repo needed a cleaner owner map separating:

- maze topology generation,
- scene-level rebuild timing,
- and the older staged `_ProcessCount` contract.

## Landed scope

- map the current generation/reset owner chain in `docs/system-map.md`
- separate topology ownership from scene rebuild ownership
- point the future exact port back to `docs/legacy/gameplay-spec.md` instead of letting it dissolve into ad hoc `MenuScene.ts` edits

## Boundaries preserved

- no runtime code mutation
- no maze generator rewrite
- no scene behavior rewrite
- no proof-lane change

## Next honest slice

The next bounded packet should be:

- legacy staged generation/reset lifecycle port planning, or
- the first small runtime extraction needed to support that port without mixing it with unrelated menu work
