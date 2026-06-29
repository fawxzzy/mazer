# Mazer Legacy Board Shell Material Tightening Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Status: landed locally and verified

## Purpose

Tighten the menu board shell and material treatment against the restored legacy screenshots without reopening gameplay, reset-flow, or overlay work.

## What changed

- Updated `src/scenes/MenuScene.ts` to make the front-door board read closer to the legacy shell:
  - deeper menu-mode board shadow offset
  - darker board shell edge and fill treatment
  - slightly lower menu grid contrast
  - stronger menu-only side and bottom shadow bars
  - faint top and left shell highlights
  - slightly stronger menu board fill alpha

## Boundaries preserved

- No gameplay logic mutation
- No demo walker mutation
- No reset-flow mutation
- No overlay contract mutation
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

- `tmp/captures/mazer-layout-matrix/2026-06-29T03-30-07-966Z`

Live browser proof:

- reloaded local in-app browser surface
- no browser `warn` / `error` logs
- screenshot: `tmp/mazer-live-current-check.png`

## Truthful result

The current web front door now has a heavier, more legacy-shaped board shell and depth read, while still remaining inside the reset-lane Phaser runtime and without claiming final screenshot-grade parity.
