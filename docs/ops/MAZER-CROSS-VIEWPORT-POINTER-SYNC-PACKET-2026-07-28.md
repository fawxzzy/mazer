# Mazer Cross-Viewport Pointer Synchronization Packet

Date: 2026-07-28

## Objective

Keep Mazer's rendered shell and interactive coordinate space aligned through rapid phone, desktop, maximize, and restore transitions.

## Root cause

The shared viewport controller correctly published the newest content geometry, but Phaser `RESIZE` mode could still re-measure the previous DOM parent size during the same transition. A rapid `360x720 -> 1440x900 -> 360x720 -> 405x958 -> 360x720` sequence could therefore:

1. publish the restored `360x720` viewport;
2. skip a redundant resize while Phaser still reported `360x720`;
3. allow the preceding `405x958` resize to settle afterward.

The canvas looked restored because Mazer drew from the shared geometry, while Phaser's input transform still mapped pointer coordinates into the stale game size. In the reproduced case, clicking the visible Login button at `(180, 632)` missed; a scaled, incorrect point could activate it.

## Change

- The viewport controller now passes its already-authoritative content dimensions to Phaser with `setParentSize`.
- Same-size safe-area and browser-chrome movements still call `refresh` so cached canvas bounds stay current.
- The UI transition harness now requires both the shared visual viewport and Phaser's game scale to match before declaring an endpoint settled.
- Focused regression proof covers the full rapid transition order and exact final parent dimensions.

## Verification

- Focused viewport, UI capture, and MenuScene tests pass.
- The production build passes.
- Guest and synthetic-authenticated transition suites pass across `360x720`, `1440x900`, restored `360x720`, and `405x958` at DPR 2.
- Menu, Auth/Options, play, and pause surfaces restore identical canonical diagnostics.
- Pointer-driven Login, Start, Options, and Pause transitions complete after the viewport sequence.
- Captures report no text/input bounds issues, text collisions, console warnings/errors, or page errors.

## Evidence boundary

This deterministic browser proof covers resize, maximize/restore, DPR-backed rendering, and pointer targeting. It does not claim physical iPhone browser-chrome or installed-PWA safe-area completion; those remain separate real-device observations.

## Rollback

Revert this packet's source commit. The prior behavior remains reproducible through the maintained transition harness, which will fail rather than silently accepting mismatched Phaser and shared viewport dimensions.
