# 2026-11-28 - Help screen client UI (placement A, short answers + Contact us, email-first form), on by default since 2026-11-28 (`?lab=off` per-load kill; was behind `?lab=help`)

- WHAT changed:
  - New Help sheet in the real app (`src/ui/help/`: `helpState.ts` pure rules and copy, `helpPopup.ts` kit DOM, `helpMount.ts` scrim + focus, `help.css` neon edge skin). It loads on demand through `src/legacy-runtime/legacyHelpLauncher.ts` (dynamic import, nothing joins the boot bundle).
  - Send path `src/legacy-runtime/legacyHelpSubmit.ts`: the live RPC `mazer_submit_help_request_v1` on the shared client, signed in or not (anon key without a session). Every answer maps to one calm in-flow notice; `rate_limited` ALWAYS adds "You can also email us:" with fawxzzy@gmail.com (Zac approved 2026-11-28). Dev fixture: `?runtimeDiagnostics=1&helpFixture=saved|limited|failed|offline|bad_email|too_long` (never reaches the network).
  - Flag `src/legacy-runtime/legacyHelpFlag.ts` (same shape as `legacyFirstTimeFlag.ts`): `HELP_SCREEN_BUILD_DEFAULT = true` (flipped 2026-11-28; was false when built), `?lab=help` remembered as `mazer.lab.help.v1`, `?lab=off` clears it, Level Preview writes nothing.
  - Menu: a "Help" row (lifebuoy icon) right after Guide. The row model is shared (`legacyMenuRows.ts`), so it is in BOTH Menus (main menu and in a game). Flag off: every row list is exactly as before.
  - Guide: with the flag on, the Menu row names Help after Guide and a Help row (guide-local lifebuoy, `src/render/guideHelpGlyph.ts`) follows "In a maze". The first-time Guide foot's "All tips" moves into Help (shown only while tips are hidden); "Show tips again" stays at the Guide foot.
  - Message inventory: `src/ui/help` is a scan directory of `tests/reset/legacy-player-message-inventory.test.ts`; Help copy pinned there and in `docs/ops/MAZER-PLAYER-MESSAGE-INVENTORY-2026-11-05.md` section 4f.
- WHY it changed:
  - Zac's picks 2026-11-26 (options page `help-options.html`, PR #728): placement A, view A, form C. The backend went live 2026-11-27 (`docs/ops/sql-proposals/mazer-help-requests-20261126/`).
- Rule: a rate-limited Help answer always shows an address outside the form, so a flooded guest pool never leaves a player with no way to ask for help. Pinned in `tests/ui/help-state.test.ts` for every wait value.
- Rule: a DOM sheet opened from the Phaser menu loads through a launcher with a dynamic import and a type-only import of the mount; the scene never imports `ui/<sheet>` (pinned in `tests/legacy-runtime/legacy-help-launcher.test.ts`, same as feedback).
- Evidence:
  - New tests: `tests/ui/help-state.test.ts`, `tests/legacy-runtime/legacy-help-flag.test.ts`, `tests/legacy-runtime/legacy-help-submit.test.ts` (mock clients only), `tests/legacy-runtime/legacy-help-launcher.test.ts`; updated guide drift, message inventory, type-scale ratchet, dom-primitives isolation, first-time guide host, button/menu-row icons.
  - Real browser (chromium + webkit, 390x844 and 412x915) with `?lab=help` and the dev fixture: answers, form, sent, limited (Contact us shown), failed, dark mode, Help from the in-game Menu (Level Preview), the Guide's Help tile, and flag off (no Help row in either Menu). Nothing was sent to production.
- Failure Mode (found in the review-fix loop): a status banner with its own "Try again" button squeezed the failure message into a one-word column at 390px. Fix: the banner carries no button; after a failed or offline send the Send button itself reads "Try again" (pinned in `tests/ui/help-state.test.ts`).
- Status: source only, flag off by default, not merged, not deployed, nothing checked on a real phone.

- Update 2026-11-28 (coordinator): `HELP_SCREEN_BUILD_DEFAULT` flipped to true in this PR on Zac's order to turn everything on ("turn this shit on"). Browser only (no `window` stays off); `?lab=off` forces it off for that load. Not phone-checked.
