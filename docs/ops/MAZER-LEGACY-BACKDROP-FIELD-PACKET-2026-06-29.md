# Mazer Legacy Backdrop Field Packet

Date: 2026-06-29
Lane: Mazer pass 2 menu parity
Module: backdrop field

## Why this packet exists

After the title, button, silhouette, and tile-read passes, the remaining visible menu drift was increasingly atmospheric rather than geometric. The current web backdrop still read too sparse and too uniform compared with the legacy screenshot truth.

## Landed scope

- increase starfield density and size variance
- strengthen large-field violet haze
- add a little more off-center atmospheric mass so the board sits inside a richer cosmic field
- keep the work inside `src/scenes/MenuScene.ts` only

## Boundaries preserved

- no board geometry change
- no button/layout change
- no menu snapshot change
- no play-state behavior change

## Proof plan

- `npm run lint`
- `npm run verify`
- live localhost inspection in the in-app browser

## Next honest slice

If this packet lands cleanly, the next bounded menu parity slice should be:

- slab/frame balance, or
- one final title/board composition reconciliation pass
