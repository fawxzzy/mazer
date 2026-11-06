# Guide update rule (standing, 2026-11-06)

Owner rule (Zac): when the game or UI changes, the Guide ("How to play") UI reflections change too, in the same PR.

Any PR that changes one of these must update the guide in that PR:

- controls (touch stick, keys, pause, back)
- tiles or markers (start, goal, player, trail, board style including Chip)
- wrap or the perimeter diamonds
- levels or ranks (and any new player-visible rank surface)
- settings rows or the Pause card

Where the guide lives:

- Content, icon specs and pending rows: `src/legacy-runtime/legacyGuideContent.ts` (one module, consumed by both the main-menu Settings sheet and the in-game Pause Settings through the shared `How to play` row in `src/legacy-runtime/legacySettingsSheetPlan.ts`).
- Drift guard: `tests/reset/legacy-guide-content-drift.test.ts` asserts each claim against live exports and constants. A red drift test means update the guide module and its icons, not only the test.
- Icons must be drawn by the same function as the board marker or tile where possible. Rows whose icon is not shared yet are listed as `todo-wiring` with their closing lane (`guide-wiring` or `chip-wiring`); the Chip wiring PR (2026-11-06) closed the `chip-wiring` ones and added the Start row; every row is now `shared-with-board` or `guide-local`.

The PR template carries a one-line checklist item for this rule.
