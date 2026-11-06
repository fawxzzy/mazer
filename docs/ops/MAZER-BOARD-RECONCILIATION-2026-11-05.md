# Mazer Board Reconciliation (2026-11-05)

Status: DRAFT, unsigned
Date: 2026-11-05
Base: `origin/main` at the commit this branch was cut from (`1670c8af`)

## Purpose and authority

This record reconciles all 66 cards of the Mazer feedback board against the repository at the base above. It is the reconciliation of record until a guarded live sync of the board is approved.

**DOCUMENTED FACT**

- The board's source configuration is `config/discordos-mazer-feedback-board.json` in the DiscordOS repository, which is archived and outside this repo. It has 66 cards (unique ids) and a `planning` section. The file carries no date field. The statement that it was last edited 2026-09-02 comes from the owner thread and prior research notes and was not independently confirmed here; the file's own `activeSelectionReason` text still describes mid-August state (for example an uncommitted Vercel deploy-input candidate).
- Earlier reconciliation: `docs/research/MAZER_BOARD_RECONCILIATION_2026-07-10.md` (planning record for the July card set). This document does not replace it; it records current verdicts.
- The live Discord board (the canonical surface per the July record) was not read in this session. Card text below comes from the archived JSON.
- Board `state` and `completionPercent` are shown only to expose staleness. They are not treated as evidence of repository state.

**PROPOSAL**: no live board edit, Discord post, reaction change, or card sync is made or implied by this document. A live sync is a separate, guarded action that needs the owner's approval.

## Method and evidence levels

