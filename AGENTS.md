# AGENTS.md

## Core rules for this repository
- Preserve gameplay logic truth from `legacy/old-project.zip`.
- Treat files under `legacy/screenshots/` as archival visual reference unless screenshot-grade legacy parity is explicitly reopened.
- Current active direction is mechanics-first and mobile-clean: preserve old gameplay responsibilities, but allow board, tile, floor, player, trail, and HUD visuals to change when that improves top-down readability and mobile usability.
- When current prose conflicts, prefer `docs/current-truth.md`, the latest visual-gate artifacts, and `tests/scenes/demo-build.test.ts` over older notes.
- Do not claim production is current unless the latest local visual pass is both committed and deployed.
- Keep implementation board-first: core board simulation and rendering precede shell polish.
- Maintain exactly one active overlay at a time (menu/options/pause/win/etc.).
- On mechanics/mobile work, use `docs/research/MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md` as the active percent marker.
- On explicitly reopened legacy screenshot 1:1 passes only, re-evaluate the retired marker in `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md` before closeout. Ratchet it only when the weighted table, current truth, parity matrix, and proof evidence all agree.

## Build discipline
- Prefer small, testable commits by lane/wave.
- Keep scene wiring explicit in `src/boot/phaserConfig.ts`.
- Avoid introducing service worker behavior that can stale localhost development.
