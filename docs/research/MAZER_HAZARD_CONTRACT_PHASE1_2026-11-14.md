# Mazer endless hazards: product contract, phase 1 (SIGNED 2026-11-14)

Status: signed product contract, docs and tests only. It records the owner decision; it enables nothing. No hazard, enemy, obstacle or item code exists or is added by this change, nothing a player sees changes, and the dormant switch `LEGACY_HAZARD_LAYER_ENABLED` stays a literal `false` (pinned by `tests/reset/legacy-hazard-handoff.test.ts` and `tests/architecture/hazard-contract-signed.test.ts`). It grants no merge, deploy, provider, database, credential or DNS authority.

## Signature record (MAZER-HAZ-002, MAZER-PROG-019)

- Signed by: the owner (Zac), 2026-11-14.
- Words: "yes to all", said in answer to the list of open owner decisions that included (a) sign the endless hazard contract, phase 1 (MAZER-HAZ-002) and (b) accept that the strictly rising geometry ladder ends and the hazard budget takes over (MAZER-PROG-019, folded into HAZ-002; MAZER-PROG-005 is the card that asked which lever follows the plateau).
- Scope of the signature: phase 1 = this document as written: the vocabulary, fairness and escape proof, lifecycle timing, archetypes and items, difficulty ladder, diagnostics, accessibility, demo AI and acceptance rules below, with every item tagged DEFAULT accepted as the default. It names Mazer Phase 2 hazards as a work area the owner has chosen. It does NOT authorize any hazard code merge by itself: each packet in section 13 still needs its own card, worktree, tests and review, and the "no deploy without the exact words" and "felt-difficulty changes need the owner before merge" rules in section 13 still apply.
- Decision on the lever after the plateau (MAZER-PROG-005, MAZER-PROG-019): hazards supply the difficulty after the end of the geometry ladder; a bigger board / zoom lever stays ruled out by the owner. The owner accepts that the geometry ladder ends.

### Where the hazard budget starts (read this before the numbers on the cards)

The signed rule is symbolic: `hazardBudgetLevels = level - GEOMETRY_BUDGET_SATURATION_LEVEL`, zero below it and +1 per level above it (`src/legacy-runtime/legacyGeometryBudget.ts`, `src/legacy-runtime/legacyHazardHandoff.ts`). The number is whatever that constant is in source, so it can move without a new signature.

- The signature was given against card text that quoted two older values: 388 (MAZER-PROG-005: the 2026-11-10 mastery tier, removed 2026-11-11) and 218 (MAZER-PROG-019: after the one-tile stub rule, MAZER-GEN-006).
- Neither is the current value. After MAZER-GEN-007 (straighter mazes) the felt ladder saturates at level 283 and the end of the fringe, the saturation level, is **288** on main at c82fe1fd. The hazard budget therefore starts at level 288 today (level 288 owes 0; level 289 owes 1), and the geometry ladder, which strictly rises through level 288, ends there.
- The ladder is longer than the 218 the owner accepted, never shorter, so the acceptance stands. If the owner meant a fixed start at 388 or 218 instead of the constant, say so: that is a reversal and a new decision, not a reading of this one.
- The 2026-11-05 draft below names the 99 clamp, the 8..400 server cap and the +4 step as they were; the section 11 server-cap items remain provider-gated and are not touched.

---

Drafted 2026-11-05 from the owner direction of that date. Signed in part below (2026-11-14).

