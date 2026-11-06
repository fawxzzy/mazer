# Mazer Endless Hazards: Product Contract (Draft)

Status: DRAFT, unsigned
Date: 2026-11-05
Base: `origin/main` at the commit this branch was cut from (`1670c8af`)

This document is the "new bounded proposal" that the Reopening Gate in `docs/research/MAZER_PRESSURE_MECHANICS_PREP.md` requires before any object mechanic can return. It authorizes nothing by itself. It is not a deploy, provider, or schema action.

How to read it. Every claim carries one of three labels, and the labels are never merged:

- **DOCUMENTED FACT**: verified in this repository (code, tests, migrations, docs, or git history) at the base above.
- **EXTERNAL EVIDENCE**: from outside the repository. Each item names its source, or is marked "external, unverified in this session".
- **PROPOSAL**: a recommended default. Not a decision. It becomes a decision only when the owner signs the checklist at the end.

## 0. Status and authority

**DOCUMENTED FACT**

- `docs/research/MAZER_PRESSURE_MECHANICS_PREP.md` (dated 2026-08-24) is marked "superseded by explicit no-play-object product decision". It states that live play contains only player, goal, trail and presentation effects, and that a future gameplay object "requires a new product contract and source lane; it cannot reactivate retired code". Its Reopening Gate requires: explicit visual identity, collision semantics, fairness/escape proof, lifecycle timing, diagnostics, accessibility, and player-facing acceptance.
- The retired code was removed in `d53b2fdb` ("refactor(gameplay): retire dormant maze objects", 2026-08-24): `src/legacy-runtime/legacyStaticSlowTile.ts`, `src/legacy-runtime/legacyPatrolAgent.ts`, their tests, and the scene wiring. The sibling room-subsystem retirement is `bdf11e45` (2026-08-23). Their parent states (`d53b2fdb^`, `bdf11e45^`) are the design reference for what was retired. They are reference only and are not reactivated by this document.
- Facts about the retired design, read from `d53b2fdb^`:
  - The static slow tile was eligible only in the `architect` and `mythic` difficulty bands; the patrol agent only in `mythic`. Both required an alternate route to exist (`alternateRouteStepCount`, computed with `resolveLegacyPlayableShortestPath`).
  - Both were wall-clock designs in milliseconds: a 440 ms penalty, an 880 ms timed-gate cycle (440 ms active, 440 ms safe), a 440 ms patrol step, a 440 ms collision delay, 220 ms telegraph and feedback windows.
  - The consequence was a bounded delay, not a fail.
- The pre-retirement prep (`d53b2fdb^:docs/research/MAZER_PRESSURE_MECHANICS_PREP.md`, 2026-07-07) said "Start with static hazards or slow timed gates before mobile enemies" and "Do not mix [reset, time penalty, stun, trail cut] until one model is chosen".
- The "no play objects" decision followed the progression incident described in section 6.4 (commits `d27aec25` and `0f4ff679`, 2026-08-23, and the guard tests they added).

**PROPOSAL**

- This contract supersedes the old band-gated hazard tiers (slow tile in Architect/Mythic, patrol in Mythic) with a ladder in which hazards enter on a strict schedule from early levels (section 6).
- Gate: the owner signs this document (name, date) before any hazard code merges. The ATLAS plan freezes "Mazer new features" unless the owner names them; signing names them.
- Guard against a repeat of the 2026-08-23 incident: hazards must never appear because of a counter migration or a clamp. They appear only through the budget schedule in section 6, and a test must pin that level 1 of any save has none.

**Owner direction recorded in the owner thread (2026-11-05, not a repo artifact)**: level 1 is a straight corridor; every later level is strictly harder, forever; difficulty comes from obstacles and enemies only; zoom, camera, board-size, and shrinking-space levers are deferred.

## 1. Vocabulary (the class boundary)

**PROPOSAL**

