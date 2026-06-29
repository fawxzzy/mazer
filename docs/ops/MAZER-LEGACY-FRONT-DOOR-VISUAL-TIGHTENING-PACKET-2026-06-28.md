# Mazer Legacy Front-Door Visual Tightening Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Status: landed locally and verified

## Purpose

Tighten the menu front-door composition against the restored legacy screenshots without reopening gameplay or reset-flow work.

## What changed

- Updated `src/legacy-runtime/legacyMenuLayout.ts` to tighten desktop composition:
  - slightly larger desktop board footprint
  - desktop buttons sit closer to the board edge
  - side-button inset is slightly reduced
- Updated `src/scenes/MenuScene.ts` to strengthen the front-door read:
  - larger, higher-contrast title lockup
  - stronger title shadow offset
  - stronger front-door button plate alpha/stroke treatment
  - stronger primary `Start` emphasis

## Boundaries preserved

- No gameplay logic mutation
- No demo walker mutation
- No reset-flow mutation
- No deploy
- No infra/resource mutation
- One-overlay rule unchanged

## Verification

Commands run:

- `npm run test -- tests/reset/legacy-menu-layout.test.ts`
- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`

Results:

- layout tests passed
- repo verify passed
- fresh visual matrix capture completed

Visual artifact:

- `C:/ATLAS/tmp/captures/mazer-layout-matrix/2026-06-29T03-18-01-088Z`

Live browser proof:

- reloaded local in-app browser surface
- no browser `warn` / `error` logs
- screenshot: `C:/ATLAS/tmp/mazer-live-frontdoor-tighten-check.png`

## Truthful result

The web front door now reads closer to the legacy menu family in composition and button/title presence, while still remaining inside the current reset-lane Phaser shell.
