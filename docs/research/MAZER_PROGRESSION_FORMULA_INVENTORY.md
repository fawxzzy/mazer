# Mazer Progression Formula And Field Inventory

Last verified: 2026-11-05 against base commit `1670c8af` (`origin/main`).

Status: read-only inventory. It documents what the code and migrations do today. It changes no threshold, weight, field, label or migration, and it proposes none. Board card: `mazer-ai-level-rank-progression` ("Publish the current formula and field inventory before changing thresholds").

Conventions:

- `file:line` references were re-read against the base commit above. Line numbers drift; search by the quoted symbol if a line no longer matches.
- **UNKNOWN** means the repository does not prove the answer. It is never a guess.
- **Server-owned** means a Supabase RPC body in `supabase/migrations/` computes or writes the value. **Client-only** means only browser code computes it and no RPC reads it. "Source-proven" is not "applied": which migrations are applied to the production database is mostly UNKNOWN from this repository (see Open questions).
- The outcome fixtures that pin the behaviour described here live in `tests/reset/legacy-progression-outcomes.test.ts` and `scripts/analysis/lib/progressionOutcomeFixtures.ts`. The offline comparison is `npm run progression:compare` (`scripts/analysis/progression-formula-compare.ts`).

## Headline facts

1. **The run outcome does not move `targetComplexity`.** Every accepted completion adds the flat `LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP = 4` (`src/legacy-runtime/legacyProgression.ts:33`, applied at `:1406-1416`) on both the client and the server. Score, signal, route overrun, resets and wrong turns never change the step. There is therefore no punitive regression today and also no hysteresis, because nothing pushes the target down.
2. **Rank, level band and generation pressure all derive from `targetComplexity`**, which after `n` completions from the baseline is `min(400, 8 + 4n)`.
3. **The player track forces `challenge` for every completion** (`legacyProgression.ts:1391-1396`). The run-quality score and its player signal are still computed and stored as `paceScore`, but they cannot alter the signal the player track records.
4. **The AI track records the scorer's own signal** (`legacyProgression.ts:1397`), but that signal only feeds counters and the six-entry window, not the target.
5. **The run-quality score does have one live effect on gameplay:** the player's `paceScore` feeds `resolveLegacyMovementSpeedProfile` (`src/legacy-runtime/legacyMovementSpeed.ts:14-15`, `:86-93`), shifting effective movement speed by up to `+-0.05 * ((paceScore-50)/50)` of the preference envelope. Changing scorer weights changes player movement feel.
6. **Menu generation and menu-AI skill read the player track, not the ai-runner track** (`src/scenes/MenuScene.ts:6398-6405`, `:17795-17842`). This contradicts the wording in `docs/current-truth.md` (see Discrepancies).
7. **Rank thresholds live in exactly two production copies:** one TypeScript function and the server completion RPC bodies (plus repair migrations). No other source file duplicates them.

## 1. Pipeline overview

```text
completed maze -> createMazeCycleTelemetryReceipt (mazeCycleTelemetry.ts:490-602)
  -> measured maze complexity   resolveLegacyMazeComplexity        (legacyProgression.ts:1236)
  -> run-quality score+signal   scoreMazeCycleRunQuality           (mazeCycleRunQualityScorer.mjs:183)
  -> track signal               resolveProgressionSignal           (legacyProgression.ts:1387)
  -> applyTrackSignal           flat +4 target, +1 level, +1 cycles (legacyProgression.ts:1418)
  -> rank / color tier / level  derived from targetComplexity
  -> next maze request          scale, profile, candidate selection, seed salt (MenuScene.ts)
  -> remote outbox -> RPC       mazer_complete_level / mazer_complete_ai_level (flat +4 again)
```

Entry points: `recordLegacyProgressionCycle` (`legacyProgression.ts:1504`), called once per completion from `MenuScene.ts:17908`. Idempotency: a repeated `receipt.id` returns the state unchanged (`legacyProgression.ts:1512-1514`).

## 2. Formula inventory

### 2.1 Measured maze complexity ("maze rating")

`resolveLegacyMazeComplexity` (`legacyProgression.ts:1236-1311`) is a sum clamped to `[8, 400]`. Client-only. Terms and weights:

| Term | Formula | Line |
| --- | --- | --- |
| `sizeScore` | `linearSize * 0.52`, `linearSize = (width+height)/2` | 1244 |
| `solutionScore` | `solutionPath.length * 0.24` | 1245 |
| `floorScore` | `floorRatio * 16` | 1246 |
| `routeScore` | `multi-route 8 / else 2`, `+4 per meaningfulBypassableRouteBands`, `+2.2 per meaningfulBypassableSolutionEdges`, `+0.6 * minimumMeaningfulDetour`; `2` when no route stats | 1247-1254 |
| `shortcutScore` | `shortcutsCreated * 1.8` | 1255 |
| `checkpointScore` | `acceptedCheckpoints * 0.08` | 1256 |
| `edgeWrapScore` | `min(16, wrapCount * 2.4)` | 1257 |
| `edgeWrapChoiceScore` | `min(10, choicePressure * 0.65)` | 1258 |
| `edgeWrapShortcutReliefScore` (subtracted) | `min(12, max(0, (linearSize*0.72 - solutionLen) * wrapCount * 0.22))` | 1259-1262 |
| `splitScore` | `min(20, splitCount * 0.78)` | 1263 |
| `deadEndPressureScore` | `min(18, deadEndCount * 0.72)` | 1264 |
| `weightedSplitPressureScore` | `min(12, weightedSplit * 0.18)` | 1265 |
| `weightedDeadEndPressureScore` | `min(10, weightedDeadEnd * 0.16)` | 1266 |
| `fillQualityScore` | `clamp(min(1, floorRatio/0.38)*10 - min(6, isolatedGaps*0.4), 0, 10)` | 1267-1270 |

Topology inputs: `resolveLegacyProgressionTopologyMetrics` (`:483-537`), `resolveLegacyProgressionWrappedContinuityMetrics` (`:417-454`). The measured value never feeds the target step. It feeds (a) `peakComplexity` (`:1447`), (b) the expected-time term of the pace score, (c) generation-delivery review (`summarizeLegacyProgressionDiagnostics`, `:1708-1750`, tolerance 8), and (d) the pacing summary's `measuredMazeLevel/Rank` (`:1490-1492`).

### 2.2 Expected completion time and pace score

`resolveMazeCycleExpectedCompletionMs` (`mazeCycleRunQualityScorer.mjs:75-80`): `round(max(max(8000, pathLen*440), max(10000, complexity*360)) * (menu-demo ? 1.18 : 1))`. `scoreMazeCyclePace` (`:82-90`): ratio `time/expected`; `<=0.68 -> 100`, `>=1.7 -> 0`, linear between. Client-only. Note for small mazes the complexity floor dominates (the 13-tile fixture maze, complexity 59, expects 21,240 ms for a player).

### 2.3 Run-quality score (`paceScore`) and base signal

`scoreBaseRunQuality` (`mazeCycleRunQualityScorer.mjs:92-181`), scorer id `mazer.maze-cycle-run-quality`, version `1.1.0` (`:3-4`). Client-only.

| Term | Formula | Line |
| --- | --- | --- |
| `routeEfficiencyPressureScore` | `clamp(waste/1.5*100)`, `waste = max(0, pathLen - shortest)/shortest` | 61-66 |
| `routeEfficiencyScore` | `100 - pressure` | 109 |
| `wrongTurnScore` | `100 - 16*wrongTurns` | 110 |
| `backtrackScore` | `100 - 14*backtracks` | 111 |
| `resetScore` | `resetUsed ? 0 : 100` | 112 |
| `renderSafetyPenaltyScore` | `0` if frame <= 18 ms, else `((ms-18)/18)*100` | 68-73 |
| `stabilityScore` | `100 - max(renderPenalty, frame >= 24ms ? 75 : 0)` | 113-115 |
| weighted total (non-AI) | `0.38 time + 0.22 route + 0.14 wrong + 0.12 backtrack + 0.08 reset + 0.06 stability` | 116-123 |
| caps | `timeStruggleCap 28` (time<=5 and (wrong>=2 or backtrack>=2)); `resetStruggleCap 36`; `unsafeRenderCap 62` (menu-demo only, stability<=25) | 124-130 |

