# Mazer Hazard Product Contract (SIGNED 2026-11-15)

Status: signed product contract (Reopening Gate), docs, manifest and tests only. It records owner decisions and enables nothing. No hazard, enemy, obstacle, objective or clock code exists or is added by this change, nothing a player sees changes, and the dormant switch `LEGACY_HAZARD_LAYER_ENABLED` stays a literal `false` (pinned by `tests/reset/legacy-hazard-handoff.test.ts` and `tests/architecture/hazard-contract-signed.test.ts`). It grants no merge, deploy, provider, database, credential or DNS authority. Every slice in section 3 still needs its own card, worktree, tests and review.

## Signature record (MAZER-HAZ-002, MAZER-HAZ-003)

- Signed by: Zac (owner), 2026-11-15, via chat.
- Words: "yes to all four" (recorded from the owner's chat reply on 2026-11-15 to the list of four calls: sign the contract, 10/20/35/60 schedule, rewind-only penalty, shards as the forever axis).
- The four calls signed:
  1. (a) This contract is signed as written (Reopening Gate). Signing also names "Mazer features" for the ATLAS freeze list.
  2. (b) Intro schedule: Pulse Gate at level 10, Sentry at level 20, Hunter at level 35, Shard at level 60. The draft's unlocks at 6/11/16 with spacing 5 are rejected.
  3. (c) Contact is a rewind to the last junction on the player's own trail, with 4 ticks of invulnerability, plus the Hunter mercy cap (the third contact with the same Hunter in one level burns it out). Rewind is the only penalty.
  4. (d) Shards are the forever axis past geometry saturation.
- Labels used below: **Fact** = read in the repo or board on 2026-11-15 at main 2ab307ea; **Decision** = what this contract decides; **Estimate** = not measured yet.
- Not covered: any real-device check (section 4 is still owed), any deploy, the flag flip (slice H9 needs the owner's phone sign-off), and any server, database or provider change.

### Relationship to the phase 1 contract (2026-11-14)

`docs/research/MAZER_HAZARD_CONTRACT_PHASE1_2026-11-14.md` (signed 2026-11-14) stays in force for its vocabulary, fairness and escape proof, accessibility and acceptance rules. This contract amends it in three places, and where they differ this one wins:

- **When hazards start.** Phase 1 said the hazard budget starts at geometry saturation (`hazardBudgetLevels = level - GEOMETRY_BUDGET_SATURATION_LEVEL`). Here hazards enter on the fixed intro schedule from level 10 (section 2.5) as content and variety, and geometry keeps carrying per-level strictness up to saturation. The dormant `resolveLegacyHazardHandoff` stays as written until slice H2 replaces it; this change does not touch it.
- **What the lever after the plateau is.** Phase 1 said "hazards supply the difficulty" there; this contract names the mechanism: Shards (section 2.6). A bigger board or zoom stays ruled out.
- **The world clock** is real time on the player's step clock, not turn-synchronous only (section 2.1).

The draft `docs/research/MAZER_ENDLESS_HAZARD_PRODUCT_CONTRACT_DRAFT.md` is superseded where it disagrees (unlock levels, linear unit counts, blockers, items).

## 1. What Mazer is

**Fact.** Mazer is a phone-first, installable neon-arcade maze game (a PWA, Phaser plus a canvas render stack). Each level is one generated maze that
fits entirely on the screen. You drag anywhere to steer the marker. It runs along corridors at one constant speed (`LEGACY_MOVEMENT_STEP_RATE_FACTOR`,
about 140 ms per step). While a direction is held it keeps going, turns you queue are taken at the next junction, and it stops at dead ends
(`legacyDirectionalIntent.ts`). You reach the goal star while a neon trail records your route. Clear time shows between levels
(FLOW-015, in review). The level number has no upper limit. Rank goes E..S and reaches S by about level 31. The leaderboard ranks only on
`player_level desc, level_reached_at asc`, and progress syncs to accounts. An AI runner plays mazes behind the menu. Level 1 is a straight
corridor. The ladder is strict ("every level harder than the last") through the geometry saturation level, 288 on today's board and about
420 at scale 40 (**Estimate**, research doc). Live play contains no fail state, no enemies and no objects (the 2026-08-24 decision).

**Core loop today:** see the whole board -> plan -> drag and run -> reach the star -> clear card (time, level) -> a harder maze -> climb the leaderboard.
**Core loop after this contract:** the same loop, plus reading moving threats and timing your runs. Lifting your finger means "wait".
Mistakes cost time and distance and never cost the level. A sparse cast of hazards arrives on a fixed, learnable schedule, and every new
kind is met alone before it is mixed with the others.

## 2. Product contract (Reopening Gate)

### 2.1 World clock: real time on the player's step clock (Decision)
- One world tick lasts one player repeat interval (`repeatIntervalMs`, about 140 ms today). Each tick the player either steps one cell or
  waits. Waiting covers a released finger, a bump into a wall, a closed gate and an untaken turn. Enemies move on their own tick fractions.
- The clock starts on the player's **first input** of the level. It stops on pause, on the overlay, on `visibilitychange` and on blur, and
  restarts on the next input with no catch-up. Nobody gets hit while reading the board.
- This changes the tick rule in HAZARD-GRAPH-CONTRACT ("ticks only on player actions"). It does **not** change the validator. In both
  models each tick offers the same choice (move or WAIT), so `findWitnessRoute` and `chaserSolvability` stay exact as written.
- **Why turn-based loses.** (1) Drag-anywhere input has no gesture for "wait", and lifting the finger is the natural one. Turn-based
  play would need a new tap or hold gesture. (2) Enemies that freeze whenever a phone player lifts a thumb read as a bug in an arcade
  game. (3) Turn-based play removes the only source of pressure, which turns enemies into static puzzle pieces. Its one advantage, no
  reflex demand, is won back by the next four rules: slow enemies, one-tick telegraphs, a clock that starts on first input, and pushback
  instead of death.

### 2.2 Class boundary (Decision)
- **Obstacle:** a fixed cell whose state is a pure function of the tick. It never causes contact: it **blocks**, using the existing
  wall-bump nudge (VIS-029). The only obstacle kind is the **Pulse Gate**, a laser fence across a corridor cell that opens and closes on
  its period.
- **Enemy:** something that moves between cells and **causes contact**. Two kinds: **Sentry** (a shuttle on a fixed straight route, on a
  timeline, one cell per tick) and **Hunter** (`chaserEngine` junction-greedy, targets the player's cell, never reverses except at dead
  ends, ties broken up/left/down/right, `speedDivisor` 3 at intro and never below 2).
- **Objective:** the **Shard**, a pickup that must be collected before the star unlocks. It is not an item and it has no effect. It is
  the unbounded endless lever (2.6).
- **Item:** none in this roadmap. HAZ-006 (mystery box, cloak) is **rejected for now**. Items cancel the rising ladder, they need the
  unsigned economy contract, and they add HUD to a 320 px screen. If one ever ships it can never be required by a witness, and a cloak
  means pass-through for 6 ticks, nothing broader.
- **Static blocker: dropped from the menu** (it is still in the `loadout.ts` draft). A blocker is a wall in a different colour. It adds
  no new verb and costs readability, and route changes are the geometry ladder's job.
- Pursuit is never shortest-path. A same-speed shortest-path pursuer cannot be outrun in a maze (MAZER-CHASER-ENGINE.md). Junction-greedy
  pursuit is learnable and can be exploited with decoy stubs, which is the point.
- **Interceptor and wall-follower** stay dormant in `chaserEngine`. They come back only if the hazard-runway measurement (slice H7) shows
  the menu runs dry before geometry saturation.

### 2.3 Contact and penalty (Decision)
- **Contact definition:** HAZARD-GRAPH-CONTRACT as written: occupancy at the arrival tick, plus a head-on swap, also across a wrap.
- **Consequence: rewind, not death.** The player snaps back to the **last junction on their own trail**. The trail retracts in neon over
  about 250 ms, with the clock held. Then the player gets **4 ticks** of invulnerability: the marker blinks at 2 Hz, under the 3-per-second
  flash limit. Runtime safety: from the rewind cell the client runs the A* witness (under 1 ms when solvable, per MAZER-CHASER-ENGINE.md).
  If there is no witness it steps back to the previous trail junction, and finally to the validated start. The validator checks
  post-contact states at N=2, and play uses N=4. More invulnerability is never worse, so a level that passes at 2 also passes at 4.
- **Hunter burnout (mercy cap):** the third contact with the same Hunter in one level burns it out: it fades to grey and is removed.
  Hunters cannot be fully proven fair at runtime cost, so this cap bounds the worst case to 3 rewinds per Hunter. It can only make a level
  easier, so no verdict is invalidated.
- **Gate closing on the player:** the player is ejected one cell back along the trail, with no contact and no invulnerability.
  Placement keeps gates off junctions and away from other gates, so that cell is always a legal floor cell.
- **What a mistake costs:** time and distance only. There are no lives, no level fail, no restart and no progress loss.
- **Why not death, hit budgets or restart-level.** On an endless ladder with no checkpoints, the cost of a mistake has to stay bounded
  relative to the maze. Otherwise difficulty grows faster than the ladder and players churn at the wall. Zac also ruled out level resets.
  A finger covering a 10 px tile at 7 steps per second makes instant death feel unfair.
- **Skill signal:** the clear card adds **"CLEAN"** when a level was cleared with no contact, alongside the clear time. It is local, adds
  no HUD, and the leaderboard is unchanged.

### 2.4 Fairness and readability (Decision)
- Every level passes the existing validators before it is accepted: `validateLevelHazards`, and `chaserValidation` when Hunters are
  present. A witness exists with every hazard active. Post-contact states are solvable. Sentries never sit on chokepoints
  (`rejectChokepointHazards` applies to patrols); gates may, because waiting gets you through.
- **Phone forgiveness:** `escapeSlack.ratio >= 0.9`, and no fragile step in the first 10 witness steps. A level that fails is degraded:
  placement drops units and records why. A level is never shipped unsolvable. An `unknown` verdict counts as a fail.
- **Readability caps** (per board, not per capacity): gates <= 6, Sentries <= 4, Hunters <= 2, enemies <= 5 in total, shards <= the tail
  rule. The draft's linear counts (level 100: 38 blockers, 27 gates, 22 patrols) are **rejected**; they would be unreadable on a phone.
- **Telegraph:** a gate shows its next-tick state, with dashes going solid one tick before it closes. A Sentry shows its whole rail as
  faint dots, plus a chevron for its next cell. A Hunter shows a facing chevron and, at junctions, its chosen exit one tick ahead.
  Everything is always visible: no fog. The board stays fully on screen, as Zac requires.
- **Identity by shape before colour:** gate = magenta fence bars; Sentry = cyan diamond; Hunter = red-orange triangle "eye"; Shard = gold
  hexagon. Contrast of at least 3:1 against the floor. Reduced motion shows the telegraphs as static states. Every glyph is at least 0.7
  tile, which is at least 7 CSS px at the 10 px tile floor. **That size is unproven: riskiest assumption 1.**

### 2.5 Progression: where hazards enter the curve and the gauges (Decision)
- **There are two carriers, and they do not compete.** Geometry, under Zac's felt-plus-density ladder with k=4, carries the **per-level
  strictness** up to saturation. Hazards carry **content and variety**: a sparse schedule of units that only ever adds. Hazards never
  change the geometry (they have their own seeded RNG stream), so the golden geometry hashes are identical with the flag on or off.
- **Intro schedule** (versioned manifest `docs/contracts/mazer-hazard-schedule.v1.json`; this answers PROG-008):

| Level | Unit | First-encounter shape |
|---|---|---|
| 1-9 | none (L1 corridor; loops from 12) | |
| 10 | Pulse Gate | 1 gate, tier 0 (3/4 open, waits at most one tick), nothing else within 2 steps |
| 20 | Sentry | 1 Sentry, route of 3 cells, safe pocket, existing gates kept away from it |
| 35 | Hunter | 1 Hunter, `speedDivisor` 3, den at least 60% of the route from the start, out of sight of the start |
| 60 | Shard | 1 shard; the star is locked until it is collected |
| 36..sat | one unit every 15 levels | the existing convex-price tape (`loadout.ts`) under the caps above, blockers removed |

  The draft's unlocks at 6/11/16 with spacing 5 are **rejected**. That pace spends the whole menu by about level 38 (the loadout doc's
  own ceiling) and stacks hazards onto the steepest part of the geometry ramp (L2-16). With unlocks at 10/20/35/60 the full cast appears
  within the first one or two sessions, where retention is decided. About 26 later units then spread over L36 to about L420, so something
  changes roughly every 15 levels.
- **Gauges** (added to `progression-gauges.ts` in slice H7):
  - `hazardDelay` = witness ticks minus static shortest route;
  - `escapeSlack`;
  - fallible-bot contacts per level, at three tiers: exact, limited horizon, myopic;
  - `cleanRate`.
  - Assert: `hazardDelay` never falls across a unit step for the worst seed against the best, Spearman of at least 0.9 over 25-level
    bands, and geometry strictness unchanged.
- **Existing high-level players** (no reset of levels or leaderboard, per Zac): a local `exposureStage` (0-4) introduces any kind they
  skipped, one per level and in order, using its first-encounter shape. After that they get the full schedule for their level.
  `exposureStage` is part of the hazard digest. A new player's stage always equals the schedule, so their mazes stay a pure function of
  (seed, level). Guard test, from the 2026-08-23 "1 to 99" incident: a migrated, impossible or clamped save can never produce a hazard
  before its stage allows.

### 2.6 Endless past geometry saturation (answers PROG-005 and PROG-019; Decision)
- **Fact:** a board of bounded size that stays fully on screen cannot keep a strictly rising difficulty forever using hazards alone. The
  menu is finite: the loadout doc shows ceilings of 35-38 at capacity 21-24.
- **Decision: Shards are the forever axis.** From geometry saturation on (about L420 at scale 40), the strict per-level component is the
  **shard route target**: the witness ticks of the route start -> shard 1 -> ... -> shard k -> star.
  - The route target rises by at least one tick per level, enforced by the same reject-and-try-next-base loop as the felt window.
  - k grows by one every 50 levels.
  - The solver state gains the next-shard index, which costs a small multiple of the state space.
- Shards keep "the board always on screen" and need no camera. A route that revisits corridors exceeds the 2F-R felt limit on a fixed
  board, which is exactly the limit the gauges doc hit.
- **Estimate:** a maze at L2000 holds about 32 shards and takes about 4-5 minutes. That pushes Zac's camera-or-plateau decision about
  1,500 levels later instead of forcing it now.
- **Why the alternatives lose.** The camera ends "whole board visible", and Zac is undecided on it. A plateau breaks "harder forever".
  Speeding up hazards turns the game into a reflex game on a 10 px phone.

### 2.7 Menu AI runner (Decision)
- The demo replays the level's **stored witness**. For Hunters that is the joint witness, which is valid against their deterministic
  response, so the demo plays perfectly and never contacts. That keeps "the demo never contradicts the rules" true by construction.
- The demo shows only the hazard kinds the local player has met. New players see a clean demo, and intro cards stay a surprise.
- The demo walker's AI-skill ramp keeps its bounded inputs (draft §11), and the demo's progression track (`ai-runner`) keeps its own
  stage.

### 2.8 Minimal hooks (Decision)
- **Audio (AUDIO-002 / 003):** hazards emit events on the existing bus: `hazard.gate.closing`, `hazard.contact`, `hazard.burnout`,
  `hazard.intro` and `shard.collected`. Sound effects stay behind AUDIO-003 (default off). Music stays held.
- **Economy (ECON-001..003, AI-002):** nothing. Shards are not currency and contacts cost no coins. The witness is the future hint
  source if AI-002 is ever built.
- **Challenge (CHAL-001):** hazards are a pure function of (seed, level, schedule version, stage), so shared-seed challenges later
  become client-only. No build now.
- **Controls (CTRL-003):** no rework. Keep drag-anywhere with corridor-following and queued turns, plus two measured requirements:
  release-to-stop within 1 tick, and a queued turn taken at the next junction. A queued-turn chevron is added only if the phone check
  shows missed turns.
  - A d-pad loses: it covers the board.
  - Swipe-to-run loses: it cannot stop precisely at a gate.
  - Tap-to-path loses: it removes the skill.
- **Milestones (PROG-007):** an intro card (skippable, one line, HAZ-008) for each new kind, and a small "tier" pip whenever a unit lands.
  No chime until AUDIO-003.
- **Run and data (RUN-003/004, DATA-002/003):** no server change and no cap change. Contact counts are recorded in the receipt for a
  future quality gate.
- **Perf (PERF-004/005):** stay held. Trail rewind must work with whatever trail implementation is live.
- **CYBERDECK-001:** stays as evidence. Its budget of 3 enemies and 4 items is superseded by 2 enemies + 1 obstacle + 1 objective + 0 items.

## 3. Build roadmap (PR-sized slices, in order)

Every slice:
- one worktree off `origin/main`;
- `npm test`, the repo Playbook verify, and an independent `reviewer` PASS before merge for anything that changes play;
- the in-app guide updated whenever a player-visible rule lands (guide-sync rule);
- the board event appended.

Flag: the dormant literal `LEGACY_HAZARD_LAYER_ENABLED = false` becomes `resolveHazardLayerEnabled()`, which reads a build constant
(default **false**) plus a lab switch `?lab=hazards` stored in localStorage. The lab switch shows a "LAB" chip and works on preview and
production, so Zac can test on the installed app. Lab play submits progress normally (hazards only make levels harder). The lab level
jump `&level=N` **never submits**.

| # | Slice | Changes play? | Tests and measurements | Perf budget | Receipt / leaderboard |
|---|---|---|---|---|---|
| H0 | Sign the contract into the repo: this doc plus the amended tick rule, eject rule, N=4 and blocker removal in HAZARD-GRAPH-CONTRACT; schedule manifest v1; HAZ-002 -> completed on signature | no (docs) | decision-registry check; manifest schema test | none | none |
| H1 | World clock and flag plumbing, no hazards | no (flag off; on = empty schedule) | fake-timer clock tests (first-input start, pause/blur with no catch-up); geometry hash corpus identical with flag on and off; release-to-stop at most 1 tick (Playwright input trace) | clock under 0.05 ms per frame | none |
| H2 | Generation overlay: allocator on manifest v1 + caps, `placement.ts` with blockers removed, validators + `escapeSlack` gate, verdict and witness stored in diagnostics; nothing rendered | no | levels 1-1000 x 20 seeds x 3 aspects all pass or degrade with a reason; no hazard before L10; exposure guard test; deterministic digests | **placement + verdict at most 25 ms median / 80 ms worst (node 1x)**; total build 4x at most 400 ms worst (existing budget), or run inside the goal-deconstruct precompute window (PERF-008/009) before H3 | none |
| H3 | Pulse Gate playable (flag): gate layer on its own canvas, arrival-tick legality, eject, telegraph, intro card, demo replays the witness | yes, flag OFF | headless replay of the stored witness through the real MenuScene input path reaches the goal; gate legality and eject unit tests; reduced-motion snapshot; phone screenshots (DPR 3, standalone) | hazard update under 0.3 ms/frame, draw under 1 ms/frame, no allocation per frame | `hazardScheduleVersion`, `hazardDigest`, `exposureStage` in receipt jsonb (client-only) |
| H4 | Contact system + Sentry: collision phase, trail rewind, runtime A* rewind check, invulnerability 4, CLEAN mark | yes, flag OFF | contact incl. swap across a wrap; property test: rewind never strands (10k random contacts); trail rewind renders; demo never contacts | rewind check under 2 ms worst; at most 4 Sentries under the H3 frame budget | + `contacts` |
| H5 | Hunter: `chaserEngine` live, den, divisor 3->2 tiers, burnout after 3, joint-witness demo | yes, flag OFF | replay determinism from input logs; burnout bound; fallible-bot clear-time and contact distributions at L35/60/150/300 | joint verdict under 40 ms median (state cap 200k, `unknown` = degrade) | + `burnouts` |
| H6 | Onboarding and moments: `exposureStage`, HAZ-008 intro cards, PROG-007 tier pips, guide pages, audio events | yes, flag OFF | stage migration tests incl. impossible saves; guide snapshot | card under 1 frame to show | stage already recorded |
| H7 | Hazard gauges + runway: `hazardDelay`/`escapeSlack`/bot-contact gauges in `progression-gauges.ts`, CI analysis job, measured ceiling of the hazard menu | no (scripts) | the band assertions in 2.5; runway report | n/a | none |
| H8 | Shards: objective cell, locked star, solver state + next-shard index, tail route target from saturation | yes, flag OFF | shard witness tests; strict per-level route-target assert from saturation to L2000 | verdict at most 2x the H5 budget | + `shards` |
| H9 | **Flip the build default to ON** after Zac's phone sign-off. One-line PR; rollback = revert plus one deploy | yes | full suite, gauges, timing | as above | as above |

Order rationale:
- Gates first: there is no contact system yet, so they are the lowest risk.
- Sentry with contact: deterministic and provable.
- Hunter after that: it depends on the player and is bounded by burnout.
- Shards last: they are only needed once geometry runs out.
- H1 and H2 are invisible and prove determinism and perf before any pixel.
- Card mapping: H3 -> HAZ-004; H4/H5 -> HAZ-005; H6 -> HAZ-008, PROG-007; H2/manifest -> PROG-008; H8 -> PROG-005/019; H0 -> HAZ-002/003.

## 4. Zac's phone check (installed app, `?lab=hazards`, one sitting, after H5; gates alone after H3)
1. **L10 gate** (lab jump): can you read the fence and the "closing" telegraph at your tile size, and does a bump read as "wait", not as a bug?
2. **L20 Sentry contact** on purpose: does the trail rewind feel fair and readable? Is the 4-tick blink long enough to get clear?
3. **L35 Hunter:** at speed 1/3, does escaping feel like play and not panic? Let it hit you 3 times and confirm the burnout reads.
4. **L300 combined** (5 enemies + 6 gates) on your phone: is everything readable with a thumb on the glass? Any hitch at level change?
5. **Pause mid-level** (home button, lock screen, return): the world must wait for your first touch, with no catch-up.
6. **Menu demo:** hazards move correctly and the runner never gets hit.
7. **Decisions (a) sign this contract, (b) unlocks at 10/20/35/60, (c) rewind as the only penalty, (d) shards as the forever axis: answered YES in chat on 2026-11-15 (signature record above).** The phone check still owes the readability and fairness judgments in steps 1-6, and the H9 flag flip waits on them.

## 5. Riskiest assumptions
1. **7-10 px glyphs and real-time contact are readable and fair on a 320-430 px phone at about 7 steps per second.** If not, the
   real-time choice (2.1) or the caps move. The H3/H4 phone check gates H5. Fallback: Hunters at divisor 4 and larger glyphs that are
   allowed to overflow the tile.
2. **Hazard placement and validation fit the generation budget.** Fact: placement measured a 46-53 ms median and a 198 ms maximum in
   node at 1x on a 51x25 board, against a 400 ms worst case at 4x for the whole build that is already 246-373 ms. H2 will likely need the
   precompute or worker path (PERF-008/009) first. If neither fits, the hazard levels hitch.
3. **Hazard units and shards read as "harder", not as "longer".** Every difficulty claim comes from modelled walkers and bots, and no
   player has been tested (gauges doc, research doc §6). The shard tail especially could feel like a chore. H7 gauges plus Zac's felt
   check at L60 and L420 decide whether shards stay or the camera decision comes forward.

## Not verified
- That release stops the marker within one tick. It is inferred from the intent resolver, and H1 measures it.
- That the receipt RPC keeps unknown jsonb keys. The research doc says client-only; it was not re-read here.
- The saturation level at scale 40 (about 420) and every runway number marked **Estimate**.
