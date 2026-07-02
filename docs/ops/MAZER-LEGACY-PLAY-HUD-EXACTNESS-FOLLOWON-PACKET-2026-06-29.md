# Mazer Legacy Play HUD Exactness Follow-on Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: active-play HUD

## Why this packet exists

After restoring the play proof entry seam, the active-play HUD was finally visible as a truthful first-load play surface again.

That made the next exact miss easy to name:

- the timer chip still read a little too wide and too roomy
- the goal arrow still read a little too large and too far from the corner

## Landed scope

- tighten the timer chip footprint in `src/scenes/MenuScene.ts`
- reduce timer typography one step while keeping the legacy monospace read
- move the goal arrow slightly tighter into the top-right corner
- reduce arrow shaft/head footprint
- update the reset-lane HUD source guard in `tests/reset/legacy-reset.test.ts`

## Boundaries preserved

- no movement-rule change
- no pause routing change
- no board/layout mutation
- no generation/reset-flow rewrite
- no menu shell mutation

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- direct play-route screenshot on `/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1`
- `npm run verify`

## Ratchet intent

If the updated play screenshot keeps the HUD closer to the legacy minimal contract without widening chrome, this packet qualifies for a bounded `+1` on the HUD parity segment.

## Ratchet result

This packet earns the bounded HUD ratchet.

- `69% -> 70%`

Reason:

- one named completion-marker segment changed with proof
- the active-play timer chip and goal arrow are both visibly tighter on the direct play-route surface
- the packet stayed inside the HUD owner chain without inflating broader gameplay claims