## 0. Status and authority (draft text, superseded where the signature record above says so)
- Direction (Zac, 2026-11-05): level 1 is a straight corridor; every later level strictly harder, forever; difficulty from obstacles and enemies only; zoom/camera/board-size/shrinking-space levers deferred.
- Prior decision this reopens: "no objects in the game yet" (Zac, ~2026-08-23), a reaction to progression jumping to level 99 and enabling late-game objects. The word "yet" = deferral. This contract states that the old band-gated hazard tiers (slow tile Architect/Mythic, patrol Mythic) are superseded by a ladder in which hazards enter on a strict schedule from early levels. The retired code (`d53b2fdb^`, `bdf11e45^`) is design reference only and is not reactivated.
- Gate (met 2026-11-14): the owner signed this document; per-packet cards and reviews are still required before hazard code merges. ATLAS plan freezes "Mazer new features" unless Zac names them: signing names them. **[accepted 2026-11-14]**
- Guard against the 2026-08-23 incident: hazards must never appear because of a counter migration or a clamp; they appear only through the budget schedule in section 6, and a test must pin that level 1 of any save has none.

## 1. Vocabulary (the class boundary) **[DEFAULT, accepted 2026-11-14]**
- **Obstacle**: occupies a fixed cell; its state is a constant or a pure function of the global tick. Kinds: static blocker (impassable cell), timed gate (open/closed on a fixed period).
- **Enemy**: moves between cells under a deterministic rule evaluated in the enemy phase of `WorldTurnHost`.
- **Item**: a pickup with a bounded effect; never required to solve a level; excluded from every solvability check.
- Build order: obstacles before enemies **[DEFAULT]**. Conflict to settle: Codex ledger 2026-07-07 "hazards before enemies" vs DiscordOS board 2026-07-13 "coins, then enemies, then player items, then obstacles".

