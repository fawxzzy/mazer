# Mazer Directional Intent Contract

## Status

`legacy-directional-intent-v1` is the shared active-play steering contract. Keyboard arrows/WASD, on-screen arrows, stick drag candidates, board pointer swipes, and the QA movement bridge all resolve through the same cardinal state machine before an accepted step enters `WorldTurnSystem`.

## Input and simulation ownership

- Input adapters own pressed, held, dragged, and released controls. They may publish one preferred direction and one secondary cardinal candidate, but they do not move the player directly.
- `LegacyDirectionalIntentResolver` owns the active run direction, exactly one latest-wins queued direction, bounded unambiguous-corner assistance, and release synchronization.
- `resolveLegacyNavigationTarget(...)` owns direct and paired-wrap legality. The intent resolver never invents a neighbor or bypasses the playable graph.
- `WorldTurnSystem` remains the mutation boundary. A selected intent step changes player, trail, completion, and telemetry state only when the player-movement phase admits it.
- Render interpolation remains cosmetic. It may smooth a legal accepted cell transition but cannot create a movement step or drag a wrapped transition across the board.

## Direction and queue rules

1. A tap requests one direction and can produce at most one accepted step before release clears the request.
2. A held press or drag repeats at the configured movement-speed cadence while the active direction remains legal.
3. A newer direction replaces the previous queued direction. The resolver never stores a multi-command turn queue.
4. A queued direction turns immediately when it becomes legal, including at the first matching side opening while the current run direction remains legal.
5. If the active direction is blocked and no queued direction exists, exactly one legal non-reversing continuation may be taken as an assisted corner.
6. Automatic assistance stops at a dead end, a genuine two-branch ambiguity, or after four assisted turns. Reversing always requires explicit input.
7. Release, focus loss, pause, menu entry, reset, generation, and lifecycle locks clear or synchronize intent so stale input cannot replay.

## Zigzag boundary

The four-turn assistance bound is deliberately small. It lets a directional run remain fluid through a short unambiguous alternating corridor without turning the game into route following. Intersections, ambiguous branches, a mismatched queued turn, and the assistance limit all require fresh player intent.

## Diagnostics

Runtime diagnostics publish only bounded intent state: active direction, queued direction, current requested candidates, assisted-turn count and limit, and the last resolver decision. They do not expose a solver path or future route.

## Verification spine

- Pure fixtures: immediate turn, delayed opening, latest-wins replacement, dead end, unambiguous corner, genuine intersection, paired wrap, four-turn bound, and release cleanup.
- Scene contract: every live input adapter enters `LegacyDirectionalIntentResolver`, then `WorldTurnSystem`.
- Regression packet: touch/stick, legacy play-step, runtime diagnostics, MenuScene, keyboard/world-turn, and input-equivalence tests.
- Route-aware proof: a clean-commit phone control trace and desktop keyboard trace, including release cleanup and zero console/page errors.
