# Mazer Legacy Play HUD Full Footprint Refinement Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: active-play HUD

## Why this packet exists

After the queued generation/reset contract landed, the next honest modular miss stayed in the active-play HUD lane:

- the timer chip still read slightly too roomy against the legacy play overlay
- the goal arrow still carried a slightly larger footprint than the old minimal play surface
- repo-owned HUD proof still needed the full timer-plus-arrow overlay footprint, not just the timer chip

## Landed scope

- tighten the timer chip footprint in `src/scenes/MenuScene.ts`
- reduce timer typography one step while keeping the legacy monospace read
- move the goal arrow tighter into the top-right corner and shorten the arrow footprint
- publish the HUD proof footprint from the timer-and-arrow union instead of the timer chip alone
- update `tests/reset/legacy-reset.test.ts` and `tests/visual/edge-live-check.test.ts`
- resync the marker and owner-map docs

## Boundaries preserved

- no movement-rule change
- no pause routing change
- no board/layout mutation
- no generation/reset-flow rewrite
- no menu shell mutation

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run test -- tests/visual/edge-live-check.test.ts`
- direct play-route screenshot on `/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1`
- `npm run edge:live -- --skip-build true --headless true --run core-only-play`
- `npm run verify`

## Ratchet result

This packet earns the bounded HUD ratchet.

- `72% -> 73%`

Reason:

- one named completion-marker segment changed with proof
- the active-play timer chip and goal arrow are both visibly tighter on the direct play-route surface
- the repo-owned proof lane now bounds the full overlay footprint instead of only the timer chip
- the packet stayed inside the HUD owner chain without widening broader gameplay claims

## Next honest slice

The next bounded module should move out of HUD chrome and into one of the remaining larger truth gaps:

- generation/reset staged lifecycle exactness
- overlay field-by-field responsibility cleanup
- final screenshot-grade board/material review
