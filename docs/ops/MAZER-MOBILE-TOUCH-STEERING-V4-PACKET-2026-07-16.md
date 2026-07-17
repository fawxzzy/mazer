# Mazer Mobile Touch and Steering V4 Packet — 2026-07-16

## Operator acceptance checklist

- [x] Remove the extra bottom-biased space around shared UI labels.
- [x] Keep top, bottom, left, and right text padding symmetric across the shared UI helpers and run-status box.
- [x] Eliminate the mobile touch-coordinate vertical offset when browser chrome or safe-area origin changes without a resize.
- [x] Replace stick angular sectors with a continuous 360-degree input vector.
- [x] Make direct turns, including an upward T-junction turn, follow the strongest legal thumb projection immediately.
- [x] Preserve bounded one-tile Smart Steering without route lookahead or solver leakage.

## Root causes

1. Shared labels were deliberately lifted above their container center, and the run-status label used bottom-only padding. Both contracts created visible extra room below the glyphs.
2. The viewport publisher moved the fixed app origin when visual-viewport or safe-area offsets changed, but the Phaser Scale Manager skipped `refresh()` whenever width and height were unchanged. Phaser therefore retained stale `canvasBounds` and registered touches below the finger.
3. Stick input was reduced to a 16-segment direction/candidate pair before the grid resolver saw it. Boundary hysteresis and the second threshold in the resolver discarded the operator's live thumb angle.

## Landed contract

- Shared UI label centers now use the actual container midpoint; padding is symmetric, including the two-row run-status box.
- Same-size viewport publications refresh Phaser input bounds. Custom play and overlay gestures additionally transform the native client point through the canvas's current DOM rectangle.
- `legacy-directional-intent-v4` accepts the normalized stick vector. Each cadence step ranks cardinal exits by dot product with that exact vector, while discrete keyboard/arrow inputs keep their bounded queued-turn behavior.
- Smart Steering still allows at most one perpendicular tile and only when the next tile restores the strongest desired lane.

## Verification

- `npx tsc --noEmit`: passed.
- Focused Vitest packet: `6` files / `95` tests passed across touch mapping, directional intent, viewport geometry, UI standards, the scene contract, and architecture.
- The first full verification attempt exposed an unrelated procedural seed-family timeout. The final canonical `npm run test:verify` rerun passed `49` files / `367` tests, including that seed family in `8.6s`.
- `npm run build`: passed; Vite transformed `225` modules and generated the PWA service worker/precache.
- Isolated in-app browser at `390x844`: menu, Options, play, and Pause loaded from the live Vite source route; canvas CSS and backing geometry both measured `390x844`; render status was `native`; progression text fit; and diagnostics reported zero offscreen or overlap violations.
- A direct pointer action at the upper stick target moved the player from `(26,36)` to `(26,35)` with exactly one accepted world turn, then released to zero active controls and idle directional intent. This proves the visible stick hit location and runtime input location agree on the touched local surface.
- Browser console proof: zero warnings and zero errors.

Physical-device feel and screenshots remain operator review evidence; they are not fabricated from desktop emulation.
