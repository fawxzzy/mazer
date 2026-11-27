# 2026-11-27 - First-time cards slice 1: seen store, card registry, caps, reset hook, met set, `?lab=firsttime` (no UI)

- WHAT changed:
  - `src/tutorial/tutorialAckStore.ts`: optional `storageKey` override on `createTutorialAckStore` (default key unchanged; an empty override throws).
  - New `src/legacy-runtime/legacyFirstTimeFlag.ts`: `?lab=firsttime` switch, build default `false`, remembered in `mazer.lab.firsttime.v1`, `?lab=off` forgets it; mirrors `legacyHazardLayerFlag.ts` but reads every `lab` value, so `?lab=hazards&lab=firsttime` turns both on. Never writes its key on a Level Preview route.
  - New `src/legacy-runtime/legacyFirstTimeCards.ts`: card registry (controls hint, locked gate / shard, pulse gate, switch, wrap, trail tip, level-1 goal coach "Reach these") with id, priority, first-touch kinds, two-line copy (heading + body + "New" marker), coach target and dotted ring, Guide row; the pure caps machine (S1 one card per level, S2 one on screen, S3 two per session, deferred never dropped, no veteran skip, S5 refund under 800 ms); a placement helper that puts the card on the edge away from the player and coach target. `LEGACY_FIRST_TIME_LIVE_CARD_IDS` is empty: nothing can fire in slice 1.
  - New `src/legacy-runtime/legacyFirstTimeStore.ts`: device-local seen record under its own key `mazer.firsttime.seen.v1:<scope>` (scope `user:<id>` or `guest`), met set and Guide "viewed" marks in the same record, guest-to-user union merge.
  - New `src/legacy-runtime/legacyFirstTimeSession.ts`: flag-off session is inert (reads only the lab key, never resolves scene storage); a preview session keeps the record in memory.
  - New `src/legacy-runtime/legacyFirstTimeGuide.ts`: the Guide met-set read: Wrap and Switch rows hidden until seen or met, "All tips" shows all, "New" pills; null while the flag is off.
  - `src/legacy-runtime/legacyProgressionResetFlow.ts`: a progress reset also removes `mazer.firsttime.seen.v1:<scope>` (spec D7); `mazer.tutorial.acks:device` is still never touched.
  - Tests: `tests/tutorial/first-time-cards.test.ts`, `tests/tutorial/first-time-store.test.ts`, `tests/tutorial/tutorial.test.ts` (override), `tests/reset/legacy-progression-reset-flow.test.ts` (new key base).
- WHY it changed:
  - First-time cards spec (docs/design/MAZER-FIRST-TIME-CARDS-SPEC-2026-11-26.md) slice 1, with Zac's picks of 2026-11-27 (Guide "E Full set", two-line card, dotted ring kept around the target).
- Rule: a new lab flag that must coexist with `?lab=hazards` reads `getAll('lab')`; the hazard flag reads only the first `lab` value, so list `hazards` first when combining.
- Evidence: mutation checks: removing the S1, S2 or S3 guard, the preview no-write guard in the flag, the session flag gate, the session preview storage, the build default, or the reset key each turns at least one new test red.
- Decision: spec event ids `mechanic-touch:<x>` use a dot (`mechanic-touch.<x>`), because the tutorial registry id pattern forbids colons.
- Status: source only, no UI, not deployed, flag off by default. Nothing checked on a real phone.
