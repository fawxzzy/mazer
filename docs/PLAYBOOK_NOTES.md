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