Player base signal (`:133-145`): `ease` if reset or `routeEfficiencyPressureScore >= 75` (`MAZE_CYCLE_RUN_QUALITY_PLAYER_EXTREME_DETOUR_PRESSURE_THRESHOLD`, `:31`); else `challenge` if total `>= 70` (`:30`); else `hold`. Wrong turns and backtracks only act through the weighted total.

### 2.4 AI decision pressure and AI blend

`scoreMazeCycleAiDecisionSummary` (`mazeCycleAiScorer.mjs:15-52`), scorer id `mazer.maze-cycle-ai-decision-pressure` version `1.0.0` (`:1-2`):

- `routeNoise = (wrongBranch + 1.5*retarget + 4*visitedUndo) / decisions * 100`
- `recoveryPressure = (0.75*backtrack + 2.25*recovery) / decisions * 100`
- `retargetPressure = retarget / decisions * 100`
- `pressure = 0.45*routeNoise + 0.45*recoveryPressure + 0.1*retargetPressure`; `reliability = 100 - pressure`
- signal: `chaotic >= 60`, `searching >= 25`, else `clean`

AI blend (`mazeCycleRunQualityScorer.mjs:193-254`, only when `surface = menu-demo` and a decision summary exists): `routeEfficiencyScore = 0.86*base + 0.14*reliability`; `backtrackScore`/`wrongTurnScore` use `recoveryPressure*0.48`/`routeNoise*0.52` plus `routeEfficiencyPressure*0.22/0.24` minus `18` on reset; weighted total `0.22 time + 0.32 route + 0.16 wrong + 0.14 backtrack + 0.06 reset + 0.05 stability + 0.05 reliability`. Caps: chaotic -> 34, reset -> 38 (or 56 for "searching exhaustion"), overrun ratio `>= 4.5` -> 45, stability<=25 -> 62. AI signal: `hold` on unsafe frames; `ease` if chaotic, or total `<= 34`, or overrun `>= 4.5` (neither when searching-exhaustion); `challenge` if total `>= 58`, not exhaustion, pressure `< 60`, overrun `<= 2.5`; else `hold`. Thresholds: `mazeCycleRunQualityScorer.mjs:9-12`, `:24-25`. Re-exported as `LEGACY_PROGRESSION_AI_CHALLENGE_SCORE_THRESHOLD`/`..._EASE_...` (`legacyProgression.ts:36-37`).

Observed consequence (pinned by the fixtures): the same "average" run is `hold` for the player scorer (total 61 < 70) but `challenge` for the AI scorer (total 73 >= 58). The two scorers are not calibrated against each other.

### 2.5 Track signal and target update

- Signal: player always `challenge`; AI the scorer signal (`legacyProgression.ts:1387-1399`).
- Step: `resolveLegacyProgressionTargetAdjustment` returns the constant 4 (`:1406-1408`); `resolveLegacyProgressionPacedTarget` clamps `target + 4` to `[8, 400]` (`:1410-1416`). The pacing summary reports `challengeStep`, `easeStep`, `nextChallengeTargetComplexity` and `nextEaseTargetComplexity` all equal (`:1480-1494`).
- Per-completion state change (`applyTrackSignal`, `:1418-1453`): `level` and `completedCycles` `+1` (exact `bigint`, `:342-346`); `cleanCycles +1` on `challenge`; `struggleCycles +1` on `ease`; `recentSignals` prepends and truncates to 6 (`:990-996`, limit `:34`); `paceScore` = run-quality total; `peakComplexity = max(prev, measured, newTarget)`; `bestCompletionTimeMs`, `lastCompletionTimeMs`, `lastMazeSeed`, `lastReceiptId`, `lastCompletedAt`.
- Skill trend (diagnostics only, `:1468-1474`): `rising` if challenge count > ease count in the window, `falling` if fewer, `mixed` if equal with a non-empty window, else `steady`.

### 2.6 Rank, level, band, color tier (all derived from `targetComplexity`)

