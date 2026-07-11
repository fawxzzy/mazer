# Mazer Board Reconciliation - 2026-07-10

Status: planning and board-reconciliation record. No Mazer product code changed by this packet.

## Purpose

This record translates the current feedback packet into a small, implementation-ready Mazer card set. It prevents parallel cards from redefining the same progression, maze, UI, or visual behavior.

The canonical live board is the Discord `mazer` forum in the `project-feedback` family. The source board configuration remains the detailed card contract; live roots are short summaries because Discord message bodies are bounded.

## Discovery Summary

- Live readback confirmed the existing Mazer cards are active and unarchived. Sampled card threads had no follow-up discussion that changes ownership.
- `mazer-ai-level-rank-progression` already owns the broad progression contract. It is expanded instead of replaced.
- `mazer-fluid-controls-and-motion` owns intent resolution. Zigzag corridor assistance belongs there, while `mazer-player-input-movement-correctness` remains the correctness dependency.
- `mazer-mobile-shell-device-harness` already owns mobile safe-area, portrait, and device proof. A separate browser-layout card is justified because it has a different persistence/restoration path.
- `mazer-procedural-difficulty-generator-shaping` owns numeric difficulty delivery. A single maze-feature parity card is justified because feature registry, level gating, preview/play parity, and bleed-edge classification are not yet a single owned subsystem.
- `mazer-iridescent-player-trail-material` remains the future material lane. The fixed green player/trail plus white shine contract is a separate short-term readability delivery.

## Source-Language Interpretation

The feedback packet used the phrase "beer tab" once. A repository search found no Mazer route, component, feature, or panel with that name. It is therefore interpreted as the browser tab/window viewport and its resize/restore behavior.

## Current Terminology And Data Flow

| Concept | Current owner / meaning | Stored, derived, or displayed | Needed decision |
| --- | --- | --- | --- |
| Run score | `paceScore`, a 0-100 weighted run-quality result | Stored on each progression track and displayed | Recalibrate weights and regression smoothing before retuning labels. |
| Target complexity | Numeric progression source of truth | Stored on player and AI-runner tracks | Keep as the only progression source after the formula audit. |
| Level | `floor((targetComplexity - 8) / 4) + 1`, clamped 1-99 | Derived but currently mirrored in track state | Centralize derivation and preserve save compatibility. |
| Rank | E/D/C/B/A/S target-complexity band | Derived but currently mirrored in track state | Keep public rank; decide whether it stays complexity-only or later blends consistency. |
| Player skill | Current public label for player level/rank | UI terminology over stored progression values | Remove from public surfaces only; do not delete data without migration approval. |
| AI skill | AI-runner level/rank plus local cognition profile | Derived from AI track; displayed in menu | Keep distinct from player presentation and behavior tuning. |
| Maze rating | Measured complexity from size, route, floor, shortcuts, wraps, splits, dead ends, and fill | Derived after generation | Make it explicit and compare it to requested target complexity. |
| Difficulty profile | Tutorial through mythic level bands | Derived from active target complexity | Make feature introduction and parameter ranges traceable by band. |
| Complexity | Requested target versus measured generated result | Stored target plus derived measurement | Never treat an under-delivered maze as the intended difficulty. |

Current player and AI tracks are separate. The active play surface updates the player track; the menu demo updates the AI-runner track. The current public badge language exposes level/rank and score, while diagnostics also expose progress percent, next thresholds, signal trend, and generation delivery. Those diagnostics are not a second public progression system.

## Architecture Findings

### Progression

- `src/legacy-runtime/legacyProgression.ts` stores player and AI-runner tracks under `mazer.progression.v1`.
- Current run score weights time, route efficiency, wrong turns, backtracks, reset use, and frame stability. AI runs add decision reliability pressure.
- Current progression uses a six-signal window. Challenge raises target complexity by 1-3; ease lowers it by 1-2; hold does not move it.
- Difficulty profiles currently gate scale, checkpoints, shortcuts, wrap pressure, route reinforcement, and perimeter feeders across tutorial, starter, explorer, navigator, architect, and mythic bands.

### Controller

- `src/input-human/touch.ts` already produces an eight-segment stick intent and ordered cardinal candidates.
- `src/scenes/MenuScene.ts` resolves legal neighboring moves and canonical input buffering, but it does not yet own a bounded macro-direction corridor resolver. That is the correct insertion point for short, unambiguous zigzag assistance.