## 2. Collision semantics
- Contact consequence **[DEFAULT, accepted 2026-11-14]**: deterministic pushback to the nearest junction or checkpoint behind the player plus an invulnerability window of N world turns (N proposed 2). Never a level fail. Amends two board sentences ("resets only the current maze attempt" and "End the game on enemy collision").
- Cost surface **[Zac must choose]**: the research found no confirmed clock, move counter, or score in Mazer that a delay could tax. Options: (a) pushback only (cost = progress lost), (b) add a hit budget per attempt (e.g. 3; at 0 restart the level start), (c) add a move/turn counter feeding score. Without one of these contact has no cost in an untimed turn-synchronous maze.
- Meaning of "checkpoint": ambiguous in the repo (Endless resolver PR #59 vs generation checkpoints). **[Zac/P0 must define]**
- Movement entering a hazard cell: obstacle cells are impassable (blocker) or blocked while closed (gate); the move is rejected without consuming the world turn **[DEFAULT]**.

## 3. Fairness and escape proof
Required of every generated level, validated at generation time and in CI:
1. Solvable with all hazards present: a witness route found by BFS/A* over (cell, tick mod P), P = lcm of hazard periods, using the same movement rules as play; persisted with the level for replay.
2. Solvable with every item absent.
3. Validation also runs from every state reachable after a contact (post-pushback cell, end of invulnerability), so pushback can never strand the player.
4. At least one alternate route when a mandatory chokepoint hosts a hazard (retired-design rule).
5. No unseeded randomness: hazards are pure functions of (level seed, tick, player position).
6. First-encounter safety: a newly introduced hazard type appears alone, in a safe configuration, before it is combined.
7. Pause/resume causes no catch-up burst (world advances only on player actions in turn-synchronous play).
8. Graph contract: generation, movement, AI distance, compass, trail, telemetry and rendering share one graph contract for hazards (required by three existing docs). P3 defines it; no hazard ships before it.

## 4. Lifecycle timing **[DEFAULT, accepted 2026-11-14]**
- World ticks only when the player acts (turn-synchronous), on the existing `WorldTurnHost` phase order: player, enemy, collisions. Verify how smooth movement maps to a world turn before committing (open).
- Enemies: move at most one cell per world turn; decide only on arriving at a junction; never reverse (except at a visible global event, if any); fixed tie-break order (up, left, down, right); no unseeded RNG.
- Telegraph: every hazard state change is visible one turn ahead.

## 5. Archetypes and items (Web v1 budget 3 enemies / 4 items) **[DEFAULT, accepted 2026-11-14]**
- One junction-greedy movement engine, three target rules: patroller (fixed shuttle route), chaser (player's current tile), interceptor (cells ahead of the player's heading). Wall-follower is the alternate third. Board wording "pathfinding toward the player" (shortest path) is replaced by junction-greedy, because same-speed shortest-path pursuit is unbeatable.
- Items: shield (one charge), cloak (scoped down: freeze OR pass-through), timed speed, reveal map. Not early: teleport, extra life, bullets (adds a projectile phase). Item supply capped and not tied to level; independent of any paid entitlement.
- The archetype/item list is not in the repo; the 3/4/1/12 budget comes from the Cyberdeck research import (2026-07-27), not a gameplay decision. **[accepted 2026-11-14]**

## 6. Difficulty ladder
- Level 1: straight corridor (P1). Board scale frozen (no size/zoom lever until a later packet).
- Budget: integer D = level - 1 (uncapped, bigint-safe at persistence). Points rise by exactly 1 per level; a deterministic greedy allocator spends them over a menu (bends, dead ends, loops, obstacles, patrol, chaser, tier upgrades) at convex prices (k-th unit of type t costs w_t * (1 + k / m_t)); hazard counts grow roughly as sqrt(D). A new hazard unit unlocks every K levels (K proposed 5, **[accepted 2026-11-14]**), introduced alone, then developed, then combined. Level seed = hash(global seed, level). Level pairing removed. The 8..400 complexity track and 99 clamp stop being the difficulty target.
- "Harder" is defined as budget strictly increasing (CI-testable). Felt difficulty is monitored by fallible bots with an epsilon, not asserted.
- Feasibility ceiling: with a fixed board and finite menu the allocator eventually has nothing to buy. The contract publishes the first such level and the behavior there **[accepted 2026-11-14]**: (a) variants from a bounded grammar, (b) declared plateau, (c) hand off to the deferred size/zoom levers (deferral expiry).
- Existing endless-v1 recipe (cycles, spikes, unwired, from level 100): replaced or made monotone; never both active.
- **Where the budget lives (new, from the server trace; this is a real design constraint).** The server owns a copy of the target ladder: `mazer_complete_level` advances `player_target_complexity` itself (+4, clamped 8..400), derives rank and colorTier, and a DB CHECK enforces `target_complexity between 8 and 400`. It never recomputes maze config from level and never sees a hazard budget. So: (1) keep `targetComplexity` exactly as is (clamp 400, +4, rank thresholds): it keeps driving rank, palette and the server; (2) the hazard/geometry budget is a SEPARATE client-side quantity, not the targetComplexity track; (3) the repo spent 2026-08-14..27 *decoupling* the level ordinal from difficulty after the "jumped from 1 to 99" incident (`d27aec25`, `0f4ff679`; guard tests `legacy-progression.test.ts:300-415, 647-666`). Deriving the budget from the ordinal re-couples them. **[Zac decision]**: either (a) derive budget = level - 1 from the server-authoritative ordinal, protected by the existing coherence ceiling and v5-provenance guards plus a new test that an out-of-range or migrated save can never produce hazards before the schedule allows; or (b) a separate persisted counter. Default (a). Either way no provider change is needed as long as the server stays blind to the budget.

## 7. Diagnostics
Per level: seed, budget, allocation, hazard list with cells and periods, witness route, validator verdicts (hazards present / items absent / post-contact), contact events, invulnerability windows. The delivery-report harness (`npm run generation:delivery-report`, uncommitted in the lane-E worktree) is the proof surface for geometry; a similar report is needed for hazards.

## 8. Accessibility **[DEFAULT]**
Hazard state never conveyed by color alone (WCAG 1.4.1); hazard vs background non-text contrast at least 3:1 (1.4.11); no flashing above 3 per second or beyond the Xbox 118 area/luminance limits; telegraphs have a non-motion form and respect a reduced-motion setting; no precise real-time timing required (turn-synchronous); practice/assist options considered per Game Accessibility Guidelines. Visual identity of each hazard (shape, glyph, palette tier) is NOT defined here: needs a design pass **[design pass still owed]**.

## 9. Demo / menu AI **[DEFAULT, accepted 2026-11-14]**
Hazard-free by declaration while only static obstacles exist (separate demo progression profile); hazard-aware (offline planning over (cell, tick mod P), replay seed checked every build) when the first enemy ships. The perfect planner is a solvability oracle only; calibration uses separate fallible tiers. Menu hazards stay out of `MenuScene` until this contract is signed (existing rule in PRESSURE_MECHANICS_PREP risks).

## 10. Player-facing acceptance
A new player's first levels contain no hazard; the first hazard of each type is introduced alone with a telegraph; no level can be lost without ever having a legal way to avoid contact; contact never ends a run; every level is solvable with items absent; the demo never contradicts real hazard rules; accessibility checks in section 8 pass.

## 11. Open dependencies
- Server-side caps/ruleset: TRACED (read-only, agent-reported, worktree at c3fd0408; "applied" status from migration header comments only, live provider state UNKNOWN).
  - Client-only, safe source-side: dropping level pairing (`legacyProgression.ts:574-581`); level 1 corridor via a new profile field; a local hazard budget kept off the server; removing the 99 clamp in the maze-profile derivation PROVIDED `MenuScene.ts:5895,6404` -> `legacyMovementSpeed.ts:~78` and `demoWalker.ts:449` keep their own 1..99 clamps (otherwise movement-speed and AI-skill ramps get unbounded input).
  - Migration care (client, no provider apply): coherence ceiling and v5 sentinel (`legacyProgression.ts:1071-1127`; a ceiling below any new legitimate target brings back the "level-10 progression wipe", `92c50b5d`), `max(local, remote)` target merge (`legacyRemoteProgression.ts:296`: server-held targets above the new ladder keep winning), and never bump `playerProgressionBaselineVersion` without intent (it wipes saves lacking the new sentinel).
  - Provider-gated (Supabase apply = Zac approval): raising/removing the 400 cap (CHECK + RPC `least(400,...)`); changing the +4 step, rank thresholds or colorTier (RPC bodies + rank closure; thresholds are duplicated in TS, RPC and SQL); any new ruleset id (CHECK constraint + outbox validation `legacyRemoteProgression.ts:810`; a new id would be dropped on read); server-side validation of a budget/recipe. Do NOT re-run `20260828140000/140100` after a ladder change (they hardcode the old mapping).
  - Tests that pin the ladder (amend per packet): `legacy-progression.test.ts` 186-240, 300-415, 530-565 (+1 level/+4 target), 567-618 (past 99), 647-666 (ordinal independence), 1258-1285, 1519-1573, 1602-1700 (pairing equalities), 1694-1771, 1772-1822; `legacy-endless-progression.test.ts`; `mazer-master-schema-parity.test.ts`; `legacy-remote-progression.test.ts`; `legacy-movement-speed.test.ts`. Docs to amend: `MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md` 25-27, 51-52, 102-108, 124; `current-truth.md:426`.
- Existing tests that pin the ladder (legacy-progression.test.ts ~1574-1958 etc.) need explicit amendment per packet.
- Unknown: Mazer cost surface (clock/moves/score); smooth movement to world-turn mapping; whether 3/4/1/12 stays.

## 12. Decisions for Zac (sign-off checklist)
Answered by the single signature in the Signature record above ("yes to all", 2026-11-14). The numbered questions are kept in the 2026-11-05 draft history; each item tagged DEFAULT in this document is now the accepted default, reversible by the owner.

## 13. Packet sequence
P0 this contract (+ server-cap trace) -> P1 corridor level 1 (in progress, local) -> P2 budget ladder skeleton L2-30, no hazards -> P3 graph contract + validator -> P4 obstacles -> P5 patroller -> P6 chaser/interceptor -> P7 fallible bots + ceiling -> P8 items. One packet per worktree; no deploy without the exact words; felt-difficulty changes need Zac's sign-off before merge.