| Quantity | Formula | Client | Server |
| --- | --- | --- | --- |
| rank | `E <28, D >=28, C >=46, B >=70, A >=96, S >=125` | `legacyProgression.ts:539-556` | `20260828153000_mazer_maze_seed_unsigned32_widen.sql:221-228` (player), `:474-481` (AI) |
| bounded difficulty level | `clamp(floor((target-8)/4)+1, 1, 99)` | `:558-560` | not computed in the completion RPCs; the repair migrations mirror it as `clamp(8+(min(level,99)-1)*4, 8, 400)` (`20260828140000_mazer_progression_target_complexity_closure.sql:65-66`, `20260828140100_mazer_ai_progression_target_complexity_closure.sql:43`) |
| color tier | `clamp(floor((level-1)/5), 0, 5)` with `level` from target | `:915-921` | `...unsigned32_widen.sql:229-232` (`((target-8)/4)/5`, integer division, clamped 0..5) |
| difficulty step | `clamp(floor(difficultyLevel/2)+1, 1, 99)` | `:574-581` | none (client generation only) |
| displayed `level` | completion ordinal, `+1` per completion, unbounded | `:1445`, `:342-346` | `...unsigned32_widen.sql:215`, `:468` |

`peakComplexity`, `recentSignals`, `paceScore`, `cleanCycles`, `struggleCycles` never enter any of these.

### 2.7 Generation inputs (what `targetComplexity` and the track choose)

Client-only. All read the **player** track for both play and menu (`MenuScene.ts:17795-17842`).

| Input | Source | Line |
| --- | --- | --- |
| requested target complexity | `resolveLegacyTargetComplexityForMode` returns `tracks.player.targetComplexity` | `MenuScene.ts:17839-17842` |
| difficulty band and profile (`tutorial/starter/explorer/navigator/architect/mythic`, `targetScale`, pressure labels) | `resolveLegacyProgressionDifficultyProfile` | `legacyProgression.ts:583-681` |
| generator profile (checkpoint count/override, dead-end cap, straightness, shortcut and reinforcement multipliers, required wraps, border feeders) | `resolveLegacyMazeGenerationBaseProfileForProgression`, device-scaled feeders in `resolveLegacyMazeGenerationProfileForProgression` | `legacyProgression.ts:689-913`; consumed at `MenuScene.ts:17824-17835` |
| board scale | `resolveLegacyProgressionScaleDetail` (blend `0.28*baseScale + 0.72*progressionScale`, viewport cap) | `legacyProgression.ts:1597-1628`, `:1636-1706`; consumed at `MenuScene.ts:17807` |
| candidate selection (closest measured complexity to target, tolerance, retry ladder) | `legacyGenerationLifecycle.ts:575-690`, default candidate count by target `>=72 -> 5`, `>=112 -> 7`, `>=144 -> 9` | `legacyGenerationLifecycle.ts:473-482` |
| fresh seed salt | `target*1009 + completedCyclesSeed*9176 + levelSeed*313 + paceScore*37` (play); `*1151/*7219/*433/*41` (menu) | `MenuScene.ts:6510-6523`, `:6540-6553` |
| menu-AI perception | `aiSkillLevel = bounded level(player target)`, `aiSkillRank = player rank` | `MenuScene.ts:6398-6405` |
| player movement timing | `paceScore`, bounded level, `completedCycles` | `MenuScene.ts:5892-5899`; `legacyMovementSpeed.ts:66-110` |
| endless recipe (levels >= 100) | `endless-v1` recipe cycle; source-proven, documented as non-load-bearing | `legacyEndlessProgression.ts:19-36`, `:196` |

The starter-band geometry ladder (levels 2 to 30) is being edited by a separate lane; treat rows touching `resolveLegacyMazeGenerationBaseProfileForProgression` as subject to change.

### 2.8 Other signal copies (telemetry, not progression)

`resolveLearningSignal` (`mazeCycleTelemetry.ts:680-715`) computes a **third** `challenge/ease/hold` over a window of receipts (needs >= 3; `ease` on reset rate `>= 0.4`, avg wrong turns or backtracks `>= 6`, avg route-efficiency pressure `>= 45`, or avg render penalty `>= 34`; `challenge` on reset rate `<= 0.1`, wrongs/backtracks `<= 1`, avg time `<= 20,000 ms`). It feeds telemetry reports and the Atlas consumer receipt (`summarizeMazeCycleTelemetryLearning`, `:717-786`). It does not feed `recordLegacyProgressionCycle`. Run-quality topology metrics (`mazeCycleRunQualityTopology`, metrics version `1.0.0`, `mazeCycleRunQualityScorer.mjs:6`) are telemetry-only today.

