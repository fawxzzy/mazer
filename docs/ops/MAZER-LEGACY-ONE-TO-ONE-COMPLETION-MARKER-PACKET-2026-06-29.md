# Mazer Legacy 1:1 Completion Marker Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: repo-wide completion marker and parity mapping

## Why this packet exists

The repo had many bounded parity packets, but no single durable marker defining what `100%` legacy-to-web completion actually meant.

That made it too easy to keep making good local improvements without one honest repo-wide answer to:

- what counts toward 1:1 completion
- what is allowed to improve structurally without breaking 1:1
- what the current truthful percent is
- what exact segment should ratchet next

## Landed scope

- add `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- define the weighted repo-wide `100%` parity model
- set the current held marker to `68%`
- refresh `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md` so the current web-owner column matches the reset-lane architecture
- wire the completion marker into `docs/current-truth.md` and `docs/system-map.md`

## Boundaries preserved

- no runtime code mutation
- no parity percentage inflation by wording alone
- no claim of 1:1 closure
- no broad new product direction
- no infra/app-identity mutation

## Current truthful result

The repo now has one explicit place to judge 1:1 progress.

Current held posture:

- `68%`

Why still held below full closure:

- generation/reset lifecycle is still approximate
- demo route semantics are still partial
- HUD parity is still partial
- final screenshot-grade material/composition parity is still open

## Next honest slice

The next bounded runtime or visual packet should ratchet one named row from the new completion marker, not reopen broad whole-menu polish.
