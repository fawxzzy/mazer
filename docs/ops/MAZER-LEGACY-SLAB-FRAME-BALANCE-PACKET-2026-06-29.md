# Mazer Legacy Slab Frame Balance Packet

Date: 2026-06-29
Lane: Mazer pass 2 menu parity
Module: slab/frame balance

## Why this packet exists

After the silhouette, tile-read, and backdrop passes, the board surround still read a little too flat and too generic. The next visible miss was the frame mass around the square plate, not the maze geometry itself.

## Landed scope

- lighten and thicken the slab plate slightly
- deepen right/bottom shell mass
- make the top/left highlight recipe a little clearer
- keep the work inside `src/scenes/MenuScene.ts`

## Boundaries preserved

- no menu snapshot mutation
- no layout/button/title coordinate change
- no play behavior change
- no backdrop logic rewrite

## Proof plan

- `npm run lint`
- `npm run verify`
- live localhost inspection in the in-app browser

## Next honest slice

If this packet lands cleanly, the next bounded menu parity slice should be either:

- one final title/board composition pass, or
- demo route / pacing if the visual shell stops being the dominant miss