## 3. Field inventory

`LegacyProgressionTrack` (`legacyProgression.ts:58-75`), persisted as `LegacyProgressionState` (`:77-83`) under local key `mazer.progression.v1` (`:17`). Two tracks: `player` and `ai-runner`.

| Field | Kind | Written by | Server-owned? |
| --- | --- | --- | --- |
| `targetComplexity` | stored, bounded 8..400 | `applyTrackSignal`; RPC | **Yes** (`+4`, clamp 400) |
| `level` | stored completion ordinal (string) | `applyTrackSignal`; RPC | **Yes** (`+1`) |
| `completedCycles` | stored ordinal (string) | `applyTrackSignal`; RPC | **Yes** (`+1`) |
| `rank` | stored but derived from `targetComplexity` | `normalizeTrack` re-derives (`:1039`) | **Yes** (RPC `v_next_rank`) |
| `colorTier` | stored but derived | `normalizeTrack` re-derives (`:1022`) | **Yes** (RPC `v_next_color_tier`) |
| `lastReceiptId` | stored | `applyTrackSignal`; RPC (`p_receipt->>'id'`) | **Yes** |
| `lastCompletedAt` | stored | `applyTrackSignal`; RPC (`clock_timestamp()`) | **Yes** |
| `paceScore` | stored diagnostic, 0..100 | `applyTrackSignal` | No (client-only); affects player movement speed |
| `lastSignal` | stored diagnostic | `applyTrackSignal` | No |
| `recentSignals` (max 6) | stored diagnostic | `appendLegacyProgressionSignal` | No |
| `cleanCycles` | stored counter | `applyTrackSignal` | No |
| `struggleCycles` | stored counter; player uses `MAX_SAFE_INTEGER` as a baseline-provenance sentinel (`:29`, `:945-948`) | `applyTrackSignal` | No |
| `peakComplexity` | stored | `applyTrackSignal` | No |
| `bestCompletionTimeMs`, `lastCompletionTimeMs` | stored | `applyTrackSignal` | No |
| `lastMazeSeed` | stored | `applyTrackSignal` | No (seed is validated and stored in the receipt row) |

Derived on read (never stored): the pacing summary (`LegacyProgressionPacingSummary`, `:148-169`: `levelProgressPercent`, `complexityUntilNextLevel`, `nextLevelTargetComplexity`, `measuredMazeLevel`, `measuredMazeRank`, `skillTrend`, `recentChallengeCount`, `recentEaseCount`), the difficulty profile, the generation review (`:203-210`, delivery `under/on/over-target`, tolerance 8), and the palette/label (`resolveLegacyProgressionPalette`, `:1553-1568`, label `"<Player|AI> Skill Lv NN Rank X Runs N"`).

Telemetry-only fields (per receipt, `MazeCycleTelemetryReceipt`, `mazeCycleTelemetry.ts:74-102`; history key `mazer.cycle-telemetry.v1`, limit 50, `:34-35`): `runQualityScore`, `runQualityMetrics`, `routeOverrun*`, `renderSafetyPenaltyScore`, `routeEfficiencyPressureScore`, `aiDecisionSummary`, `wrongTurns`, `backtracks`, `mazeComplexity` breakdown, `playerPath` (capped 256).

**There is no stored field called rating or hidden rating** (searched `src/` for `rating`: no matches). The nearest equivalents are `paceScore`, `cleanCycles`, `struggleCycles`, `peakComplexity` and `recentSignals`. The "measured maze rating" in the card is `mazeComplexity.total`.

Normalization guards that affect formulas: player tracks lacking the v5 provenance sentinel, or with `targetComplexity` above `8 + 4*completedCycles` (`resolveLegacyPlayerMaxTargetComplexityForCompletedCycles`, `:1071-1088`) or an impossible ordinal, are rebased to Level 1 for local saves (`:1104-1148`). Authoritative remote rows are only clamped (`:1129-1147`).

