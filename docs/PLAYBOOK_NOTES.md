# Playbook Notes

- WHAT changed: Added pre-scene authenticated progression/settings hydration, revision-aware cross-device writes, safe advancement rebasing, reset conflict refusal, and a fine-pointer portrait browser adapter that reuses the phone maze/control composition without changing the phone branch.
- WHY it changed: The same login previously produced different stats because the app only wrote remote progression and continued to read device-local caches; a `499x958` narrow browser pane also missed the phone-specific maze/control cadence used at `390x844`.
- Evidence: `npm run verify:fast` (`13` files / `184` tests), focused account/browser parity packet (`4` files / `41` tests), `npm run build`, additive live Supabase migration/readback, and route-aware Preview captures at `390x844` and `499x958`.

Use this file to record meaningful Playbook-governed repo changes in a concise, reviewable format.

## 2026-07-04

- WHAT changed: Activated the repo-local Playbook install surface with `playbook.config.json`, a local verification gate, and Mazer-owned notes.
- WHY it changed: Mazer already had adoption evidence, but Playbook's local verification mode needs an explicit `verify:local` command and config surface.
- Evidence: `npm run verify:local`

## 2026-07-08

- WHAT changed: Added local-first player and AI-runner progression tracks, progression-aware maze scale tuning, hidden diagnostics, and level/rank color palettes for player/trail rendering.
- WHY it changed: Player progression and menu AI progression need separate learning lanes now, while keeping implementation data hidden from normal game UI.
- Evidence: `npx vitest run tests/reset/legacy-progression.test.ts tests/reset/legacy-cycle-telemetry.test.ts tests/reset/legacy-reset.test.ts tests/scenes/menu-render-frame.test.ts --maxWorkers 1`; `npm run verify:local`

- WHAT changed: Added a Mazer-native Supabase browser auth layer, in-game account overlay, Login/Log out menu actions, and account-scoped local learning/progression storage with guest fallback.
- WHY it changed: Account login is needed before long-term player-vs-AI progression can become user-specific, while non-player implementation receipts stay hidden behind diagnostics.
- Evidence: `npx vitest run tests/reset/legacy-auth.test.ts tests/reset/legacy-progression.test.ts tests/scenes/menu-render-frame.test.ts --maxWorkers 1`; `npm run verify:local`

- WHAT changed: Added viewport-aware progression scale capping, stricter full-viewport shell CSS, and small-tile corridor rendering so rounded 4px mobile path tiles keep the clean connected-maze shape.
- WHY it changed: High AI/player progression could generate phone-width mazes with sub-4px tiles at browser zoom 100%, making the menu look zoomed out, dense, blurry, and blocky compared with 90% zoom.
- Evidence: `npx vitest run tests/reset/legacy-progression.test.ts tests/reset/legacy-menu-layout.test.ts tests/scenes/menu-render-frame.test.ts --maxWorkers 1`; `npm run lint`; `npm run build`

- WHAT changed: Made generated main-menu demo navigation follow the clean canonical route by default while keeping the legacy mistake/backtrack route available for the fixed snapshot and explicit AI tests.
- WHY it changed: The player-facing menu AI was taking long humanized detours, which made navigation look broken and delayed the visible goal-to-deconstruct cycle.
- Evidence: `npx vitest run tests/ai/demo-walker.test.ts tests/reset/legacy-menu-demo-lifecycle.test.ts tests/reset/legacy-reset.test.ts --maxWorkers 1`; `npm run build`; browser diagnostics proof at `tmp/clean-menu-ai-cycle-proof.png`.

- WHAT changed: Added border-dock rendering for non-corner edge paths so corridors that reach the board edge connect cleanly into the maze border instead of ending as capped/cropped slabs.
- WHY it changed: Mobile menu/play mazes could show edge-touching pathways that looked like they bled off the grid without a deliberate border connection.
- Evidence: `npx vitest run tests/scenes/menu-render-frame.test.ts tests/reset/legacy-path-visual-style.test.ts --maxWorkers 1`; `npm run build`; browser mobile proof at `tmp/edge-dock-proof-405x958.png`.