### UI And Orientation

- `src/legacy-runtime/legacyMenuLayout.ts` recomputes board and controls from current viewport dimensions.
- Current persistence is for progression, auth, and game toggles. There is no dedicated versioned browser UI layout-state schema for position, size, docking, or expansion restoration.
- `src/boot/orientationLock.ts` makes a best-effort portrait lock request. Browser restrictions can reject it, and current CSS fallback remains intentionally non-blocking.
- Fawxzzy Fitness provides reusable concepts, not copy-paste code: centralized safe-area variables, `100dvh` sizing, and `visualViewport` inset synchronization. Mazer should adapt those ideas as one canvas/layout input contract, not import Fitness CSS or React shell code into Phaser.

### Maze Features

- `src/legacy-runtime/legacyGenerationLifecycle.ts` has separate menu and play build kinds, while sharing high-level target-complexity selection and retry machinery.
- Current generator pressure controls include checkpoint count, shortcut count, route reinforcement, opposite-border wrap requirements, and border feeders.
- Edge wraps currently contribute both complexity and shortcut relief. Their feature-classification and preview/play progression rules are not yet centrally declared.

## Reconciliation Decisions

| Requirement | Canonical owner | Decision |
| --- | --- | --- |
| Player, AI, score, rank, and maze-rating reevaluation | `mazer-ai-level-rank-progression` plus `mazer-procedural-difficulty-generator-shaping` | Expand existing broad owners; do not create competing score cards. |
| Rank-only player display | `mazer-player-rank-only-progression-display` | New UI delivery because it can ship independently from formula recalibration. |
| Zigzag corridor assistance | `mazer-fluid-controls-and-motion` | Append to existing intent-resolver lane; link input-correctness tests. |
| Mobile safe area and portrait fallback | `mazer-mobile-shell-device-harness` | Expand existing owner; no duplicate portrait card. |
| Browser resize/persistence | `mazer-browser-layout-persistence` | New card because browser layout schema/restoration is a distinct subsystem. |
| Cross-viewport contract | `mazer-cross-viewport-ui-reliability` | New coordinating card with two independently verifiable child lanes. |
| Feature levels, parity, and bleed edges | `mazer-maze-feature-progression-parity` | One new umbrella; link generator and edge topology cards rather than create speculative children. |
| Fixed green player/trail and white shine | `mazer-player-trail-readability-lock` | New bounded readability delivery; keep experimental iridescent work separate. |

## Delivery Rules

1. Do not move a percentage because scope was rewritten. A marker ratchets only after implementation and proof.
2. Do not delete or migrate saved progression fields as part of removing a public label.
3. Use the shortest viable path only as a post-run benchmark, not as the AI movement controller.
4. Controller help is valid only for bounded, unambiguous local corridor continuations. It must yield immediately to explicit input and never select a branch.
5. A maze feature must have an explicit classification: always-on, level-gated, mode-specific, experimental, deprecated, or disconnected. Absence from a mode is not an implicit policy.
6. Every mobile claim needs route-aware proof on the touched surface at phone dimensions and, where relevant, a real-device or maintained device-harness pass.
7. Browser layout restoration must normalize invalid/legacy state to a safe default rather than preserve overlap.
8. The current fixed visual contract is green player/trail with one white fading shine at the existing pulse cadence. Do not introduce rainbow materials, cosmetics, or shop scope through that delivery.

## Recommended Implementation Waves

1. `mazer-cross-viewport-ui-reliability` -> `mazer-mobile-shell-device-harness` and `mazer-browser-layout-persistence`.
2. `mazer-player-rank-only-progression-display` after the progression terminology audit begins, with no data migration.
3. `mazer-fluid-controls-and-motion` bounded zigzag fixture and intent resolver.
4. `mazer-maze-feature-progression-parity`, then its linked generator and edge-topology implementation work.
5. `mazer-player-trail-readability-lock` visual implementation and mobile/desktop contrast proof.
6. Return to formula recalibration only after the feature matrix and score fixtures produce comparable player/AI samples.

## Verification Expectations

- Read the live Discord root after every board mutation.
- Use deterministic fixtures for perfect, strong, average, weak, and failed progression runs.
- Use paired narrow/wide and reload viewport tests for browser layout behavior.
- Use authenticated mobile captures for Options, Pause, HUD, touch controls, and scroll rails.
- Record whether a Fitness pattern was reused, adapted, rejected, or incompatible in the implementation receipt.