## 4. Server-owned versus client-only

Source: `supabase/migrations/20260828153000_mazer_maze_seed_unsigned32_widen.sql`, which drops and recreates `mazer.mazer_complete_level` (`:77-337`) and `mazer.mazer_complete_ai_level` (`:349-...`). Earlier definitions (`20260822000100_mazer_endless_completion_rpc.sql:104`, `:375`; `20260824170159_mazer_master_runtime_contracts.sql:122`, `:393`) are superseded by it.

Server-owned (RPC body):

- `target = least(400, greatest(8, current + 4))`, `:217-220` (player) and `:470-473` (AI).
- `rank` by the 125/96/70/46/28 case, `:221-228` and `:474-481`; `colorTier`, `:229-232` and `:482-485`.
- `level + 1`, `completedCycles + 1`, sequential-only (`completed_level` must equal the current level, `:210-213`), idempotent per `client_run_id` (`:181-200`, `:257-276`), revision-guarded (`:202-205`).
- JSON mirror in `state.tracks.player` / the AI row: `colorTier`, `completedCycles`, `lastCompletedAt`, `lastReceiptId`, `level`, `rank`, `targetComplexity` (`:290-298`, `:541-553`). Table checks: `target_complexity between 8 and 400` (`20260824170156_mazer_master_schema_parity.sql:93`, `:109`), rank in `E..S` (`20260709011209_mazer_account_storage_contracts.sql:3`, `:37`).
- Leaderboard order: `player_level desc, level_reached_at asc, user_id asc` (`20260822000200_mazer_leaderboard_rpc.sql:49`, `:99`; `mazer` copy in `20260824170159_...:816`). This "rank" is a position in that ordering, **not** the E to S rank.

What the server reads from the client: `p_completed_level`, `p_maze_seed` (0..4294967295), `p_maze_size`, `p_client_run_id`, ruleset/recipe fields, `p_completed_at` (bounded to a 90-day window, stored only as `clientCompletedAt`), and `p_receipt` (JSON object, <= 8192 bytes). The RPC reads exactly one key from the receipt body, `p_receipt->>'id'` (`:294`, `:541`, `:550`). The rest of the receipt, including `runQualityScore` and signals, is stored in `mazer_cycle_receipts.receipt` and **no server formula reads it**. Pinned by `legacy-progression-outcomes.test.ts`.

Client-only: everything in section 2 except the `+4`, the clamp, the rank thresholds, the color tier and the ordinal increments, plus all the diagnostic fields in section 3. Direct client writes to the progression tables are revoked (`20260824170159_...:771-772`, `:904-905`); the client's `writeLegacyRemoteProgressionState` in `advance` mode returns a retired-path error (`legacyRemoteProgression.ts:1838-1848`), and completions go through the outbox and RPC (`:1232-1246`, `:1761-1819`).

Not server-owned but merged client-side: when local and remote states meet, `mergeLegacyProgressionStateAdvancements` takes the max of `cleanCycles`, `completedCycles`, `level`, `peakComplexity`, `struggleCycles`, `targetComplexity` and the min of `bestCompletionTimeMs`, with the remaining fields from the more recent track (`legacyRemoteProgression.ts:272-324`).

## 5. Where the rank thresholds live

Production sources of truth (all must agree):

1. Client: `resolveLegacyProgressionRank`, `src/legacy-runtime/legacyProgression.ts:539-556`.
2. Server: the `v_next_rank := case` blocks in the completion RPCs. Latest: `20260828153000_mazer_maze_seed_unsigned32_widen.sql:221-228` and `:474-481`.

Historical or secondary copies (not independently authoritative):