- Verdicts start from the owner's triage (given in the task for this packet). Each row says whether this session checked it.
- **verified**: this session read the code, tests, migrations, or docs named in the row note (existence and wiring were read; tests were not executed). 21 of 66 rows are verified; the other 45 rows are **triage** (taken from the owner's triage plus the board text, not independently re-checked).
- Findings from verification that differ from the board's own text are noted in the row and summarized after the table.

Verdict vocabulary: DONE-ON-MAIN (delivered in `origin/main` source; no claim about deployed or provider state); PARTIAL (real work on main, acceptance not met); COVERED-BY-LADDER/HAZARD (to be delivered by the endless ladder and hazard packets, not as a standalone card); DEFERRED-BY-DIRECTION (owner direction defers it); NOT-STARTED (no implementation found).

Gate class vocabulary: SOURCE-ONLY (can proceed in the repository with no owner decision or provider step); NEEDS-OWNER-DECISION (blocked on a product or policy decision); PROVIDER-GATED (needs a Supabase, Vercel, payment, Discord or other provider step with explicit owner approval); DEFERRED-BY-DIRECTION.

## Tally

| Verdict | Count |
| --- | --- |
| DONE-ON-MAIN | 17 |
| PARTIAL | 20 |
| COVERED-BY-LADDER/HAZARD | 5 |
| DEFERRED-BY-DIRECTION | 10 |
| NOT-STARTED | 14 |
| Total | 66 |

| Gate class | Count |
| --- | --- |
| SOURCE-ONLY | 28 |
| NEEDS-OWNER-DECISION | 23 |
| PROVIDER-GATED | 5 |
| DEFERRED-BY-DIRECTION | 10 |
| Total | 66 |

## Cards (board order)

Columns: board position; card id without the `mazer-` prefix; board state and percent (archived JSON; `-` means no percent); current verdict; gate class; evidence basis; note.

| # | Card | Board (stale) | Verdict | Gate class | Basis | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `ai-run-corpus-quality-calibration` | open 30% | PARTIAL | SOURCE-ONLY | triage | Corpus wave-1 packet exists (`docs/ops/MAZER-AI-RUN-CORPUS-WAVE-1-PACKET-2026-07-11.md`). Remote retention would be provider-side. |
| 2 | `ai-level-rank-progression` | open 72% | PARTIAL | NEEDS-OWNER-DECISION | triage | Superseding progression contract in `docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md`; a ladder change is an owner decision (see the hazard contract draft). |
| 3 | `human-configured-ai-runner` | open 98% | PARTIAL | SOURCE-ONLY | triage | Board shows 98 percent. |
| 4 | `player-facing-options-guide` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | Packet `docs/ops/MAZER-PLAYER-FACING-OPTIONS-GUIDE-MOBILE-FLOW-PACKET-2026-07-15.md` exists. |
| 5 | `edge-wrap-topology-and-notch-fill` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | verified | `legacy-wrap-topology-v1` diagnostics in `src/legacy-runtime/legacyMaze.ts`; contract `docs/architecture/MAZER-EDGE-WRAP-TOPOLOGY-CONTRACT.md`; test `tests/architecture/edge-wrap-topology-contract.test.ts`. |
| 6 | `crisp-cyber-arcade-graphics` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | Packet `docs/ops/MAZER-CRISP-CYBER-ARCADE-GRAPHICS-PACKET-2026-07-14.md` exists; `src/render/cyberArcadeMaterial.ts` is consumed by runtime code. |
| 7 | `icon-quality-2026-visual-target` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | Packet and `tests/brand/mazer-icon-quality-target.test.ts` exist; final icon source packet 2026-08-28. |
| 8 | `fluid-controls-and-motion` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | Directional-intent and movement-pace contracts exist under `docs/architecture/`. |
| 9 | `play-camera-zoom-minimap` | open 0% | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | verified | A camera-zoom option normalizer exists (`src/legacy-runtime/legacyCameraZoom.ts`, test `tests/reset/legacy-camera-zoom.test.ts`); no minimap or slider-under-maze was found in `src/`. Owner deferred the zoom lever. |
| 10 | `auth-remote-playbook-sync` | open 88% | PARTIAL | PROVIDER-GATED | triage | Remote receipts go through the completion RPC outbox; Atlas and playbook sync parts need provider or ATLAS steps. |
| 11 | `unified-player-message-system` | open 78% | PARTIAL | SOURCE-ONLY | triage | `src/legacy-runtime/legacyPlayerMessage.ts` exists; board shows 78 percent. |
| 12 | `auth-gate-persistent-login` | open 94% | PARTIAL | SOURCE-ONLY | triage | Board shows 94 percent; remaining proof is soak and production parity. |
| 13 | `animation-smoothness-lifecycle` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | Packet `docs/ops/MAZER-ANIMATION-SMOOTHNESS-LIFECYCLE-PACKET-2026-07-15.md` exists. |
| 14 | `play-mode-perpetual-loop` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | verified | Packet `docs/ops/MAZER-PLAY-MODE-PERPETUAL-LOOP-PACKET-2026-07-11.md` exists; `tests/reset/legacy-play-lifecycle.test.ts` references the perpetual loop. |
| 15 | `iridescent-player-trail-material` | open 50% | PARTIAL | NEEDS-OWNER-DECISION | triage | Visual identity decision; the trail palette has already been amended once. |
| 16 | `diagonal-path-graph-contract` | open 8% | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | triage | Board shows 8 percent. |
| 17 | `visual-proof-discipline` | open 99% | PARTIAL | SOURCE-ONLY | triage | Board shows 99 percent. |
| 18 | `discordos-board-discipline` | open 90% | PARTIAL | PROVIDER-GATED | triage | Concerns the live Discord board; a guarded live sync is not approved. |
| 19 | `account-scoped-settings-persistence` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | Account-scoped storage via `createLegacyAuthScopedStorage`; `mazer.game-toggles.v1`; remote `mazer_profiles.settings` row per `docs/MAZER_SUPABASE_STORAGE.md`. |
| 20 | `player-input-movement-correctness` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | Directional-intent contract and active-play packets exist. |
| 21 | `procedural-difficulty-generator-shaping` | open 61% | COVERED-BY-LADDER/HAZARD | NEEDS-OWNER-DECISION | triage | Covered by the endless ladder and hazard packets (P1 corridor, P2 budget ladder); needs hazard contract sign-off. |
| 22 | `mobile-shell-device-harness` | open 62% | PARTIAL | SOURCE-ONLY | triage | Real-device proof is needed for closure. |
| 23 | `visual-defaults-menu-controls` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | Board says completed. |
| 24 | `ai-token-assisted-maze-completion` | backlog - | NOT-STARTED | NEEDS-OWNER-DECISION | triage | Not started; depends on the economy contract. |
| 25 | `first-time-tutorial-system` | backlog - | NOT-STARTED | NEEDS-OWNER-DECISION | triage | Not started; level 1 is now a corridor on the P1 lane. |
| 26 | `customization-inventory-cosmetic-unlocks` | backlog - | NOT-STARTED | NEEDS-OWNER-DECISION | verified | No inventory code exists in `src/`. |
| 27 | `maze-coin-pickups-cosmetic-currency` | backlog - | NOT-STARTED | NEEDS-OWNER-DECISION | verified | No coin code exists in `src/`. Policy proposed in `docs/research/MAZER_ECONOMY_AND_ENTITLEMENT_CONTRACT_DRAFT.md`. |
| 28 | `data-driven-cosmetic-theme-catalog` | backlog - | NOT-STARTED | NEEDS-OWNER-DECISION | triage | Not started; depends on the economy contract. |
| 29 | `handcrafted-asset-authoring-import-workflow` | backlog - | NOT-STARTED | NEEDS-OWNER-DECISION | triage | Not started. |
| 30 | `enemy-pursuit-ai` | backlog - | COVERED-BY-LADDER/HAZARD | NEEDS-OWNER-DECISION | verified | `src/mazer-core/enemies/WardenGraphAgent.ts` is reachable only through `src/scenes/menuIntentRuntime.ts`, which no scene imports (only tests). Not live. Covered by hazard packets P5 and P6. |
| 31 | `turn-synchronous-world-simulation` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | verified | `src/mazer-core/world/WorldTurnHost.ts`; contract `docs/architecture/MAZER-WORLD-TURN-CONTRACT.md`; tests `tests/architecture/world-turn-contract.test.ts`, `tests/core/world-turn-host.test.ts`, `tests/core/world-turn-system.test.ts`. Done for the host and player phase only; enemy, projectile, item, duration and collision handlers are unintegrated by design. |
| 32 | `mystery-box-usable-item-system` | backlog - | COVERED-BY-LADDER/HAZARD | NEEDS-OWNER-DECISION | triage | Covered by hazard packet P8 (items). `src/mazer-core/items` is non-live. |
| 33 | `invisibility-cloak-item` | backlog - | COVERED-BY-LADDER/HAZARD | NEEDS-OWNER-DECISION | triage | Covered by hazard packet P8; cloak scope is an owner decision. |
| 34 | `multiplayer-foundation` | backlog - | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | triage | Not started; deferred. |
| 35 | `endless-multiplayer-survival-mode` | backlog - | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | triage | Not started; deferred. |
| 36 | `moving-procedural-maze-mode` | backlog - | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | verified | No moving-maze code found in `src/`. |
| 37 | `player-rank-only-progression-display` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | Rank-only display per the progression section of `docs/current-truth.md`. |
| 38 | `cross-viewport-ui-reliability` | open 84% | PARTIAL | SOURCE-ONLY | triage | Packets dated 2026-07-15 and 2026-07-28 exist. |
| 39 | `browser-layout-persistence` | open 82% | PARTIAL | SOURCE-ONLY | triage | Board shows 82 percent. |
| 40 | `maze-feature-progression-parity` | open 0% | PARTIAL | NEEDS-OWNER-DECISION | triage | Feature gating depends on the ladder and budget decision. |
| 41 | `player-trail-readability-lock` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | verified | Shine tokens in `src/legacy-runtime/legacyIridescentMaterial.ts` (from `cyberArcadeMaterial`). A later owner-authorized calmer trail palette (commit `a232a82a`, 2026-09-09) amended the visual treatment, so the card is a historical delivery. |
| 42 | `auth-ui-flow-hardening` | open 0% | PARTIAL | SOURCE-ONLY | triage | Shared OAuth portal adoption and refresh fixes landed in 2026-09 and 2026-10; live-provider proof is provider-gated. |
| 43 | `run-quality-metric-contract-v2` | open 0% | DONE-ON-MAIN | SOURCE-ONLY | verified | Scorer `src/legacy-runtime/mazeCycleRunQualityScorer.mjs`; test `tests/reset/maze-cycle-run-quality-scorer.test.ts`; packet `docs/ops/MAZER-RUN-QUALITY-METRIC-CONTRACT-V2-PACKET-2026-07-15.md`. Board still shows open at 0 percent (stale). |
| 44 | `run-quality-telemetry-capture-v2` | open 0% | DONE-ON-MAIN | SOURCE-ONLY | verified | Local only: `runQualityMetrics` and `runQualityScore` are stored on telemetry receipts (`src/legacy-runtime/mazeCycleTelemetry.ts`). Remote versioned capture is not part of this verdict. Board shows open at 0 percent (stale). |
| 45 | `run-quality-player-results-ui` | open 0% | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | triage | Deferred. |
| 46 | `run-quality-leaderboard-admission` | open 0% | NOT-STARTED | PROVIDER-GATED | triage | Leaderboard authority is server-side (RPCs in `supabase/migrations`); an admission change is provider-gated. |
| 47 | `run-quality-achievement-admission` | backlog - | NOT-STARTED | NEEDS-OWNER-DECISION | triage | Not started. |
| 48 | `moving-maze-lane-correction-contract` | open 0% | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | verified | No moving-maze code found in `src/`. |
| 49 | `moving-maze-one-tile-lane-snap` | backlog - | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | verified | No moving-maze code found in `src/`. |
| 50 | `moving-maze-assisted-motion-proof` | backlog - | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | verified | No moving-maze code found in `src/`. |
| 51 | `web-share-metadata-and-preview-asset` | open 0% | PARTIAL | NEEDS-OWNER-DECISION | triage | Canonical and og:url tags exist in `index.html` (pinned by `tests/reset/pwa-manifest.test.ts`); the preview asset is not confirmed. |
| 52 | `web-share-preview-platform-verification` | backlog - | NOT-STARTED | PROVIDER-GATED | triage | Needs a deployed URL and external platform checks. |
| 53 | `endless-progression-mode-contract` | open 0% | PARTIAL | NEEDS-OWNER-DECISION | verified | `src/legacy-runtime/legacyEndlessProgression.ts` exists but is consumed only by remote sync, not scene generation (`docs/ops/MAZER-LEVEL-PROGRESSION-GALLERY-2026-08-28.md`). Server side is provider-gated. |
| 54 | `endless-content-band-manifest` | open 0% | NOT-STARTED | NEEDS-OWNER-DECISION | triage | Not started; relates to the versioned pool manifest in the economy draft. |
| 55 | `shop-and-random-item-economy-contract` | open 0% | NOT-STARTED | NEEDS-OWNER-DECISION | verified | Draft contract written (unsigned): `docs/research/MAZER_ECONOMY_AND_ENTITLEMENT_CONTRACT_DRAFT.md`. |
| 56 | `shared-seed-daily-weekly-challenges` | backlog - | NOT-STARTED | NEEDS-OWNER-DECISION | triage | Not started; server seed and leaderboard parts would be provider-gated. |
| 57 | `offline-first-play-sync-and-conflict-contract` | open 0% | PARTIAL | NEEDS-OWNER-DECISION | verified | See `docs/architecture/MAZER-OFFLINE-SYNC-CONTRACT.md`: completion outbox and monotonic merge exist; the coin, inventory and checkpoint hierarchy is a proposal. Server parts are provider-gated. |
| 58 | `installable-pwa-offline-shell` | open 0% | PARTIAL | NEEDS-OWNER-DECISION | verified | See `docs/architecture/MAZER-PWA-STRATEGY-AND-BROWSER-MATRIX.md`: manifest, Workbox shell, lifecycle and install gate exist; install-gate policy and real-device proof are open. |
| 59 | `account-license-entitlement-contract` | open 0% | NOT-STARTED | NEEDS-OWNER-DECISION | verified | Draft contract written (unsigned). No `mazer_license_*` object exists in source. Implementation is provider-gated. |
| 60 | `paid-account-checkout-and-access` | backlog - | NOT-STARTED | PROVIDER-GATED | verified | BLOCKED on the entitlement contract plus provider, tax, refund and trial decisions. The watch-pass stub states no billing SDK is installed. |
| 61 | `obstacle-trap-puzzle-environment-contract` | open 0% | COVERED-BY-LADDER/HAZARD | NEEDS-OWNER-DECISION | triage | Covered by hazard packet P4 (obstacles). `src/mazer-core/traps` is non-live. |
| 62 | `social-profiles-friends-and-events-contract` | backlog - | DEFERRED-BY-DIRECTION | DEFERRED-BY-DIRECTION | triage | Not started; deferred. |
| 63 | `ui-component-layout-standards` | completed 100% | DONE-ON-MAIN | SOURCE-ONLY | triage | UI rework registries exist under `docs/architecture/MAZER-UI-REWORK-*.md`. |
| 64 | `shared-run-status-panel` | open 15% | PARTIAL | SOURCE-ONLY | triage | Board shows 15 percent. |
| 65 | `full-ui-rework-migration` | open 0% | PARTIAL | SOURCE-ONLY | triage | Separately owned wave governance; registries are on main. |
| 66 | `vercel-deploy-input-reachability` | open 0% | DONE-ON-MAIN | SOURCE-ONLY | verified | Source only: `.vercelignore` keeps `docs/contracts/`; `scripts/checks/verify-vercelignore-imports.mjs` runs from `scripts/build/run-build.mjs`. Board describes an uncommitted candidate (stale). Live deploy proof was not checked and is PROVIDER-GATED. |

## Findings from verification

**DOCUMENTED FACT** (read in this worktree)

1. Stale board status. `run-quality-metric-contract-v2` and `run-quality-telemetry-capture-v2` are `open` at 0 percent on the board, but the scorer, its tests and local telemetry fields exist on main. `vercel-deploy-input-reachability` is described on the board as an uncommitted candidate, but the `.vercelignore` fix and the `verify-vercelignore-imports.mjs` guard (run by the build script) are on main. The board is behind the repository.
2. Partial completion hidden by a "completed" label. `turn-synchronous-world-simulation` is complete for the host and the player-movement phase only; the enemy, projectile, item, duration and collision handlers remain unintegrated by design (`docs/architecture/MAZER-WORLD-TURN-CONTRACT.md`).
3. `player-trail-readability-lock` was a delivered contract but the trail treatment was later amended on owner authorization (calmer palette, 2026-09-09). Treat the card as history, not a current constraint.
4. Non-live code is not delivery. `WardenGraphAgent` (enemy), `ItemTopologyLedger` (items) and trap code under `src/mazer-core/` are reachable only through `src/scenes/menuIntentRuntime.ts`, which no scene imports (only tests import it). They support design reference and tests, not a playable feature.
5. Endless: `legacyEndlessProgression.ts` is consumed only by the remote-sync layer, so levels 100 and above use the same topology as level 99 (`docs/ops/MAZER-LEVEL-PROGRESSION-GALLERY-2026-08-28.md`).
6. Install gate versus entitlement: the PWA card says the shell stays installable and access is enforced by entitlement, while the boot-time install gate currently blocks boot in several install-surface modes without a skip. See `docs/architecture/MAZER-PWA-STRATEGY-AND-BROWSER-MATRIX.md`.
7. The July reconciliation record names the live Discord `mazer` forum as canonical. The archived JSON is its configuration, not the live state; live drift is UNKNOWN.

## Packets produced alongside this record (all unsigned drafts)

- `docs/research/MAZER_ENDLESS_HAZARD_PRODUCT_CONTRACT_DRAFT.md` (covers the ladder/hazard cards).
- `docs/research/MAZER_ECONOMY_AND_ENTITLEMENT_CONTRACT_DRAFT.md` (shop, entitlement; checkout stays blocked).
- `docs/architecture/MAZER-OFFLINE-SYNC-CONTRACT.md`.
- `docs/architecture/MAZER-PWA-STRATEGY-AND-BROWSER-MATRIX.md`.

## Decisions needed from the owner

1. Approve this table as the reconciliation of record, or amend verdicts and gate classes.
2. Whether and when to run a guarded live sync of the Discord board (PROVIDER-GATED; this document performs none).
3. Sign or reject the hazard contract, which unlocks the five COVERED rows.
4. Sign or reject the economy/entitlement and offline-sync drafts, which unlock most NOT-STARTED rows.
5. Confirm the DEFERRED-BY-DIRECTION set (camera zoom/minimap, diagonal graph, four moving-maze cards, multiplayer, endless multiplayer, social, run-quality results UI) and whether any deferral has an expiry.
6. Whether to correct stale board entries (the three in finding 1) in the DiscordOS repo or leave the archived file untouched and rely on this record.
7. Install gate policy (finding 6).

## UNKNOWN

- The live state of the Discord board and its cards (not read).
- The true last-edit date of the board JSON (carried from the owner thread, not confirmed).
- Whether the 45 triage-basis rows hold; they were taken from the owner's triage and the board text.
- Test results: no test was executed in this session; "verified" means code, tests and docs were read.
- Deployed or provider state for any row, including whether the migrations are applied in a live project.
- Whether any card text in the archived JSON was edited after the archive.
