# Mazer Legacy Play Proof Entry Seam Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: play-proof entry seam

## Why this packet exists

The repo-owned `core-only-play` proof route was not actually entering active play on first load.

That made the play proof lane weaker than advertised:

- the route named `play` still rendered the menu shell
- the active-play HUD surface was not present
- HUD packets could not be judged honestly from the repo-owned play route

## Landed scope

- teach `src/scenes/MenuScene.ts` to honor `?mode=play` on initial scene boot
- add a focused resolver test in `tests/scenes/menu-launch-mode.test.ts`

## Boundaries preserved

- no maze generation rewrite
- no movement-rule change
- no overlay rewrite
- no HUD styling change in this packet
- no parity marker ratchet by proof-plumbing alone

## Proof plan

- `npm run test -- tests/scenes/menu-launch-mode.test.ts`
- `npm run edge:live -- --skip-build true --headless true --run core-only-play`
- `npm run verify`

## Truth after this packet

This packet strengthens the repo-owned play proof surface.

It does not, by itself, claim deeper 1:1 gameplay closure.
It also does not ratchet the repo-wide completion marker on its own.

## Next honest slice

With the play proof route restored, the next bounded packet should return to:

- active-play HUD exactness
