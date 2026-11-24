# Mazer in-game feedback popup: plan and options (2026-11-23)

Status: PROPOSED. Options page and SQL draft only. Nothing is wired into the game, nothing was applied to any database, nothing is deployed.

Ask (Zac): a simple pop-up with a 1-5 star rating, an OPTIONAL text field and a Submit button; it opens with NO star selected; submissions are saved in the database.

## What exists in this PR
- `feedback-options.html` + `src/ui/feedback/feedbackOptionsMain.ts`: standalone dev page (NOT in `vite.config.ts` build inputs, so it never ships). Query: `?layout=card|sheet|compact|all`, `theme=default|dark`, `state=empty|picked|filled|failed|offline|limited|sent`.
- `src/ui/feedback/feedbackPopup.ts|.css`, `feedbackState.ts`, `feedbackTheme.ts`: the REAL component, built from the kit (`createMazerButton` primary = solid mint Submit, quiet "Not now", `createStatusBanner` for the notice, `tokens.css`, `primitives.css`). No colour literals (the off-theme ratchet is at zero for these files); dark values come from `DARK_THEME_TOKENS`.
- `tests/ui/feedback-state.test.ts`: reducer, payload, copy, isolation (no shipping import, not a build input, no red/danger colour, tap-target rules).
- `docs/ops/sql-proposals/mazer-feedback-20261123/`: apply, rollback, scratch test, README, SHA256SUMS.
- `tests/ui/dom-primitives-styles.test.ts`: the Wave 2A "no shipping runtime imports ui/dom" scan now skips `src/ui/feedback` (it is not shipping; `feedback-state.test.ts` pins that nothing in `src/boot/main.ts` or `MenuScene.ts` imports it). Remove the skip when the popup is wired through its own wave.

## Layouts (all: no star selected on open, Submit disabled until a star is tapped, note optional, 500 character cap)
- A. Card: centered card, stars, note always visible, full-width Submit, "Not now" underneath.
- B. Bottom sheet: pinned to the bottom, biggest stars, note folded behind "Add a note".
- C. Compact: small card near the top, word beside the stars, Submit and "Not now" side by side.

Recommendation: A. Card. The note field is visible so people actually use it, it is the least surprising shape, and it keeps every target at or above 44px. B is the pick if you want the least interruption and a mostly-stars-only flow. C hides the maze least but squeezes the buttons.

## Where it triggers
1. Menu row (the dropdown from PR #673): a "Send feedback" row opens the popup. This is the only entry in v1 and is always user initiated.
2. Optional later: after every N completed levels (proposed N = 10, cooldown 7 days, `shouldOfferFeedbackAfterLevel`), shown on the level-complete screen as a quiet "How is Mazer?" row, not a modal.
3. NEVER during a run: no auto popup while the player is moving or the timer or run is active. The popup is only reachable from paused or menu states and from the end-of-level screen.

## Failure, offline, rate limit (no inline red errors)
- All messages go through the in-flow StatusBanner (tone info or success, never error), matching the Fitness rule "no inline red errors".
- Failed send: "Could not send. Your rating and note are kept, so try again in a minute." Draft stays, Submit re-enabled.
- Offline (`navigator.onLine === false` before the call): "You are offline. Your rating and note are kept, so send it once you are back online." No queue in v1 (a queued submit would need local storage of free text; deferred on purpose).
- Rate limited (server returns `rate_limited` with `retry_after_seconds`): calm message with minutes.
- Sent: thanks line, then the popup closes itself after a short beat.

## Dark mode and theme
Default theme is navy plus mint; dark is the device-local neon purple. There is no light theme. The popup reads only shared tokens, so it follows whichever theme is active (captures in both).

## Data and privacy
- Stored: rating 1-5, optional comment (<= 500 chars), auth user id (nullable when signed out), build id, player level, game mode, source (menu / post_level / pause), created_at.
- Not stored: email, IP, user agent, device id, free-form context.
- Writes only through `mazer.mazer_submit_feedback_v1` (SECURITY DEFINER, user id from `auth.uid()`, no user parameter). Clients get no table privileges. Reading feedback is service_role only.

## Client sketch (not wired)
```ts
const client = getLegacyAuthClient();           // existing client used by legacyLeaderboard.ts
const { data, error } = await client.rpc('mazer_submit_feedback_v1', buildFeedbackPayload(draft, ctx));
// data.status: 'saved' | 'rate_limited' (retry_after_seconds); error -> { status: 'failed' }
```
Wiring goes in a new module (MenuScene.ts is Wave 5C guarded); the DOM popup mounts over the canvas like the other DOM overlays.

## Open questions for Zac
1. Layout pick (A recommended).
2. Allow signed-out feedback? SQL supports it with a shared 30/hour budget; say no and the RPC can require `auth.uid()`.
3. Auto prompt after N levels at all (default N = 10, 7 day cooldown), or menu row only?
4. Build id source: there is no build id constant in the client today. Needs a Vite `define` from the commit sha (a build-config change, not in this PR).
5. Who reads feedback? v1 has no admin UI: service_role SQL only.

## Not verified
Real device, the live database, the popup over the real maze or menu (the install gate blocks non-localhost hosts and the menu is a Wave 5C file), independent SQL review, PG17 cluster harness, advisory-lock concurrency (pglite is single connection).
