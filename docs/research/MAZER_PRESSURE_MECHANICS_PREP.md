# Mazer Pressure Mechanics Prep

Date: 2026-08-24
Status: superseded by explicit no-play-object product decision

## Goal

Record the retired pressure-mechanics direction without leaving dormant gameplay objects or an implied activation lane in current source.

## Current Decision

Live play contains only the player, goal, trail, and presentation effects. The static slow tile and patrol agent are retired from source, tests, scene state, timing, collision, rendering, and raw runtime diagnostics. Fixed world-semantic v1 `pressure` and `patrol` fields remain forced-null tombstones for capture compatibility.

Maze generation, naturally open floor geometry, player/menu-AI progression, bounded difficulty, input, the player/goal/trail, and the generic non-live UI projection modules remain unchanged. A future gameplay object requires a new product contract and source lane; it cannot reactivate retired code.

## Reopening Gate

Any future object mechanic must start as a new bounded proposal with explicit visual identity, collision semantics, fairness/escape proof, lifecycle timing, diagnostics, accessibility, and player-facing acceptance. No retired module is a reusable activation dependency.

## Risks

- A stale build or cached service worker can still show the historical red-to-grey slow tile; source proof must therefore bind the exact built asset and diagnostics.
- Generic `boardRenderer` / `menuIntentRuntime` object projections are non-live architecture and must not become `MenuScene` imports without a new product decision.
- New object mechanics could collide with input fairness, performance, maze readability, and lifecycle timing unless independently specified and proved.

## Next Best Build Packet

Keep play object-free. Continue the dependency-ordered UI/runtime bridge and player-centered zoom work; treat any future object concept as a separately authorized product lane.
