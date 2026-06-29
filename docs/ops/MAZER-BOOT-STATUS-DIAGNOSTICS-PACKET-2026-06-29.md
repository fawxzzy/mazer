# Mazer Boot Status Diagnostics Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: live boot readback

## Why this packet exists

Localhost proof exposed a real live gap: the page could reach a blank or partially mounted state without giving a durable answer about whether the game booted, whether `MenuScene` ran, or whether runtime diagnostics ever had a chance to publish.

## Landed scope

- add `src/boot/bootStatus.ts`
- publish boot milestones onto `window.__MAZER_BOOT_STATUS__`
- attach the live Phaser game onto `window.__MAZER_GAME__`
- mark `menu-scene-create` from `MenuScene.create()`
- add repo proof in `tests/boot/boot-status.test.ts`

## Boundaries preserved

- no generator rewrite
- no menu visual rewrite
- no gameplay rewrite
- no deploy

## Proof plan

- `npm run test -- tests/boot/boot-status.test.ts`
- `npm run verify`

## Next honest slice

- use the new boot-status seam to resolve the current localhost diagnostics gap, or
- return to staged generation process-port work once live localhost truth is stable