- Superseded RPC bodies: `20260822000100_mazer_endless_completion_rpc.sql:245-250`, `:500-505`; `20260824170159_mazer_master_runtime_contracts.sql:264-268`, `:519-523`.
- One-off repair statement: `20260828154500_mazer_progression_rank_closure.sql:38-42`, `:48-52`, `:102-106`, `:118-122` (player rows only; it recomputes `player_rank` from `player_target_complexity`).
- Documentation: `docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md` ("Current Implemented Truth", rank list).
- Tests: `tests/reset/legacy-endless-progression.test.ts:63` asserts the SQL text contains the `S` threshold; `tests/reset/legacy-progression-outcomes.test.ts` parses both latest RPC case blocks and compares every integer target 8..400 against `resolveLegacyProgressionRank`, so drift between the two copies now fails a test.

There is no shared constant: the TypeScript and the SQL are hand-synchronized.

## 6. Terminology as the code uses it today

| Word | Current meaning in code | Notes |
| --- | --- | --- |
| score / `paceScore` | 0..100 run-quality total of the last completion | Diagnostic; player value also scales movement speed |
| signal | `challenge` / `ease` / `hold` | Player track always `challenge`; AI track uses the scorer signal |
| hidden rating | no such field | UNKNOWN whether the card means `paceScore`, the counters, or a future field |
| target complexity | bounded 8..400 difficulty request; the only numeric input to rank, band and generation | Server-owned `+4` |
| level (displayed) | completion ordinal, unbounded, exact `bigint` string | `+1` per completion |
| level (bounded difficulty) | `floor((target-8)/4)+1` capped at 99 | Used for band selection, color tier and AI skill level |
| band | difficulty profile name by bounded difficulty step | `levelRange` in the profile is about the step, not the displayed level |
| rank | `E..S` from target complexity | Different from the leaderboard position, which is also called `rank` in the RPC output |
| measured maze rating / complexity | `resolveLegacyMazeComplexity(maze).total` | Compared against target only in the generation review |
| difficulty | informal; the profile plus the target | |

## 7. Discrepancies and open questions

Discrepancies found while verifying (documented, not fixed):

- `docs/current-truth.md` (line 151 and the HUD paragraph) says the menu AI binds to the independent `ai-runner` track. `MenuScene.ts:6398-6405` and `:17795-17842` bind menu generation and AI skill to the **player** track, with source comments saying so deliberately. Which is intended is UNKNOWN; the code is what runs.
- `docs/research/MAZER_LEVEL_RANK_COMPLEXITY_CONTRACT.md` "Current Implemented Truth" still describes signal-dependent step sizes (`challenge` up to +3, `ease` -1/-2, consistency bonuses, pre-supersession bullets) and an AI pressure formula with `wrongBranch*3` and per-decision denominators. The superseding section and the code use the flat `+4` and the scorer in `mazeCycleAiScorer.mjs:26-40` (`wrongBranch*1`, scaled by 100, backtrack `0.75`, recovery `2.25`). Treat the code as authoritative.
- The AI "average" run is `challenge` while the identical player run is `hold` (scorer asymmetry, section 2.4).
- Three signal derivations exist (player scorer, AI scorer, telemetry learning signal) with different thresholds.
- Abandoned or failed attempts produce no receipt and never reach progression; a "failed" fixture here is a completed maze with a reset and extreme waste. How Endless failed attempts should be scored is not defined in code.

UNKNOWN (not provable from this repository):

- Which of the `20260822*`, `20260824*`, `20260827*`, `20260828*` migrations are applied to the production database. Only `20260828140000` and `20260828140100` carry an in-file "APPLIED to production" statement; the rank closure, seed widen and `mazer`-schema runtime contracts do not.
- Whether the live client talks to the `mazer` schema functions or the older `public` ones.
- The historical distribution of real player and AI receipts, so every weight (`0.38/0.22/...`, the 0.68/1.7 pace ratios, the 70/58/34 thresholds) is uncalibrated against purpose-approved cohorts. The comparison script runs on synthetic fixtures only and says nothing about real-player outcomes.
- The effect of `remote progression` being enabled (`VITE_MAZER_REMOTE_PROGRESSION`) per deployed environment.

## 8. Reproduce

```text
npx vitest run tests/reset/legacy-progression-outcomes.test.ts
npm run progression:compare            # text tables
npm run progression:compare -- --json  # machine-readable
```

Candidates in the script are local models (a flat `+2` step; challenge `+4` / hold `+2` / ease `+1` with no regression). They are not wired into the game, change no live threshold, and make no server call.
