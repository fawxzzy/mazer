# Mazer Legacy Play HUD Proof Bounds Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: play-proof diagnostics

## Why this packet exists

The reset-lane play proof route could enter active play, but the repo-owned diagnostics still published no HUD bounds.

That left the Edge live summary weak for the play lane:

- `HUD Bounds` rendered as `-`
- HUD overlap/clip verdicts could not describe the actual active-play chip
- future HUD packets had to rely on ad hoc screenshots instead of the repo-owned proof spine

## Landed scope

- publish reset-lane HUD timer/arrow bounds from `src/scenes/MenuScene.ts`
- teach `scripts/visual/edge-live-check.mjs` to prefer reset-lane HUD bounds when present
- update `tests/visual/edge-live-check.test.ts` to cover the new HUD-bounds preference

## Boundaries preserved

- no gameplay-rule change
- no menu shell change
- no parity-marker ratchet

## Next honest slice

The next play-lane packet can rely on repo-owned HUD bounds instead of external screenshot-only proof.