- WHAT changed: Tightened progression maze-size capping to use the same snapped board and safe-inset math as the renderer, keeping phone-width menu demos at the selected base density and preserving readable 5px-plus mobile maze tiles instead of allowing 61+ cell menus to collapse into the blurry/blocky 4px lane.
- WHY it changed: The clean mobile maze visual regressed when progression scale grew faster than the available board frame at browser zoom 100%, making the board shrink and paths look dense compared with the prior clean style.
- Evidence: `npx vitest run tests/reset/legacy-progression.test.ts tests/reset/legacy-menu-layout.test.ts tests/scenes/menu-render-frame.test.ts --maxWorkers 1`; browser mobile proof at `tmp/clean-tile-sizing-proof-405x958.png`.

- WHAT changed: Added corner-aware perimeter rails for maze border docks so paths that touch the board edge near folded triangular facets connect through the edge gutter instead of stopping as clipped stubs.
- WHY it changed: The prior edge-dock pass connected border cells to the square board edge, but folded-corner cutouts made near-corner pathways look cut off before reaching the visible border.
- Evidence: `npx vitest run tests/reset/legacy-progression.test.ts tests/reset/legacy-menu-layout.test.ts tests/scenes/menu-render-frame.test.ts --maxWorkers 1`; browser mobile proof at `tmp/border-rail-proof-405x958.png`.

## 2026-07-09

- WHAT changed: Configured Mazer Vercel Supabase browser auth env vars from the live shared auth project, pulled ignored local `.env.local`, added `.env.example`, added a feature-gated remote progression sync module, and created the Supabase migration for `public.mazer_progression_states`.
- WHY it changed: Real account signup/login/logout needs deployed and local Supabase browser config before remote player/AI progression can safely sync across devices; remote progression stays local-first and opt-in until the schema is applied.
- Evidence: real Supabase QA auth smoke `signupUserCreated=true`, `signupSessionCreated=true`, `signinSucceeded=true`, `signoutSucceeded=true`; `npx vitest run tests/reset/legacy-auth.test.ts tests/reset/legacy-progression.test.ts tests/reset/legacy-remote-progression.test.ts tests/scenes/menu-render-frame.test.ts --maxWorkers 1`.

- WHAT changed: Added the Mazer-only Supabase storage contract, migration-backed account/profile tables, separate player and AI-runner progression storage, compact cycle receipt storage, and server-owned Stripe license/payment-wall tables.
- WHY it changed: Mazer needs its own tight data boundary before remote learning, per-account AI progression, account progression sync, and future paid licenses can ship without mixing game data into Fitness-owned storage.
- Evidence: `npx vitest run tests/reset/legacy-remote-progression.test.ts tests/reset/legacy-auth.test.ts tests/reset/legacy-progression.test.ts --maxWorkers 1`; `npm run lint`; `npm run build`.

## 2026-08-04

- WHAT changed: Fixed `tests/reset/legacyUnrealSourceFixture.ts` so an explicitly-set-but-blank `MAZER_LEGACY_UNREAL_RESTORE_ROOT` (empty string, spaces-only, or tabs/newlines-only) throws an actionable error instead of silently falling through to parent-directory discovery. The prior guard (`process.env[VAR]?.trim()` then `if (explicitRoot)`) treated `''` and `undefined` identically, since both are falsy -- now the raw value's presence is checked separately from its trimmed content, so "truly unset" still uses parent-walk (unchanged) while "set but blank" fails loudly. Added 4 new tests (empty string, spaces-only, tabs/newlines-only, and an explicit control test confirming truly-unset behavior is unchanged) to `tests/reset/legacy-unreal-source-fixture.test.ts`.
- WHY it changed: A whitespace-only explicit value is a real misconfiguration signal (e.g. a CI/shell template substituting an empty value into the variable) that should be surfaced, not silently masked by falling back to a fixture that happens to exist via parent-walk for an unrelated reason -- concealing exactly the kind of broken environment setup this variable exists to make visible.
- Rule: When distinguishing "not configured" from "configured but blank" for an environment variable, check the raw value's presence (`!== undefined`) before trimming/testing truthiness -- collapsing both into one falsy check silently treats a real misconfiguration as if the setting were absent.
- Evidence: `npx vitest run tests/reset/legacy-unreal-source-fixture.test.ts` (12/12 pass, 4 new), `npx vitest run tests/reset/legacy-reset.test.ts` with a valid `MAZER_LEGACY_UNREAL_RESTORE_ROOT` set (35/35 pass, unchanged), `npm run test` (canonical, 489/489 pass), `npx tsc --noEmit` (clean), `npm run build` (succeeds, no unintended tracked-file changes).
- Status: Applied