- **Obstacle**: occupies a fixed cell. Its state is a constant or a pure function of the global tick. Kinds: static blocker (impassable cell), timed gate (open or closed on a fixed period).
- **Enemy**: moves between cells under a deterministic rule evaluated in the enemy phase of `WorldTurnHost`.
- **Item**: a pickup with a bounded effect. Never required to solve a level. Excluded from every solvability check.
- Build order: obstacles before enemies.

**DOCUMENTED FACT (conflict to settle)**: the owner-side ledgers disagree on order. A 2026-07-07 Codex ledger says "hazards before enemies"; the DiscordOS board snapshot dated 2026-07-13 says "coins, then enemies, then player items, then obstacles". The board file is archived outside this repo (see `docs/ops/MAZER-BOARD-RECONCILIATION-2026-11-05.md`).

## 2. Collision semantics

**DOCUMENTED FACT**

- The repo's board text contradicts itself on enemy contact: one card says pressure "resets only the current maze attempt", another says "End the game on enemy collision or contact when no pass-through effect is active", the obstacle card says failure "respects current-attempt checkpoint policy". No owner-ratified consequence was found.
- "Checkpoint" is ambiguous. Maze generation uses a checkpoint-driven path builder (`pathBuilderStats.topology: 'legacy-checkpoint-path-builder'`, checkpoint counts and `minCheckpoints` in `src/legacy-runtime/legacyMaze.ts`). The board text uses "checkpoint" for a durable progress point in the Endless attempt model. No document found reconciles the two meanings.
- Play-mode HUD timer: `docs/ops/MAZER-LEVEL-PROGRESSION-GALLERY-2026-08-27.md` reports a play-mode HUD timer that was invisible and then "since-removed". At the base commit no clock, move counter, or score is wired into play that a delay could tax. (Run-quality telemetry exists, but it measures runs; it is not a player-facing cost.)

**PROPOSAL**

- Contact consequence: deterministic pushback to the nearest junction or checkpoint behind the player, plus an invulnerability window of N world turns (N proposed 2). Never a level fail. This amends the two board sentences quoted above.
- Cost surface (a contact must cost something, and an untimed turn-synchronous maze has no clock to tax): the owner must choose one.
  - (a) pushback only (cost = progress lost);
  - (b) pushback plus a hit budget per attempt (for example 3; at 0, restart the level start);
  - (c) pushback plus a move/turn counter that feeds a score.
- Moving into a hazard cell: obstacle cells are impassable (blocker) or blocked while closed (gate). The move is rejected without consuming the world turn.

## 3. Fairness and escape proof

**PROPOSAL** (every generated level, validated at generation time and in CI)

