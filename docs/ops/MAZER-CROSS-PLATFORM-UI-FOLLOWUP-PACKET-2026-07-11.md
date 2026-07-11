# Mazer Cross-Platform UI Follow-Up Packet

Date: 2026-07-11
Branch: `codex/cross-platform-ui-followup`
Status: implementation and local proof complete; production unchanged

## Scope

- reserve menu lanes in the order title, maze, rank, actions
- reserve play lanes in the order top rank/Pause HUD, maze, portrait controls
- cap maze dimensions by the usable content left after lane reservation
- make resize, maximize, restore, and browser-chrome changes recompute from one pure layout contract
- honor visual viewport offsets plus iPhone/Android safe-area insets
- keep phone landscape behind the existing accessible portrait blocker
- add explicit iPhone, Android, macOS, and Windows proof presets

## Implementation

- `src/legacy-runtime/legacyMenuLayout.ts` publishes ordered lane bounds and derives board size from the remaining lane rectangle.
- `src/scenes/MenuScene.ts` places menu and play progression panels inside their reserved rank/HUD lanes and leaves phone Pause space beside the play panel.
- `src/boot/viewportGeometry.ts` includes stable visual-viewport offsets in the content origin.
- `src/styles/base.css` anchors `#app` to that normalized origin instead of always using `left: 0; top: 0`.
- `scripts/visual/layout-matrix.config.mjs` adds the `platform` preset for iPhone Dynamic Island, Android cutout, macOS browser, and Windows browser dimensions.

## Proof

- Focused lane, viewport, orientation, touch, render-frame, and matrix tests: `78` passed.
- TypeScript: `npm run lint` passed.
- Side-tab phone menu at `390x844`: title, board, rank, and Login bounds were ordered with no overlap or offscreen violations.
- Side-tab resize round trip `390x844 -> 1440x900 -> 390x844`: restored phone title, board, and rank bounds exactly.
- Side-tab authenticated play at `390x844`: rank and Pause shared the top HUD band; board and control deck remained separate; diagnostics reported no overlap or offscreen violations.
- Platform matrix command: `npm run visual:matrix -- --url <local-preview> --preset platform --run cross-platform-ui-followup-2026-07-11`.
- Platform matrix result: `4/4` screen contracts passed. Console output contained only Vite connection diagnostics and the Phaser banner, with no warnings or errors.
- Full closure verification: `npm run verify` passed `42` test files / `325` tests and produced the production bundle successfully.

## Operational Note

The canonical `4173` preview origin was already owned by another Mazer checkout. A reused alternate origin initially served an old service-worker-controlled production bundle even though its development server was healthy. Proof moved to a fresh local origin, where the entrypoint readback showed Vite and `src/boot/main.ts`. This is recorded as preview-origin cache state, not a generic Codex runtime failure.

## Safety

- No Supabase writes or schema changes.
- No historical receipt mutation.
- No production deployment or Vercel promotion.
- `tests/ai/demo-walker.test.ts` remained untouched.
