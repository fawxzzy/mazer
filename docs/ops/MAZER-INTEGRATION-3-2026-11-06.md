# Mazer integration 3 (2026-11-06)

Integrates two finished UI lanes into one branch off `origin/main` (754a191a).
Both lanes were cut from c0e999e2, an ancestor of main.

## Lanes

| Lane | Branch | Head | Scope |
| --- | --- | --- | --- |
| W1 | `claude/mazer-w1-header-pause-20261105` | feb988c6 | Welcome label removed; username top-left via `legacyHeaderIdentityPlacement`; pause card Resume / Settings / Quit to Menu; Options header without the profile icon |
| W2 | `claude/mazer-w2-leaderboard-auth-20261105` | 02ce4e43 | Leaderboard overlay rebuilt from its view model (icon kept); forced Welcome auth screen; truthful loading cover |

Merge order: W1, then W2 (`git merge --no-ff`).

## Conflicts and resolution

Both lanes edit `src/scenes/MenuScene.ts` and `tests/scenes/menu-render-frame.test.ts`
in different regions (W1: identity label, pause overlay, Options header; W2:
leaderboard overlay, auth overlay, loading cover). Git merged both files
without textual conflicts; no hunk needed manual resolution. The merged tree is
checked by the full verification pass listed in the PR, not only by the clean
merge.

## Reconcile commits

- Wave 5C live-auth soak (`scripts/analysis/live-auth-persistence-soak.mjs` and
  its test): Options is asserted as `['Trail Shine']` with `Account` forbidden;
  Pause is asserted as `['Back', 'Resume', 'Settings', 'Quit to Menu']` with
  `Trail Shine`, `Guide`, `Main Menu` forbidden (Settings is collapsed on open),
  then Settings is clicked and Trail Shine is asserted; the Account control is
  asserted on the main menu because Options no longer carries a profile icon.
  The live soak itself was not run.
- Wave 0C `scripts/analysis/capture-ui-surfaces.mjs` and
  `tests/reset/ui-surface-capture-script.test.mjs` are deliberately NOT edited
  here (the integrator-wave guard rejects spanning 0C and 5C). They ship in a
  separate 0C PR.

## Merge ordering

The 0C capture-script PR must merge AFTER this integration PR: its updated
expectations (Welcome anatomy, Pause/Options labels) describe the integrated
UI, and `npm run visual:ui-surfaces` only passes against this tree.

## Changed pins (summary)

- `tests/scenes/menu-render-frame.test.ts`: identity label, pause card and
  Options header pins (W1); leaderboard, Welcome auth and loading-cover pins (W2).
- `tests/reset/legacy-*`: header identity placement, pause lifecycle, auth
  gate / gate resolution / Welcome screen, leaderboard view and overlay plan,
  player-message inventory.
- `tests/scenes/menu-header-pause-wiring.test.ts` (new).
- `tests/analysis/live-auth-persistence-soak.test.mjs`: Pause/Options/Account
  source pins updated for the new UI.
- `scripts/analysis/verify-welcome-identity-readability.mjs` updated by the
  lanes for the header identity label.

## Open items

- Quit to Menu has no confirmation (owner decision pending).
- Create Account has no sign-up deep link; the proposal is documented in
  FawxzzyWeb PR #99.
- No real-device check has been done.
- Leaderboard states (loaded, empty, error) were verified by scene-state
  injection, not against a live leaderboard backend.