1. Solvable with all hazards present: a witness route found by BFS/A* over (cell, tick mod P), P = lcm of hazard periods, using the same movement rules as play; persisted with the level for replay.
2. Solvable with every item absent.
3. Validation also runs from every state reachable after a contact (post-pushback cell, end of invulnerability), so pushback can never strand the player.
4. At least one alternate route when a mandatory chokepoint hosts a hazard (the retired design's rule, section 0).
5. No unseeded randomness: hazards are pure functions of (level seed, tick, player position).
6. First-encounter safety: a newly introduced hazard type appears alone, in a safe configuration, before it is combined.
7. Pause/resume causes no catch-up burst (the world advances only on player actions in turn-synchronous play).
8. One graph contract for hazards shared by generation, movement, AI distance, compass, trail, telemetry and rendering. No hazard ships before packet P3 defines it.

**DOCUMENTED FACT relating to item 8**: `docs/architecture/MAZER-EDGE-WRAP-TOPOLOGY-CONTRACT.md` governs generated-maze edge-wrap endpoint pairing, and `docs/architecture/MAZER-UI-REWORK-TOPOLOGY-PATH-CONTRACT.md` governs a rendering mask vocabulary (which of N/E/S/W a cell connects to). Neither covers hazards. Earlier drafts said three existing docs require one shared hazard graph contract; that was not re-verified and is withdrawn here, so item 8 stands as a proposal only.

**EXTERNAL EVIDENCE** (from the owner-side research report, cited by that report; not re-fetched in this session)

- Space-time A* with a wait action is the textbook method for time-dependent hazards (Silver 2005, `https://cdn.aaai.org/ojs/18726/18726-52-22369-1-10-20210928.pdf`); SIPP is the faster variant (`https://publications.ri.cmu.edu/sipp-safe-interval-path-planning-for-dynamic-environments`). The cost figures there are multi-agent or robotics, not a small single-agent grid.

## 4. Lifecycle timing

**DOCUMENTED FACT**

- `docs/architecture/MAZER-WORLD-TURN-CONTRACT.md` defines `WorldTurnHost` (`src/mazer-core/world/WorldTurnHost.ts`). A `player-move` command advances the world only when the movement handler accepts the move. Canonical phase order: player movement, enemy movement, projectile movement, pickups, item effects, duration expiry, collisions. Rejected movement cannot run downstream phases or consume a turn number. Timed mode is disabled by default.
- Current boundary: the legacy `MenuScene` player-movement path enters `WorldTurnHost` after the directional-intent resolver selects one legal cardinal step. Enemy, projectile, item, duration, and collision handlers "remain unintegrated".
- `src/mazer-core/enemies/WardenGraphAgent.ts` exists as a non-live graph agent. It is imported only by `src/scenes/menuIntentRuntime.ts`, which no scene imports (only tests do), so it is not wired into the shipping scene; this document does not rely on it.

**PROPOSAL**

- The world ticks only when the player acts (turn-synchronous), on the existing phase order. How smooth held movement maps to one world turn is not documented and must be verified before any commitment (UNKNOWN, below).
- Enemies move at most one cell per world turn; decide only on arriving at a junction; never reverse (except at a visible global event, if any); use a fixed tie-break order (up, left, down, right); use no unseeded RNG.
- Telegraph: every hazard state change is visible one turn ahead.

**EXTERNAL EVIDENCE** (via the owner-side research report)

- Pac-Man ghosts may not reverse, decide only when entering the tile before an intersection, and use a fixed tie-break order (up, left, down, right); "personalities" differ only in target-tile rule (Pittman, Pac-Man Dossier, `https://pacman.holenet.info/`). Pac-Man is real-time, so it supports junction-only decisions, not turn-synchronous ticking.
- Chip's Challenge ticks monsters on a fixed interval in a defined order; its random movers were what broke reproducibility across rulesets (`https://www.muppetlabs.com/~breadbox/software/tworld/rulecomp.html`).

## 5. Archetypes and items

**DOCUMENTED FACT**

- `docs/research/MAZER_WEB_V1_CYBERDECK_CANONICAL_DEEP_RESEARCH.md` (imported 2026-07-27, labeled "canonical planning input, not an implementation packet") sets the bounded Web v1 budget at one single-player mode, three enemy archetypes, four item types, one earned currency, and twelve earned cosmetics. The archetypes and items are not enumerated in the repo. The budget comes from a research import, not from a located owner gameplay decision.
- Board cards on cloak ("freeze all enemy movement"), mystery box (mentions bullets and shields), and enemy pursuit ("pathfinding toward the visible, targetable player position") exist in the archived board; see the reconciliation doc.

**PROPOSAL** (Web v1 budget: 3 enemies, 4 items)

- One junction-greedy movement engine with three target rules: patroller (fixed shuttle route), chaser (the player's current tile), interceptor (cells ahead of the player's heading). Wall-follower is the alternate third.
- The board's "pathfinding toward the player" wording (shortest path) is replaced by junction-greedy, because a same-speed shortest-path pursuer cannot be outrun in a maze.
- Items: shield (one charge, no stacking), cloak (scoped to freeze OR pass-through, not both), timed speed, reveal map. Deferred: teleport, extra life (highest balance risk), bullets (adds a projectile phase).
- Item supply is capped and not tied to level, or it cancels the rising budget. Items are independent of any paid entitlement (see `docs/research/MAZER_ECONOMY_AND_ENTITLEMENT_CONTRACT_DRAFT.md`).

## 6. Difficulty ladder

### 6.1 What exists today (DOCUMENTED FACT)

- Difficulty target for level L is `8 + 4 * (L - 1)` (the next-level helper is `8 + 4 * level`), clamped to `8..400` (`LEGACY_PROGRESSION_MIN_COMPLEXITY = 8`, `LEGACY_PROGRESSION_MAX_COMPLEXITY = 400`, and `resolveLegacyProgressionNextLevelTargetComplexity` clamps the level input to `1..99`, all in `src/legacy-runtime/legacyProgression.ts`).
- The generation profile uses a "difficulty step" `floor(difficultyLevel / 2) + 1` clamped to `1..99` (`resolveLegacyProgressionDifficultyStep`), so levels pair into steps. Band breakpoints in the profile resolver are at step 1 (tutorial), 8 (starter), 18 (explorer), 29 (navigator), 41 (architect), then mythic. Each band carries a `targetScale` (29, 29 to 35, 43, 55, 71, 96). In level terms the bands switch at roughly levels 16, 36, 58 and 82; from there the config never changes.
- Board scale is a difficulty lever today (`targetScale` plus a device-relative cap, `LEGACY_PROGRESSION_ABSOLUTE_MAX_SCALE = 150`).
- The displayed level is a separate unbounded ordinal. `docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md` ("2026-08-23 Superseding Progression Contract") says the ordinals have no application-level 99 ceiling, never derive from target complexity, and that the bounded `8..400` target "still owns rank, palette tier, maze scale, topology pressure, and hazard eligibility".
- `docs/ops/MAZER-LEVEL-PROGRESSION-GALLERY-2026-08-28.md` (1-500 capture): every level at or above 100 uses the same topology as level 99 (clamped target 400, same size, same digest). `src/legacy-runtime/legacyEndlessProgression.ts` (the `endless-v1` recipe, which cycles and spikes from level 100) is consumed only by the remote-sync layer and not by scene generation; its header calls it non-load-bearing until server-owned recipe provenance exists.
- Server side (`supabase/migrations/20260822000100_mazer_endless_completion_rpc.sql`): the completion RPC advances `player_target_complexity` itself as `least(400, greatest(8, current + 4))` and derives rank and color tier from it: rank E below 28, D from 28, C from 46, B from 70, A from 96, S from 125. `20260822000000_mazer_endless_progression_foundation.sql` adds the CHECK `player_target_complexity between 8 and 400` (and the AI equivalent). Rank is closed against target by `20260828154500_mazer_progression_rank_closure.sql`. The server never sees maze configuration; it receives a `ruleset_id` limited to `legacy-v1` / `endless-v1` by a CHECK constraint and by client validation in `legacyRemoteProgression.ts`.
- Applied status of these migrations in a live project is UNKNOWN from the repo alone; only the migration files were read.

### 6.2 Owner-thread findings (not reproducible from this repo)

- The structure-only ladder (more bends, dead ends, loops within a fixed board size) saturates around level 27 to 40: beyond that, additional levels add no meaningful structure. The measurement was made in the owner thread. The harness is not committed here, so the exact figure is carried as stated and flagged UNKNOWN for independent reproduction.
- Consequence for this contract: with the board size frozen (the owner deferred size and zoom), structure alone cannot make levels "harder forever". Hazards are required for that goal.
- An earlier owner-side indicative measurement (uncommitted harness) reported that delivered complexity overshoots target and the shortest path is not monotone in target. Treat as indicative only.

### 6.3 Proposal

- Level 1: a straight corridor. **DOCUMENTED FACT**: this has been implemented on a separate lane (branch `claude/mazer-p1-corridor-level1-20261105`; it is not on `origin/main` at the base commit). It adds an optional `layout: 'corridor'` field on the generation profile in `src/legacy-runtime/legacyMaze.ts`, emitting one seed-independent straight line of floor inside an all-wall border, horizontal on square and landscape boards, vertical on portrait boards, start at the top/left end and goal at the other. It bypasses the random-walk builder and every post-carve stage (no wraps, shortcuts, dead ends or 2x2 blocks), and `legacyGenerationLifecycle.ts` skips under-target retries for it because a retry would drop the layout. The tutorial profile in `legacyProgression.ts` selects it. Its tests are in `tests/reset/legacy-corridor-level1.test.ts` and its commit message reports that all non-level-1 outputs in a 212-case regression hash corpus stayed identical (188 of 188). That regression result was read from the commit message and was not re-run in this session.
- Board scale stays frozen (no size or zoom lever until a later packet).
- Budget: integer `D = level - 1` (uncapped; bigint-safe at persistence). Points rise by exactly 1 per level. A deterministic greedy allocator spends them over a menu (bends, dead ends, loops, obstacles, patrol, chaser, tier upgrades) at convex prices, the k-th unit of type t costing about `w_t * (1 + k / m_t)`. Hazard counts then grow roughly as sqrt(D). A new hazard unit unlocks every K levels (K proposed 5), introduced alone, then developed, then combined. Level seed = hash(global seed, level); level pairing removed.
- "Harder" is defined as budget strictly increasing (CI-testable). Felt difficulty is monitored by fallible bots with an epsilon, not asserted.
- Feasibility ceiling: with a fixed board and a finite menu the allocator eventually has nothing to buy. The contract must publish the first such level and the behavior there: (a) variants from a bounded grammar, (b) a declared plateau (which breaks "forever"), or (c) hand off to the deferred size/zoom levers (the deferral then has an explicit expiry).
- The existing `endless-v1` recipe (cycles and spikes from level 100) is replaced or made monotone. Never both active.

**EXTERNAL EVIDENCE** (via the owner-side research report; not re-fetched)

- Arcade ladders plateau by construction (Pac-Man table ends at level 21, `https://www.gamedeveloper.com/design/the-pac-man-dossier`; NES Tetris gravity bottoms at level 29, `https://tetris.wiki/Tetris_(NES)`).
- Budget-with-multiplier encounter building (D&D 2014 multipliers, `https://www.dndbeyond.com/sources/basic-rules/building-combat-encounters`); pacing varies while amplitude does not (Left 4 Dead Director, `https://www.readkong.com/page/the-ai-systems-of-left-4-dead-michael-booth-valve-9664541`). The growth formulas above are the report's own arithmetic, not a sourced comparison.

### 6.4 Where the budget lives (design constraint)

**DOCUMENTED FACT**

- The server owns a copy of the target ladder (+4 per clear, clamp 400, rank thresholds, DB CHECK 8..400). It never recomputes maze configuration from level and never sees a hazard budget. The thresholds are duplicated in TypeScript (`legacyProgression.ts`), the RPC bodies, and the closure migrations.
- Incident: on or about 2026-08-23 the player progression "jumped from 1 to 99" and late-game objects became reachable. The response was to decouple the displayed ordinal from difficulty (`d27aec25`, `0f4ff679`) and to add guard tests in `tests/reset/legacy-progression.test.ts`:
  - "rebases legacy player history to the gentle baseline instead of converting it into late-game difficulty" (line 300);
  - "rebases a versioned but impossible player level before it can unlock late-game hazards" (line 386);
  - "accepts coherent historical progress only from an authoritative remote row and stamps local provenance" (line 417);
  - "keeps maze geometry independent from a very large completion ordinal" (line 647);
  - "does not rebase a real account whose progress was earned under a previous, lower-rate formula" (line 668).
  - A related earlier fix is `92c50b5d` ("level-10 progression wipe", 2026-08-22). The coherence ceiling and the baseline version (`LEGACY_PROGRESSION_PLAYER_BASELINE_VERSION = 5`) live in `legacyProgression.ts`.
- Client merge takes `Math.max(local, remote)` for `targetComplexity` (`legacyRemoteProgression.ts`), so server-held targets above any new ladder would keep winning.

**PROPOSAL**

1. Keep `targetComplexity` exactly as is (clamp 400, +4, rank thresholds). It keeps driving rank, palette and the server.
2. The hazard/geometry budget is a separate client-side quantity, not the targetComplexity track. This keeps the server blind to the budget, so no provider change is needed.
3. Source of the budget, two options. (a) Default: derive `budget = level - 1` from the server-authoritative ordinal, protected by the existing coherence ceiling and provenance guards plus a new test that an out-of-range or migrated save can never produce hazards before the schedule allows. (b) A separate persisted counter. Option (a) re-couples ordinal and difficulty, which is exactly what the 2026-08 work removed; the new guard test is what makes that acceptable.

## 7. Diagnostics

**PROPOSAL**: per level, record seed, budget, allocation, hazard list with cells and periods, witness route, validator verdicts (hazards present / items absent / post-contact), contact events, and invulnerability windows. A report harness analogous to the geometry delivery report is needed for hazards. (The geometry delivery-report script mentioned in the owner thread is not in `package.json` at the base commit and is not described here.) Existing diagnostics context: `docs/architecture/MAZER-UI-REWORK-DIAGNOSTICS-V1.md`. The fixed world-semantic v1 `pressure` and `patrol` fields remain forced-null tombstones (per `MAZER_PRESSURE_MECHANICS_PREP.md`) and must be reintroduced deliberately, not by accident.

## 8. Accessibility

**EXTERNAL EVIDENCE: external, unverified in this session** (cited from general knowledge, not fetched here): WCAG 2.x success criteria 1.4.1 (use of color), 1.4.11 (non-text contrast, 3:1), 2.3.1 (three flashes or below threshold); Game Accessibility Guidelines for practice/assist options; Xbox Accessibility Guideline 118 on flashing. Exact wording and thresholds must be confirmed from the primary sources before sign-off.

**PROPOSAL**

- Hazard state is never conveyed by color alone.
- Hazard versus background non-text contrast of at least 3:1.
- No flashing above 3 per second; telegraphs have a non-motion form and respect a reduced-motion setting.
- No precise real-time timing required (turn-synchronous).
- Visual identity of each hazard (shape, glyph, palette tier) is not defined here and needs a design pass; see the Mazer visual docs (`docs/research/MAZER_PIXEL_ART_VISUAL_LANGUAGE.md`, `docs/architecture/MAZER-UI-REWORK-DESIGN-TOKENS.md`) for the existing language it must fit.

## 9. Demo / menu AI

**DOCUMENTED FACT**: the menu demo shares generation code with gameplay and has its own progression track (`ai-runner`) separate from `player`. `MAZER_PRESSURE_MECHANICS_PREP.md` forbids menu hazards in `MenuScene` without a new product decision.

**PROPOSAL**: hazard-free by declaration while only static obstacles exist (a separate demo progression profile with hazards off); hazard-aware (offline planning over (cell, tick mod P), with the replay seed checked on every build) when the first enemy ships. The perfect planner is a solvability oracle only; difficulty calibration uses separate fallible tiers (exact, limited horizon with mistake probability, myopic).

**EXTERNAL EVIDENCE** (via the owner-side report): recorded-input replay with a stored seed is the common attract-mode method and breaks if rules or RNG order change (`https://www.yaldex.com/games-programming/0672323699_ch11lev1sec6.html`); the Pac-Man demo is a shipped demo that visibly loses (Pac-Man Dossier, above).

## 10. Player-facing acceptance

**PROPOSAL**: a new player's first levels contain no hazard; the first hazard of each type is introduced alone with a telegraph; no level can be lost without a legal way to avoid contact; contact never ends a run; every level is solvable with items absent; the demo never contradicts real hazard rules; the section 8 checks pass.

## 11. Open dependencies

**DOCUMENTED FACT** (all of the following were read in the repo, not applied anywhere)

- Client-only, source-side changes: dropping level pairing (`resolveLegacyProgressionDifficultyStep`), a level-1 corridor via a profile field (done on the P1 lane), a local hazard budget kept off the server.
- Removing the 99 clamp in the maze-profile derivation would also need to keep their own bounded inputs in the movement-speed and AI-skill ramps (`src/legacy-runtime/legacyMovementSpeed.ts`, `src/legacy-runtime/legacyDemoWalker.ts`); otherwise those ramps receive unbounded input. The specific line numbers cited in earlier drafts were not re-verified.
- Migration care (client): coherence ceiling and baseline-version sentinel in `legacyProgression.ts`; `Math.max(local, remote)` target merge in `legacyRemoteProgression.ts`; never bump `LEGACY_PROGRESSION_PLAYER_BASELINE_VERSION` without intent (it rebases saves lacking the new sentinel).
- Provider-gated (Supabase apply requires explicit owner approval, and is NOT part of this document): raising or removing the 400 cap (CHECK plus RPC `least(400, ...)`); changing the +4 step, rank thresholds, or color tier (RPC bodies plus rank closure; duplicated in TS, RPC, SQL); any new ruleset id (CHECK constraint plus outbox validation); server-side validation of a budget. Do not re-run `20260828140000` / `20260828140100` after a ladder change; they hardcode the old mapping.
- Tests that pin the current ladder and will need explicit amendment per packet: `tests/reset/legacy-progression.test.ts`, `tests/reset/legacy-endless-progression.test.ts`, `tests/reset/mazer-master-schema-parity.test.ts`, `tests/reset/legacy-remote-progression.test.ts`, `tests/reset/legacy-movement-speed.test.ts`. Docs to amend: `docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md` and `docs/current-truth.md` (progression sections).

## 12. Packet sequence

**PROPOSAL**: P0 this contract (with the server-cap trace above) -> P1 corridor level 1 (implemented on its lane, not yet on main) -> P2 budget ladder skeleton for levels 2 to 30 with no hazards -> P3 graph contract and validator -> P4 obstacles -> P5 patroller -> P6 chaser and interceptor -> P7 fallible bots and the published ceiling -> P8 items. One packet per worktree. No deploy without the exact approval wording in `AGENTS.md`. Felt-difficulty changes need owner sign-off before merge.

## Decisions needed from the owner

Sign-off line: Approved as the Reopening Gate proposal: name ______ date ______. Signing also names "Mazer new features" for the ATLAS plan freeze list.

1. Is this the contract the Reopening Gate requires, and does signing it name Mazer features for the ATLAS plan?
2. Class boundary (obstacle / enemy / item) and build order (obstacles first?).
3. Enemy movement: turn-synchronous junction-greedy, versus the board's shortest-path pursuit wording.
4. Contact consequence, cost surface (a, b, or c in section 2), and the meaning of "checkpoint".
5. Demo AI position (hazard-free by declaration, then hazard-aware).
6. K (levels per new hazard unit), the meaning of "harder" (budget by construction versus felt difficulty), and the behavior at the feasibility ceiling, including whether the size/zoom deferral expires there.
7. Ladder change scope given the pinned tests and the server caps; budget source (a or b in section 6.4).
8. Confirm or replace 3 enemies and 4 items; cloak scope; who owns hazard visual identity.
9. Whether a changed felt difficulty at the pairing and band boundaries is acceptable.

## UNKNOWN

- Whether any live Supabase project has the migrations applied as written (repo files only were read).
- The structure-only saturation level (27 to 40): carried from the owner thread; no committed harness here reproduces it.
- Whether the P1 corridor lane has been reviewed or merged; only its commit was read.
- How smooth held movement maps to one world turn in `MenuScene`.
- Whether any player-facing cost surface (clock, move counter, score) exists beyond telemetry.
- Whether the 3 enemies / 4 items / 1 currency / 12 cosmetics budget is still the plan.
- The original owner turn that set the "no objects yet" decision (only its repo footprint was read).
- Accessibility thresholds (section 8) pending primary-source confirmation.
- What "checkpoint" means in the Endless resolver versus generation.
