# Mazer Legacy Right Goal Mass Follow-On Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: board silhouette
Slice: right-side goal mass follow-on

## Why this packet exists

After the title packet, the clearest remaining menu-board drift still sat on the goal side. Compared with `legacy/screenshots/menu-03.png`, the current right edge still looked a little too narrow and too restrained through the inner-right pocket and lower-right return.

## Landed scope

- widen the goal-side pocket family in `src/legacy-runtime/legacyMenuSnapshot.ts`
- extend:
  - `right-pocket`
  - `right-spine`
  - `right-lower-notch`
  - `right-inner-pocket`
- add direct snapshot proof in `tests/reset/legacy-reset.test.ts`

## Boundaries preserved

- no title placement mutation
- no button chrome mutation
- no board material mutation
- no play-maze mutation
- no demo-route pacing mutation

## Proof plan

- `npm run test -- tests/reset/legacy-reset.test.ts`
- `npm run visual:matrix -- --preset core --skip-build true`
- `npm run verify`

## Next honest slice

- if the board still reads too open under the title, return to `title-underlay-band`
- if the board mass looks close enough, switch out of menu-board geometry and choose the next parity lane explicitly