- WHAT changed: Added `tests/reset/menu-intent-runtime-integration.test.ts` (9 tests, canonical via the whole-directory `tests/reset` inclusion in `package.json`'s `test`/`test:verify` scripts -- no `package.json` edit needed) covering the full episode -> spectator plan -> intent runtime host -> session chain: `advanceToStep` is idempotent under repeated/backward calls (never grows `intentDeliveries`); negative/fractional/out-of-bounds/`NaN` cursors passed to `advanceToStep`/`getFeedState`/`getBoardState` clamp safely instead of throwing or returning garbage, and an out-of-bounds cursor resolves to the exact same state as the latest reached step; the input `MazeEpisode` object is never mutated; two sessions built from the same episode produce an identical intent-kind sequence and identical board state (deterministic); a freshly-constructed session (the menu-restart case) always starts with zero deliveries regardless of a prior session's state (no cross-session leakage); the `core-only` content profile never emits any mechanic-telegraph intent kind across a full traversal; and a short path below `demoSpectator.ts`'s 6-segment floor falls back to core-only board state end-to-end, matching the already-proven unit-level boundary.
- WHY it changed: The existing `tests/scenes/menu-intent-runtime.test.ts` (9 tests, not itself canonical -- `tests/scenes` only explicitly lists `menu-render-frame.test.ts`) covers the display-controller dwell/coalesce/debounce contract extensively but never asserts cursor-safety, duplicate-effect freedom, input immutability, determinism, or clean-session-reset at the runtime-integration layer. Every one of those properties was independently verified against the real runtime (via a throwaway probe script, not assumed) before writing any assertion -- all were already correct, so this is coverage of a working contract, not a fix.
- Rule: A module whose public methods accept arbitrary numeric "step" arguments (state getters, cursor-driven APIs) needs its out-of-bounds/malformed-input clamping behavior explicitly regression-tested, even when the implementation already handles it correctly -- an incidental correctness property with no test is one accidental refactor away from becoming a real defect.
- Failure Mode: A future change to `advanceToStep`'s while-loop bound check, or to `getFeedState`/`getBoardState`'s `Math.max(0, Math.min(...))` clamping, could silently reintroduce duplicate narrative-event growth on repeated calls or an out-of-bounds crash/garbage state, with nothing catching it before it shipped.
- Decision: `MISSING_INTEGRATION_COVERAGE_ONLY` -- test-only addition, no production runtime code changed, no `package.json` change.
- Evidence: `npx vitest run tests/reset/menu-intent-runtime-integration.test.ts` (9/9 pass), `npx vitest run tests/scenes/menu-intent-runtime.test.ts` and `tests/scenes/menu-render-frame.test.ts` (unaffected, 9/9 and 50/50), `npm run test` (canonical, 498/498 pass, 63/63 files -- confirms the new file runs as part of the real command), `npx tsc --noEmit` (clean), `npm run build` (succeeds, no unintended tracked-file changes).
- Status: Applied

## 2026-08-03

- WHAT changed: Removed `src/render/hudRenderer.ts` (the `createDemoStatusHud` Phaser HUD overlay and its supporting types/profiles), confirmed dead: zero references to the file path or any of its exported symbols (`HudThemeStyle`, `createDemoStatusHud`) anywhere in source, tests, or scripts. Last touched 2026-06-27, from the original "menu demo AI" build, superseded by the current `legacy-runtime/legacyPlayHud.ts` HUD system.
- WHY it changed: A 409-line Phaser-rendering module with a full theme/chrome/deployment-profile configuration surface was carrying real maintenance weight (it would need updating alongside any future HUD/theme/viewport refactor) while contributing nothing -- confirmed unreachable via a repo-wide grep for both the file path and every exported symbol, plus a clean `tsc --noEmit` and `npm run build` both before and after removal.
- Evidence: `npx tsc --noEmit` (clean both before and after removal), `npm run build` (succeeds, no unresolved imports, no unintended tracked-file changes from the build itself), `npm run test` (485/485 pass, matching the pre-removal baseline exactly), repo-wide grep for `hudRenderer|createDemoStatusHud|HudThemeStyle` returning zero hits after removal.
