# Mazer Legacy Main-Menu Parity Packet

Date: 2026-06-28
Branch: `codex/legacy-web-port-truth`

## Scope

- preserve the first owner-side legacy web-port slice as durable repo truth
- restore the legacy front door around `Start`, `Options`, and `Exit`
- replace the larger recovery/product shell with a smaller legacy-shaped menu runtime
- keep the current web app as canonical while anchoring behavior to restored legacy evidence

## Landed Surfaces

- `docs/research/MAZER_LEGACY_WEB_PORT_CONTRACT.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `scripts/legacy/extract-legacy-truth.mjs`
- `src/legacy-runtime/legacyDefaults.ts`
- `src/legacy-runtime/legacyMaze.ts`
- `src/scenes/MenuScene.ts`
- `src/boot/main.ts`
- `src/boot/phaserConfig.ts`
- `src/scenes/BootScene.ts`
- `src/styles/base.css`
- `tests/reset/legacy-reset.test.ts`
- `package.json`
- `scripts/verify/run-verify.mjs`
- `tsconfig.json`

## What Changed

- added one reproducible legacy extraction surface so the Unreal archive can be restored and compared from repo-owned tooling
- recorded one explicit port contract and one first-pass parity matrix so the lane stops pretending the current web shell is already close enough
- replaced the previous recovery-focused menu runtime with one simpler legacy-shaped shell:
  - title over maze board
  - `Exit`, `Start`, and `Options` as the visible front door
  - one-overlay-at-a-time menu structure
  - legacy settings state for scale, cam scale, wall/path color, dark mode, camera follow, and trail fade
  - menu demo plus play/reset loop carried by the new legacy runtime helpers
- narrowed repo verification to the new reset lane plus build proof for this port slice

## Executed Proof

- `npm run verify`
  - result: passed
  - `vitest run tests/reset --maxWorkers 1`: passed `3/3`
  - `node ./scripts/build/run-build.mjs`: passed
- local visual proof on built preview:
  - `npm run preview -- --host 127.0.0.1`
  - local screenshot artifact: `tmp/verify-frontdoor-delayed.png`
  - rendered proof shows the restored front door with visible `Exit`, `Start`, and `Options` over the legacy-shaped maze board

## Current Truth

- the public web shell is now materially closer to the restored legacy project than the prior recovery shell
- this is still an early parity packet, not final 1:1 closeout
- the next honest owner-side pressure remains:
  - options/features/game-mode depth parity
  - pause/menu routing parity during play
  - HUD and reset-flow exactness
  - deeper demo-walker and generation lifecycle parity
