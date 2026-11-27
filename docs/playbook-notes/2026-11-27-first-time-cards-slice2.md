# 2026-11-27 - First-time cards slice 2: card host + the Wrap card (behind `?lab=firsttime`)

- WHAT changed:
  - New `src/legacy-runtime/legacyFirstTimeHost.ts`: a Phaser-free controller (steps to touch events, level/scope changes, pause hiding, a 4.5 s auto-dismiss that counts visible time only, the 800 ms move rule, coach-mark linger and anchor-reached) plus a thin scene binding. It shows the card through `legacyInFlowNoticeHost` (heading, body, "New" marker, mechanic icon id passed for the rich-text skin) and draws the dotted ring with `CoachMarkView` inside the board container. Flag off: one flag read, a WeakMap entry, nothing created or drawn.
  - `src/scenes/MenuScene.ts`: one call (`noteLegacyFirstTimeStep(this, previousPlayer, nextStep.player)`) after an accepted play step, plus its import.
  - `src/legacy-runtime/legacyFirstTimeCards.ts`: `mechanic.wrap` is live; the wrap body is read from the Guide Wrap row (R2); new coach target `wrapped-edge-cell` (dotted ring, no label).
  - `src/legacy-runtime/legacyGuideContent.ts`: the Wrap row now reads "Open edges wrap: walk off one to come back on the far side. Edge stars fill as beams hit." (drift test + player-message inventory updated in the same change).
  - Tests: new `tests/tutorial/first-time-host.test.ts`; `tests/tutorial/first-time-cards.test.ts` live-list and wrap coach pins.
- WHY it changed:
  - First-time cards spec (docs/design/MAZER-FIRST-TIME-CARDS-SPEC-2026-11-26.md) slice 2, with Zac's picks of 2026-11-27 (card look E Two-line, skin B Neon edge, keep the dotted ring on the thing pointed at, never cover anything important).
- Rule: scene glue that needs private MenuScene members reads them structurally and pins the member names with a source-scan test, so a rename fails a test instead of silently drawing nothing.
- Pattern: the host owns the auto-dismiss clock (frames while visible) instead of the DOM timer, so a pause or the Guide never eats the card's on-screen time.
- Decision: the wrap ring sits on the edge cell the player walked off (the cell they arrived on is under the player).
- Status: source only, flag off by default, not deployed. Nothing checked on a real phone.
