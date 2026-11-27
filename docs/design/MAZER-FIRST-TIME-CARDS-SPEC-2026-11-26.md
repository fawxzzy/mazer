# Mazer first-time cards: spec (2026-11-26)

Status: SPEC, docs only. No app code, no flag flip, no DB change in this PR.
Base: `origin/main` 8aaf0af7 (Merge PR #727). Every `file:line` below is from that tree unless it names another worktree.
Owner decisions this spec follows: Zac, 2026-11-26 (relayed in the lane brief), and Zac's answers to the open questions, 2026-11-27 (section 0, which wins over anything below it). Visual picks come later through a live options page; nothing here picks a look.
Revision 2 (2026-11-27): `origin/main` has since moved to 9219c82d (PRs #730 and #732, CI only). The facts below were re-checked against it where a slice depends on them.

Tags used on facts: **[measured]** = I ran it (scratch script, output quoted); **[prior-measured]** = another session ran it on real boards, raw output on disk; **[read]** = read from source, not run; **[UNKNOWN]** = not established.

---

## 0. Decisions (Zac 2026-11-27)

Zac answered the ten questions of section 11. Items 5, 8, 9 and 10 were delegated ("do what u think best"); the coordinator's call is recorded as the decision. Sections 1-11 are edited to match.

| # | Question | Decision | Sections changed |
|---|---|---|---|
| D1 | Name of the pulse-ring tile | **"Switch".** The Guide heading "Wrap gate" becomes "Switch". | 1, 4, 7 |
| D2 | On-screen word for gated tiles | **Keep "Wrap".** | 1, 7 |
| D3 | Locked-gate heading | **Keep "Shard".** | 1, 7 |
| D4 | Curve and schedule | **Approved:** locked-gate chance 30% at L100 rising to 100% at L283 (curve A), plus hazard manifest v2 (the shard entry moves from 60 to 100, with the chance layer). | 3, 9 |
| D5 | Veterans / backfill (delegated) | **No skip, no backfill.** Every card fires once, on the account's **first interaction with the mechanic (first touch)**, veterans included. The stacking caps handle bursts. A veteran past L140 who never touches a wrap never sees the wrap card. | 4, 5, 9 |
| D6 | Account sync | **Later.** Ship the device-local ack store first. The settings-key design stays documented, not built. | 6, 9 |
| D7 | Progress reset | **Cards show again:** a progress reset clears this account's first-time seen list. The level-1 control hint (a device fact) is not cleared. | 6, 10 |
| D8 | Hidden-path clash K3 (delegated) | **Shard placement treats the wrap path behind an unlit Switch as BLOCKED.** It never relies on an unlit route, so every locked-gate level is solvable without the Switch. Exact change point and the 81-level test: section 3, K3. | 3, 9, 10 |
| D9 | Guide rows (delegated) | **Hide a mechanic's Guide row until its card has been seen or the mechanic touched,** so the Guide never spoils. Help keeps a link to the full list. `legacyGuideContent.ts` and the drift tests change in the same PR. | 7, 8, 9 |
| D10 | Caps (delegated) | **Keep:** at most 1 card per level and 2 per app session. | 5 |

What D5 changes in one line: cards no longer fire at level start because a mechanic is on the board. They fire at the moment of first touch, as defined per card in section 4.

---

## 1. Vocabulary

| Zac's word | Code name | What the player sees | Guide row today |
|---|---|---|---|
| Gated tiles | wrap corridors / bleed-off paths (`legacyBleedPaths.ts`, `wrapStats`) | open edges you walk off and come back on the far side | `wrap`, heading "Wrap" |
| **Switch** (D1) | bleed gate (`legacyBleedGates.ts`, Gate D "Pulse ring") | pale tile with a dashed ring; stepping on it opens a hidden wrap | `bleed-gate`, heading "Wrap gate" today, "Switch" after slice 3 |
| Locked gates | shards (`src/mazer-core/hazards/shards.ts`) | end star stays locked until the shards are taken in order | `hazard-shard`, heading "Shard" (hazard layer only) |
| Pulse Gate | hazard `pulseGate` | a gate that opens and shuts on a beat | `hazard-gate`, heading "Pulse Gate" (hazard layer only) |

**The pulse-ring tile is named "Switch" (D1).** It says what the tile does (step on it, a wrap switches on), and it avoids a fourth "gate" next to Pulse Gate, locked gate and the "Wrap gate" heading. On screen, wraps stay "Wrap" (D2) and locked gates stay "Shard" (D3); "gated tiles" and "locked gates" stay Zac's working words in docs only.

---

## 2. Facts

### 2.1 Cadence sources

- F1 [read] Switch (bleed gate) cadence is keyed on the level only. `BLEED_GATE_FIRST_LEVEL = 20`, chance 0.3 at 20 rising linearly to 0.7 at 100, then held (`src/legacy-runtime/legacyBleedGates.ts:43-59`). The roll is `lowbias32(level ^ 0x6a09e667) / 2^32 < chance` (`legacyBleedGates.ts:62-75`).
- F2 [read] A gate needs a gateable wrap on the finished grid; placement returns `null` when there is none (`legacyBleedGates.ts:184-298`, header `:39-41` "a level without a gateable wrap has no gate").
- F3 [read] Wrap rungs by felt level: 0 below 10, 1 from 10, 2 from 30, 0 from 140 (`src/legacy-runtime/legacyGeometryBudget.ts:120-125`). Between felt 100 and 140 the rungs fade by a seeded roll, expected `owned * (140 - felt) / 40` (`legacyGeometryBudget.ts:118-119, 426-436`).
- F4 [read] A gate level keeps one wrap for felt 100..282 (`resolveGeometryBudgetGateWrapFloor`, `legacyGeometryBudget.ts:445-448`; applied at `src/legacy-runtime/legacyGenerationLifecycle.ts:700-709`).
- F5 [read] The felt level clamps at 283 (`legacyGeometryBudget.ts:377-380`). The budget level caps at `LAST_BUDGET_LEVEL` 288 (`src/legacy-runtime/legacyProgression.ts:621-638`), so every real level above 288 uses level 288's gate roll and geometry.
- F6 [read] The base-attempt fallback can still drop a wrap. The comment says 12 attempts keep "94 to 100 percent of levels 10 to 100 wrapped (measured, 100 to 200 seeds per board; 100 percent up to level 60, 94 to 97 at level 100)" (`legacyGeometryBudget.ts:468-471`).
- F7 [read] Hazard intro schedule (signed manifest v1): Pulse Gate 10, Sentry 20, Hunter 35, Shard 60 (`src/mazer-core/hazards/schedule.ts:34-39`, version `:29`). A player whose exposure stage lags the schedule meets the skipped kinds one per level (`schedule.ts:21-24`).
- F8 [read] Shard route target: `null` below saturation, otherwise `160 + 2 * (L - sat)` (`shards.ts:49-55, 77-79`). Before saturation the band is a modest detour `[d+2, d+max(4, ceil(d/2))]` (`shards.ts:95-102`). The legacy runtime's saturation is 288.
- F9 [read] The hazard layer is OFF by default (`src/legacy-runtime/legacyHazardLayerFlag.ts:22`), and on only via `?lab=hazards`. So Pulse Gates and shards (locked gates) are not live for players today. Wraps and Switches are live.
- F10 [read] Shard placement and the hazard graph read `maze.grid` only (`src/legacy-runtime/legacyHazardGraphAdapter.ts:31-35`). A gated wrap path stays OPEN in the grid; the runtime hides it (`src/legacy-runtime/legacyMaze.ts:217-220`). Neither `shards.ts`, `shardSolvability.ts` nor the shards-lane `legacyShardRun.ts` mentions hidden or bleed cells (grep, 0 hits).

### 2.2 Measured cadence, L1..400

Script: the scratchpad `cadence.mjs` (not committed). It copies the F1 hash and chance verbatim, plus the F3-F5 wrap rules and clamps. It also includes the proposed locked-gate curve from section 3.

- **Gate-ask level** = the F1 roll says "gate" for that level's budget level.
- **P(wrap)** = the formula probability that the maze owns at least 1 wrap rung, before the F6 fallback. The fade roll is assumed to round `expected` stochastically.
- **Switch placeable** = a gate-ask level with P(wrap) > 0.

| Band | Levels | Gate-ask levels | Share | Chance | Mean P(wrap) | Switch placeable | Proposed lock levels | Mean lock chance | Switch + lock same level |
|---|---|---|---|---|---|---|---|---|---|
| 1-9 | 9 | 0 | 0% | 0% | 0% | 0 | 0 | 0% | 0 |
| 10-19 | 10 | 0 | 0% | 0% | 100% | 0 | 0 | 0% | 0 |
| 20-29 | 10 | 4 | 40% | 30-35% | 100% | 4 | 0 | 0% | 0 |
| 30-49 | 20 | 7 | 35% | 35-44% | 100% | 7 | 0 | 0% | 0 |
| 50-99 | 50 | 29 | 58% | 45-70% | 100% | 29 | 0 | 0% | 0 |
| 100-119 | 20 | 13 | 65% | 70% | 100% | 13 | 6 | 34% | 4 |
| 120-139 | 20 | 16 | 80% | 70% | 96% | 16 | 6 | 41% | 3 |
| 140-199 | 60 | 46 | 77% | 70% | 77% | 46 | 30 | 57% | 25 |
| 200-249 | 50 | 36 | 72% | 70% | 72% | 36 | 32 | 78% | 24 |
| 250-282 | 33 | 26 | 79% | 70% | 79% | 26 | 31 | 93% | 25 |
| 283-288 | 6 | 5 | 83% | 70% | 0% | 0 | 6 | 100% | 0 |
| 289-400 | 112 | 112 (= L288) | 100% | 70% | 0% | 0 | 112 | 100% | 0 |

**Headline [measured]:** the first Switch level is **L22** (then 24, 28, 29, 31, 32, ...). Switches ask on about 58-80% of levels from 50 to 282. No Switch can appear from L283, because there are no wraps there. From L140, wraps exist ONLY on Switch levels.

- M1 [measured] The roll above matches the earlier real-board column (raw files in `C:\ATLAS\tmp\endless-analysis-20261126\`, `q1-real-phone.txt`). Non-gate levels 150, 170, 188 and 198 roll false, and 140, 152, 158, 164, 176, 182, 194, 200, 206 and 210 roll true.
- M2 [prior-measured] On the real phone board (40 seeds), gate levels 140-210 placed a gate on 29-35 of 40 seeds, all 40 wrapped. Non-gate levels 150/170/188/198 had 0 gates and 0 wraps. At L200 9/10 seeds were gated, at L250 10/10. At L288/300/350/400, 0/10 were gated and 0/10 wrapped (`q2-real-phone.txt`).
- U1 [UNKNOWN] Per-seed Switch placement success below L140 (no real-board run here; it needs a build and an install).
- U2 [UNKNOWN] Per-seed wrap presence 10..139 beyond the F6 comment.
- U3 [UNKNOWN] Whether shard placement succeeds on real boards at each level, and whether the strict target `160 + 2(L-288)` stays reachable as L grows (the shards lane owns it; a failed placement ships the level with no shards, `legacyShardRun.ts` header in the shards-ui worktree).
  - Resolved 2026-11-27 [measured]: on the shipped play board the absolute target failed from L288 to about L500 (983 of 3764 sweep runs). The band is now anchored at the maze's own start -> star distance and play ships the nearest verified route on a miss, so every level L60-L1000 places (`docs/playbook-notes/2026-11-27-mazer-shard-placement-anchor.md`). The shard side of D8 (wrap behind an unlit Switch walled for placement and verdict) shipped with it via `maskLegacyBleedGatedCells`; the adapter-wide mask and the 81-level test (slice 5) are still open.

### 2.3 Existing "seen" and onboarding machinery

- F11 [read] Hazard intro cards (HAZ-008) mark `introsShown` in the local exposure record `mazer.hazard-exposure.v1`. The key is auth-scoped by the scene and is "never part of the account settings JSON" (`src/legacy-runtime/legacyHazardOnboarding.ts:38-39, 125-173`; `src/mazer-core/hazards/exposure.ts:1-60`). Only `pulseGate` is a live kind (`legacyHazardOnboarding.ts:45`). The card text IS the Guide row (`legacyHazardOnboarding.ts:107-110`). The card shows 4500 ms; the first move dismisses it (`:48`).
- F12 [read] The tutorial registry and ack store exist:
  - `TutorialToken {id, trigger: account-created | first-occurrence{event}, repeat, revision, order, copy}` (`src/tutorial/tutorialRegistry.ts:9-26, 51-61`);
  - acks live under `mazer.tutorial.acks:<encoded accountId>` (`src/tutorial/tutorialAckStore.ts:8, 72`).
  - The only user today is the level-1 control hint, token `level-1.controls`, stored with the fixed account id `device` (`src/legacy-runtime/legacyControlHint.ts:10-13`; `src/render/legacyControlHintOverlay.ts:62`).
- F13 [read] A progress reset never clears `mazer.tutorial.acks` (`src/legacy-runtime/legacyProgressionResetFlow.ts:110-120`).
- F14 [read] Level Preview (`?previewLevel=N`) swaps in in-memory storage (`src/legacy-runtime/legacyLevelPreview.ts:1-20, 138-148`; `src/scenes/MenuScene.ts:2515`). `resolveBrowserLocalStorage()` returns it while preview is active (`MenuScene.ts:15130-15132`). Hazard onboarding reads storage only through that method (`MenuScene.ts:11010-11022`), so preview cannot write the exposure record.
- F15 [read] **Preview leak (existing, not run in a browser):** the control hint is installed from boot with `window.localStorage` directly (`src/boot/main.ts:277`; `legacyControlHintOverlay.ts:48-62`), with no preview check. `?previewLevel=1` should therefore show the hint and write `mazer.tutorial.acks:device` to the real device. Small, but it breaks "preview writes nothing". The fix is slice 0 in section 9.
- F16 [read] The shards lane (uncommitted files in `C:\ATLAS\tmp\worktrees\shards-ui-20261126`, worker aec733107f7ac3552) builds the reusable pair:
  - `src/ui/notice/inFlowNotice.ts`, with `src/legacy-runtime/legacyInFlowNoticeHost.ts` showing at most one notice and letting a new one replace the old;
  - `src/render/coachMarkView.ts`: a pulsing dotted ring in board space plus a label pill, no copy inside;
  - `src/legacy-runtime/legacyShardHint.ts` puts the first-shard notice on top of hazard `introsShown`. Its copy is "Take the shard first. The star stays locked until you do." with the coach label "Take this first".
  - It is not on `main` yet: this spec depends on it landing.

### 2.4 Board facts a trigger can read

- F17 [read] Wraps on the board: `maze.wrapStats.rungs` (`legacyMaze.ts:213-216`); the open paths come from `listBleedPaths(grid)` (`src/legacy-runtime/legacyBleedPaths.ts:76-81`). A wrap step is resolved in navigation (`legacyMaze.ts:508-546, 3461`).
- F18 [read] Switches on the board: `maze.bleedGates[]` with the tile `x, y` (`src/legacy-runtime/legacyBleedGateState.ts:13-26`). The triggered state comes from `isLegacyBleedGateTriggered` (`:75`) and the hidden cells from `isLegacyBleedGateCellHidden` (`:96`). The border cells of a gated path come from `resolveLegacyBleedGateBorderCells` (`:63-71`).
- F19 [read] Wraps and Switches are optional shortcuts. A gated path "saves nothing until it is triggered", and the route walks to the gate "when that pays" (`legacyBleedGates.ts:3-12`). Locked gates are mandatory: the star does not finish the level until every shard is taken (`shards.ts:63`). Pulse Gates sit on the route.

### 2.5 Persistence and the account

- F20 [read] Game progression is account-synced through `mazer_progression_states`, using server-authoritative RPCs (`docs/MAZER_SUPABASE_STORAGE.md`).
- F21 [read] Profile settings are in `mazer_profiles.settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object')` (`supabase/migrations/20260709011209_mazer_account_storage_contracts.sql:20`). The client writes the whole object:
  - `createRemoteProfilePayload` sends `withLegacySoundDefaultOnMarker(pickLegacyGameTogglePreferences(settings))` (`src/legacy-runtime/legacyRemoteProgression.ts:386-393`) via `.update(...)` with a revision (`:471`), and fingerprints the same shape (`:268`);
  - the picker keeps six toggle keys only (`src/legacy-runtime/legacyGameTogglePreferences.ts:131-140`);
  - the `soundDefaultOnV1` marker is the precedent for an extra key riding that JSON.
- U4 [UNKNOWN] Whether live production has extra constraints or triggers on `mazer_profiles.settings` beyond the repo migration (not read; it would be a read-only check).

### 2.6 What levels 1..10 and the Guide teach today

- F22 [read] Level 1 shows one hint, once per device: "Touch and drag anywhere to move." / "Reach the star to clear the maze." There are mouse, keys and neutral variants; the hint lasts up to 12 s, only in play, with no overlay, at level 1 (`legacyControlHint.ts`; gate at `:120`).
- F23 [read] No other in-play teaching exists for levels 2..10. Wraps start at 10 (F3) and are taught by the Guide only.
- F24 [read] Guide "How to play" has 12 rows: goal, start, you, move, trail, wrap, bleed-gate, levels, online, menu, menu-play, sound (`src/legacy-runtime/legacyGuideContent.ts:102-272`).
  - Wrap reads "Some mazes wrap around open edges. Edge stars fill with your colour as beams hit." (`:184-185`).
  - Switch reads "Later mazes hide a wrap behind a pale tile with a dashed ring. Walk onto it to open it." (`:199-200`).
  - Both rows show from level 1, before the player has met either.
  - Hazard rows show only when the layer is on AND the kind has been met (`:307-336`; `legacyHazardOnboarding.ts:179-190`).
  - The pending rows were `first-run-coach` (an owner decision) and `auto-pause` (`legacyGuideContent.ts:347-363`). Slice 9 (2026-11-27) resolved `first-run-coach`; only `auto-pause` remains.
- F25 [read] Copy mismatch: the Goal row says "Reach the spinning twin stars" (`legacyGuideContent.ts:115`); the level-1 hint says "Reach the star".
- F26 [read] What the drift test pins (`tests/reset/legacy-guide-content-drift.test.ts`):
  - the row id order (`:72`) and the pending ids (`:122`);
  - the wrap text, by regex (`:271-272`), and the Switch text, by `/dashed ring/` (`:298`);
  - every row 90 characters or fewer (`:510-513`);
  - the glossary grid: 12 rows fill 3 lines, all 16 fill 4 (`:529`).
  - The Switch row's own test is titled "Wrap gate (MAZER-L10)" (`:275`).
- F27 [read] Two more tests pin Guide copy and layout:
  - `tests/reset/legacy-player-message-inventory.test.ts` pins the literal strings: wrap row `:97`, Switch row `:98` (it cites the Guide update rule `docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md`), the level-1 "Reach the star" line `:106`, and the Pulse Gate row `:110`;
  - `tests/reset/legacy-guide-sheet-plan.test.ts:60` sizes the sheet for today's row list (about 1330 px tall).
- F28 [read, at 9219c82d] The CI Verify workflow runs these whole folders: `tests/core`, `tests/cosmetics`, `tests/tutorial`, `tests/architecture`, `tests/brand`, `tests/legacy-runtime`, `tests/reset` and `tests/render` (`.github/workflows/verify.yml`, the vitest steps). So a new test file under any of them gates a PR without being named. (The local `scripts/verify/run-test-verify.mjs` list is narrower and lists render files one by one; it is not the CI gate.)

---

## 3. Locked-gate curve

**Curve A, approved by Zac (D4): locked-gate chance is 0 below 100. It is 30% at 100, rising linearly to 100% at 283, and holds at 100% from 283.** Manifest v2 (K1) is approved with it.
- The roll is keyed on the level only, with its own salt: hash as F1, salt `0x4c4f434b` ("LOCK"). Like the Switch cadence, it is stable and testable, and it does not correlate with the Switch roll.
- Mazes stay a pure function of (seed, level, stage).

Expected share by band (from the table above):

| Band | Mean chance | Levels locked (hash) |
|---|---|---|
| 100-119 | 34% | 6 of 20 |
| 120-139 | 41% | 6 of 20 |
| 140-199 | 57% | 30 of 60 |
| 200-249 | 78% | 32 of 50 |
| 250-282 | 93% | 31 of 33 |
| 283+ | 100% | all |

- The first locked levels are 102, 106, 108, 110 and 115 [measured].
- The longest run of unlocked levels after 100 is 6 (ending at 159) [measured]. So no long dry spell.

Why A beats the alternatives:

- **B (30% held to 140, then ramp):** it keeps locks rarer while wraps fade. But it pushes the ramp into fewer levels and makes 140-283 steeper for no gain we can measure.
- **C (step 100% at 100):** it breaks Zac's "gradual" ask.
- **D (ramp to 100% at 288):** it is safe for the route target, but it leaves the fixed-maze plateau 283-287 with gaps (see below).

How A composes with the code, and what clashes:

- **K1 (clash, manifest):** the signed manifest v1 puts the shard intro at L60 with a shard on every level from 60 (F7; `allocateHazardUnits` in `schedule.ts:198-247`). Locked gates from 100 with a chance needs a manifest v2: move the shard entry to 100 and add the chance layer to the allocator. The shards-lane `resolveShardFirstLevel` reads the schedule (shards-ui `legacyShardHint.ts:28-30`), so the first level changes in one place. Exposure catch-up (F7) stays valid: the "first encounter" becomes the first locked level at or after the player's stage.
- **K2 (composes):** the strict route target starts at 288 (F8), and A is 100% from 283. Every level from 288 carries shards, so the per-level rise `160 + 2(L-288)` is unbroken. Above 283 the geometry is the same maze per seed (F5), so the shards ARE the only per-level change there. Any chance below 100% at or above 283 would ship identical consecutive levels, which is why the curve must be 100% by 283, not 288.
- **K3 (clash, hidden wrap), decided by D8:** from 100 to 282, 81 levels carry both a Switch and a lock [measured, by hash]. Shard placement treats the hidden path as open (F10). So a shard can land on a cell the player cannot see until the Switch is lit, or the proven route can rely on it.
  - **Decision:** shard placement and the route verdict treat the wrap path behind an unlit Switch as BLOCKED. A lit Switch can only shorten the run, so every locked-gate level is solvable without the Switch. The rejected option was "no lock on a Switch level before 283", which would have cut lock share by about 75% in 140-282.
  - **Why walling the two openings is enough [read]:** the hazard graph has the wrap edges. Its neighbours equal production movement (`resolveLegacyWalkableGridNeighbors`, `legacyMaze.ts:552`, which wraps at `:508-546`), and `findHazardGraphLegacyMismatches` pins that (`legacyHazardGraphAdapter.ts:49-73`). A Switch hides exactly the two border cells of its path (`resolveLegacyBleedGateBorderCells`, `legacyBleedGateState.ts:63-71`; `isLegacyBleedGateCellHidden` hides border cells only, `:96-115`). With both cells walled, the wrap edge and the openings are gone. The interior of the corridor stays visible and reachable, so a shard there is fair.
  - **Exact change point:** `createLegacyMazeHazardGraph` (`src/legacy-runtime/legacyHazardGraphAdapter.ts:32-35`) builds the graph from `maze.grid`.
    - Add a pure helper `maskLegacyBleedGatedCells(grid, bleedGates)`. It returns a copy of the grid with each gate's two border cells set to `false`. It uses `resolveLegacyBleedGateBorderCells` (pure, from the maze), not `isLegacyBleedGateCellHidden`, which reads runtime trigger state.
    - `createLegacyMazeHazardGraph` builds from the masked grid whenever `maze.bleedGates` is non-empty. `LegacyHazardGraphSource` gains an optional `bleedGates`.
    - Callers: the hazard overlay (`legacyHazardOverlay.ts:44`, on main) and the shards-lane `computeShardLayer` (`legacyShardRun.ts`, shards-ui worktree), so placement AND `validateShardRoute` see the masked graph.
    - `findHazardGraphLegacyMismatches` then compares against the masked grid (same helper).
  - **Recommendation (same change):** the mask applies to every hazard placed through the adapter, not only shards. A Pulse Gate or sentry on a hidden path has the same fairness problem. After a Switch is lit, hazards keep treating that wrap as a wall: this is conservative and only affects hazard motion. Whether hunters should follow a lit wrap is the hazard lane's call [UNKNOWN today].
  - **The 81 levels [measured, by hash]:** 106, 108, 110, 115, 129, 132, 135, 140, 142, 144, 146, 147, 151, 153, 160, 164, 166, 167, 168, 173, 179, 180, 181, 182, 183, 186, 187, 190, 192, 195, 197, 199, 200, 207, 210, 212, 214, 215, 216, 217, 223, 224, 225, 227, 229, 230, 232, 234, 235, 239, 240, 241, 242, 243, 246, 249, 250, 251, 252, 253, 255, 256, 261, 262, 263, 264, 265, 266, 267, 269, 270, 271, 272, 273, 274, 276, 277, 278, 279, 280, 282. These are the levels where the Switch roll (F1) says "gate", P(wrap) > 0, and the curve-A lock roll says "lock".
  - **The test that proves solvability:** `tests/reset/legacy-shard-hidden-path-solvability.test.ts` (whole-folder CI, F28).
    1. Pin the 81 levels as a constant. Assert that recomputing them from the two rolls gives the same list (count 81, first 106, last 282), so the list and the curve cannot drift apart.
    2. For each level, take a fixed set of seeds (count set at build to fit the CI budget; runtime is [UNKNOWN]). Generate the real board through the same generator entry the scene uses, then compute the shard layer with the masked graph. Shards are forced on for the level, so the test does not wait for the manifest v2 slice.
    3. On every board with at least one Switch, assert:
       - no shard sits on a masked cell;
       - `validateShardRoute` passes on the masked graph;
       - an independent BFS over the masked grid, using `resolveLegacyWalkableGridNeighbors` on that grid, reaches shard 1, then each next shard in order, then the goal from the start.
    4. Assert that the goal is reachable from the start on the masked grid even with no shards. This covers a board where placement fails open and ships without shards.
    5. Report how many boards had no Switch or no shards. Assert that at least one board per level placed a Switch; a level that never does is not exercising the clash, and the test says which.
    6. Negative control: a hand-built maze where the only path to a candidate cell runs through a gated wrap. Without the mask the cell is reachable; with it, placement rejects the cell. This proves the test can fail.
  - The clash already exists in the hazard lab under manifest v1 (`?lab=hazards`, off for players). There, shards are on every level from 60 (K1), so every Switch level from 60 is affected, not just the 81. This is why the mask ships before manifest v2 (section 9).
  - Not measured: how often the mask changes a placement today.
- **K4 (watch):** shard solvability (`src/mazer-core/hazards/shardSolvability.ts`) was not re-run here. A only changes WHICH levels carry shards, not the band or the verdict.

---

## 4. Card registry

The four live cards, plus the existing level-1 hint, kept as is:
- Each card is the pair Zac picked: an **in-flow notice** (the shards-lane `inFlowNotice`) plus a **coach mark** (`coachMarkView`).
- All copy is 90 characters or fewer, to match the Guide cap.
- Every card is **once per account**, at revision 1. A revision bump re-shows a changed card (F12).

| id | Mechanic | Priority (1 = first) | Trigger: first touch (D5) | Notice copy (title / body / action) | Coach mark anchor / label | Guide row |
|---|---|---|---|---|---|---|
| `mechanic.locked-gate` | Locked gate (shards) | 1 (mandatory) | the first shard pickup OR the first step onto the locked star, whichever comes first | "New" / "Take the shards in order. The star stays locked until you do." / "Got it" | the next untaken shard / "Take this next" | `hazard-shard` |
| `mechanic.pulse-gate` | Pulse Gate | 2 (on route) | the first move into a cell next to a Pulse Gate (before the gate can block or hit) | "New" / "Gates open and shut on a beat. Wait for the gap, then go through." / "Got it" | that gate / "Wait for the gap" | `hazard-gate` |
| `mechanic.switch` | Switch (pulse-ring tile) | 3 (optional) | the first step onto a Switch (the gate goes from unlit to triggered, F18) | "New" / "A Switch is the pale tile with a dashed ring. Walk onto it to open a hidden wrap." / "Got it" | the border cell the Switch just opened (`resolveLegacyBleedGateBorderCells`, nearest by walking distance) / "Open edge" | `bleed-gate` |
| `mechanic.wrap` | Gated tiles (wrap) | 4 (optional) | the first wrap step (walking off an open edge and coming back on the far side, F17) | "New" / "Open edges wrap: walk off one to come back on the far side. Edge stars fill as beams hit." / "Got it" | none (the player has just gone through) | `wrap` |
| `level-1.controls` (existing) | Controls | 0 | level 1 | unchanged (F22) | none | `move` |

Copy lengths: 61, 65, 81 and 89 characters, all within the 90-character cap. The Switch body is new for D1: today's row says "Later mazes hide a wrap ..." (F24), which reads wrong after the player has just stepped on one.

Rules:

- **R1 First touch, never a fixed level and never "on the board" (D5).**
  - A card fires at the moment this account first interacts with its mechanic (the trigger column), if its id is not acked. Being on the board is not enough. Veterans are not skipped and nothing is pre-acked (no backfill).
  - So an account that never touches a mechanic never sees its card. The common case is a veteran past L140 who never steps on a Switch: they never see the Switch or wrap card, and that is intended.
  - A touch also marks the mechanic as **met** (P1), even when the card is deferred by a cap (section 5). The Guide reads met (D9, section 7).
  - Accepted risk of D5 for the mandatory locked gate: a new player can wander a locked level before the card. The locked star's own look carries the hint until then, and the first bump on it fires the card.
- **R2 One source of copy.**
  - The card body is the Guide row text, as hazard intro cards already do (`legacyHazardOnboarding.ts:107-110`).
  - Where today's Guide text reads badly in a card ("Later mazes ..."), change the Guide row, not the card (section 7).
- **R3 Ack moment.**
  - The card is marked seen when it is dismissed: "Got it", the first move at least 800 ms after it showed, or the 4500 ms timeout.
  - Touch cards appear while the player is moving, so the 800 ms move rule may close them too fast. The number is tuned on the options page (section 9); 800 ms is the default until then.
  - If the app dies while a card is up, the card shows again next time. That is acceptable.
- **R4 Coach mark lifetime.** The coach mark stays until the player reaches the anchor, the notice is dismissed plus 4 s, or the level ends, whichever comes first. Reduced motion: the ring holds still (already in `coachMarkView`).
- **R5 Absorb the old paths.**
  - While first-time cards are on, hazard onboarding's own intro card (F11) is suppressed for `pulseGate` and `shard`, so no card shows twice.
  - `introsShown` stays as the generation and Guide input.
  - The shards-lane first-shard hint becomes the `mechanic.locked-gate` entry. Its trigger moves from the first shard level (`resolveShardFirstLevel`, F16) to first touch (D5). Its "seen" is read as `acked OR introsShown.includes('shard')`, so nobody sees it twice across the migration.

---

## 5. Stacking and catch-up

Caps confirmed by Zac (D10). Triggers are first touch (R1, D5).

- **S1 At most one card per level.** The first touch in a level that finds an unacked card fires it. A later touch of another mechanic in the same level is deferred. If two mechanics are first touched on the same step (rare), the lower priority number wins: mandatory before on-route before optional. Ties cannot happen (each priority is unique).
- **S2 At most one coach mark on screen,** and only with its own notice.
- **S3 Session cap: 2 cards per app session** (one launch until the tab closes). The level-1 control hint does not count toward the cap. Cards past the cap are deferred, never dropped.
- **S4 Deferral.**
  - A deferred card stays unacked and fires at the next touch of its mechanic, in a later level or session, within the caps.
  - Nothing fires at a level start, and nothing is queued to fire without a touch.
  - Above 283 there are no wraps or Switches, so their cards cannot fire there. That is correct: the mechanic is not in the player's game any more.
- **S5 No flash-and-gone.** If the level ends less than 800 ms after the card appeared, it is not acked (R3) and comes back at the next touch. This covers a touch on the last step before the star.
- **S6 Composes with hazard catch-up** (F7). Hazard kinds are already introduced one per level. Cards ride on top and never add a hazard.
- **S7 The Guide lists everything met** (acked, or touched but deferred by a cap), so a player who missed a card can still read it (D9, section 7).

Worked case: **an account at L200 that never saw any card** (e.g. a new device, cleared storage, a progress reset under D7, or cards shipped after they passed). Assume the hazard layer is on and the account is past the shard stage.

1. L200 starts. No card: nothing fires at a level start.
2. The player picks up a shard, or walks onto the locked star first. The **locked-gate** card fires (session card 1), with a coach mark on the next untaken shard.
3. Later in L200 the player steps onto the Switch (L200 is a gate level and 9/10 seeds place one, M2). The level has used its one card, so the Switch card is deferred (S1). The Switch counts as met, so its Guide row appears (S7).
4. L201. If Pulse Gates are live and the player moves next to one, the **Pulse Gate** card fires (session card 2). Otherwise the Switch card fires at the next Switch touch.
5. The session cap is hit. In a later session, the Switch card fires at the next Switch touch. The wrap card fires at the first wrap step, which above 140 usually means walking through a lit Switch's wrap (wraps exist only on Switch levels there; that the kept wrap is the gated one is an assumption).
6. A veteran who never steps on a Switch never sees the Switch or wrap card (D5).

Result: each card at the moment it is needed, at most one per level and two per session, never two at once.

---

## 6. Persistence design

**Where progress lives today:**
- level progress is account-synced (F20);
- toggles ride `mazer_profiles.settings` (F21);
- hazard exposure is local and auth-scoped (F11);
- tutorial acks are local, and the control hint is per device (F12).

**Design (slice 1), device-local first (D6):**

- **P1 Store.**
  - Reuse the tutorial ack store logic (`createTutorialAckStore`) with registry tokens: `trigger: first-occurrence`, `event: mechanic-touch:<mechanic>`, `repeat: once`, `revision: 1`, `order = priority`. `validateTutorialRegistry` already exists. Same JSON shape, no new format.
  - Own key, not the tutorial key: **`mazer.firsttime.seen.v1:<scope>`**. The ack store's prefix is fixed (`tutorialAckStore.ts:8`) and it URI-encodes the id (`:72`), so slice 1 adds an optional `storageKey` override to `TutorialAckStoreOptions`, with the default unchanged. A separate key is what lets a reset clear the cards without touching the level-1 device hint (P4).
  - The same record keeps the **met** set (mechanics touched, acked or not; R1), which the Guide reads (D9). Exact field name fixed at build.
- **P2 Scope.** `<scope>` = `user:<id>` when signed in, `guest` otherwise: the same scope string and resolver as the progression keys (`createLegacyAuthScopedStorage`, `src/legacy-runtime/legacyAuth.ts:1081-1095`). On sign-in, merge the guest record into the user record as a union with max revision, so signing up does not re-show cards. The level-1 hint stays per device under `mazer.tutorial.acks:device`: input is a device fact; mechanics are account facts.
- **P3 Storage handle.** Always obtained through the scene's `resolveBrowserLocalStorage()` (F14), never `window.localStorage`. Level Preview then lands every ack in the in-memory sandbox, and nothing reaches the device. A preview at L200 shows a brand-new account, which is exactly the stacking case to screenshot.
- **P4 Reset clears the cards (D7).**
  - Change point: `LEGACY_PROGRESSION_RESET_LOCAL_EFFECTS` (`src/legacy-runtime/legacyProgressionResetFlow.ts:121-127`) gains `{ action: 'remove', keyBase: 'mazer.firsttime.seen.v1' }`. `applyLegacyProgressionResetLocalEffects` (`:141-160`) already removes `<base>:<scope>` through the injected resolver, so a reset removes the seen and met record for the account being reset, and only that one.
  - The comment at `:110-119` keeps "NEVER ... mazer.tutorial.acks": the device hint is not cleared.
  - The test `tests/reset/legacy-progression-reset-flow.test.ts:99-107` pins the key-base list by equality, so it gets the new constant. Its regex `/game-toggles|auth|account-sync|tutorial/` still passes, because the new key has no "tutorial" in it.
  - After a reset the Guide hides the wrap and Switch rows again until they are touched (D9). That matches "cards show again".
- **P5 Flag.** `?lab=firsttime`, remembered in `mazer.lab.firsttime.v1`, with build default `false`, mirroring `legacyHazardLayerFlag.ts`, plus a live-cards list (like `HAZARD_ONBOARDING_LIVE_KINDS`). Each slice adds its card id to the list. With the flag off, the system holds nothing, reads no storage and draws nothing; the reset still removes the (absent) key, which is harmless.

**Account sync: LATER (D6). Documented here, not built. NO schema change, NO SQL, client code only.** When it is picked up, a progress reset must also clear the remote key, to keep D7 true across devices.

- New key inside `mazer_profiles.settings`: `firstTimeSeen: { "<cardId>": <revision> }` (well under 200 bytes).
- The column is a jsonb object with only a `jsonb_typeof = 'object'` check (F21), so the key fits as is (repo migration; U4 live check outstanding).
- Client changes:
  - a picker for the new key next to `pickLegacyGameTogglePreferences`;
  - include it in `createRemoteProfilePayload` (`legacyRemoteProgression.ts:386-393`) and in the fingerprint (`:268`);
  - on pull, merge remote into local as a union with max revision; on write, send the union.
- Risk: an older cached client writes the whole settings object without the key and drops it remotely. Local stays the source of truth and the next new-client write restores it. Worst case: one card re-shows on a new device.
- **Needs Zac, only when this later slice starts:**
  - a yes to have the client write this new key into production profile rows (no DDL, no migration, no RPC change);
  - plus the read-only U4 check before it ships.
  - If Zac prefers a dedicated column instead, that IS a DB change: a migration adding `first_time_seen jsonb not null default '{}'` to `mazer_profiles`, through `docs/ops/MAZER-SQL-CHANGE-PROCESS.md`. It needs his approval of the exact SQL. Not recommended: the jsonb key does the job.

---

## 7. Guide sync (`legacyGuideContent.ts` + `tests/reset/legacy-guide-content-drift.test.ts`)

No card adds a new Guide row. All four already have one.

**Hide until met (D9).** With `?lab=firsttime` on, the `wrap` and `bleed-gate` rows are hidden until their card has been seen or the mechanic has been touched (the met set, P1). The hazard rows already work this way (F24). Every other row (goal, start, you, move, trail, levels, online, menu, menu-play, sound) always shows.
- Change point: `buildLegacyGuideSheetModel` (`legacyGuideContent.ts:398-411`) gains two options: `metMechanics`, which filters the two rows, and `showAll`, which returns every row (for the Help link). Omitted options return `LEGACY_GUIDE_ROWS` itself, as today. So the flag-off sheet is byte-identical, and the existing pins (`:72`, `:529`, `legacy-guide-sheet-plan.test.ts:60`) keep passing.
- The call site passes the met set next to `hazardKinds` (`MenuScene.ts:12367`). The read goes through a new module, not `MenuScene.ts` (Wave 5C).
- **Help link to the full list:** Help gets an "All tips" link that opens the Guide with `showAll: true`. It shows every row, plus the hazard rows for live kinds. The Help tab is not on `main` at 9219c82d (the feedback-rating lane owns it). If it has not landed when this slice ships, the same link sits at the foot of the Guide until it does.
- **Same PR, always:** `legacyGuideContent.ts`, `tests/reset/legacy-guide-content-drift.test.ts`, `tests/reset/legacy-player-message-inventory.test.ts` and `tests/reset/legacy-guide-sheet-plan.test.ts` change together. Hiding rows changes the row count and the grid (`:529`: 10 base rows, then plus each met row) and the sheet height, so the drift test gains flag-on cases next to the unchanged flag-off ones.

Per card:

| Card | Guide change | Test changes |
|---|---|---|
| wrap | Heading stays "Wrap" (D2). Text becomes the card body: "Open edges wrap: walk off one to come back on the far side. Edge stars fill as beams hit." (89 characters). Hidden until met. | Drift `:271-272` regexes updated to the new text; inventory `:97` literal; 90-character cap still holds; flag-on grid case. |
| switch | Heading "Wrap gate" becomes "Switch" (D1). Text: "A Switch is the pale tile with a dashed ring. Walk onto it to open a hidden wrap." (81 characters). Hidden until met. | Drift `:298` `/dashed ring/` still matches; the test title at `:275` names "Switch"; inventory `:98` literal; flag-on grid case. |
| locked gate | Heading stays "Shard" (D3). Text becomes the card body: "Take the shards in order. The star stays locked until you do." The row already shows only when met. | Hazard row text pin; the 16-row grid (`:529`) is unchanged in count. |
| pulse gate | None. Row `hazard-gate` text is already the card body. | None. |
| level-1 (section 8) | Resolving `first-run-coach` moves it out of `LEGACY_GUIDE_PENDING_ROWS`; the goal-line fix changes the hint. | Drift `:122` pending ids; `:72` row order if a row is added; inventory `:106` literal. |

Rule for every card PR: change the Guide row, the drift test, the message inventory and the card in the same PR (one source, R2), and follow `docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md`.

---

## 8. Level-1 guide and Help: today and proposals

What exists today: F22-F25. One device-scoped control hint at L1, a 12-row Guide that shows wrap and Switch rows from L1, and nothing else in play for levels 2-10. Items 1-3 and 5 are proposals whose look is picked on the level-1 options page (page B, slice 9); item 4 is decided.

Proposals (copy and behaviour only; looks come from a later options page):

1. **Fix the goal mismatch** (F25): the hint says "Reach the twin stars to clear the maze." to match the Goal row and the board.
2. **L1 goal coach mark:** after the control hint is dismissed, a coach mark on the twin stars, "Reach these". This is the `first-run-coach` pending row's job, and it resolves that pending entry (an owner decision, F24).
3. **Trail tip by touch:** on the first step back over the player's own trail, the notice "Step back to wipe your trail." It fires once, no coach mark, priority 5, and it shares the per-level cap.
4. **Guide shows what you have met (decided, D9):** wrap and Switch rows hidden until met, plus the Help "All tips" link (section 7). Still open, for the options page: an optional small "New" marker on rows met since the Guide was last opened.
5. **"Show tips again"** action at the foot of the Guide: it removes this account's `mazer.firsttime.seen.v1` record (the same effect as a progress reset has on cards under D7), not the level-1 device hint. Useful for players and QA. It goes through the same scoped storage, so it is a no-op in preview.
6. **Help vs Guide:** Guide stays the glossary ("How to play"). Help (support, rating, contact) stays separate, as in the feedback-rating spec (memory, 2026-11-25; not re-read in repo).

---

## 9. Build slicing

Ordered slices. Each one is a single PR, independently shippable behind a flag whose build default is off. Each carries its tests and a Playbook verify result, and is merged only when CLEAN with all checks green on the exact head. New tests go in folders CI already runs whole (F28). No slice touches the database. Scene glue goes in new modules, with at most a one-line hook in `MenuScene.ts` (Wave 5C).

**Two options pages come first** (Zac's standing rule: a live options page before any UI change, built from the real app UI, not mocks):
- **Page A, card look:** needed before slice 2, and the pick applies to slices 2, 3, 7 and 8. It reuses the shards-lane in-flow notice (`src/ui/notice/inFlowNotice.ts`) and coach mark (`src/render/coachMarkView.ts`) as they are, on real preview boards (`?previewLevel=10`, `22`, `200`). Variants cover notice position, coach-mark label and timing (the R3 move-dismiss delay for touch cards). The new card is not a new component; it is the shards-lane look, so the shard hint and the first-time cards match.
- **Page B, level-1 guide and Guide:** needed before slice 4 (where the "All tips" link and the hidden rows sit) and slice 9 (tutorial visuals). It covers the L1 goal coach mark, the trail tip, the Guide with hidden rows, the optional "New" marker, the "All tips" link and "Show tips again".

| # | Slice | Flag | Files | Tests | Options page | Depends on |
|---|---|---|---|---|---|---|
| **0** | **Preview leak fix (F15). Ships first, on its own.** The level-1 control hint must not read or write device storage on a `?previewLevel` route. `installLegacyControlHint` returns a no-op when `isLegacyLevelPreviewRoute(win.location.search)` (`legacyLevelPreview.ts:97`) is true. | none: it is a bug fix that changes behaviour only in preview | `src/render/legacyControlHintOverlay.ts` (`:55-62`); `src/boot/main.ts:277` only if the check is passed in instead | `tests/legacy-runtime/legacy-control-hint.test.ts`: with `?previewLevel=1`, a spy storage sees zero `getItem`/`setItem`, and no hint element is added; without the param, behaviour is unchanged | none | nothing |
| 1 | **Foundation, no UI.** Flag (P5), registry tokens and priorities, the pure touch-to-card state machine (S1-S5), the seen and met store (P1-P3) with guest merge, and the reset clear (P4, D7). | `?lab=firsttime` | new `src/legacy-runtime/legacyFirstTimeFlag.ts`, `legacyFirstTimeCards.ts`, `legacyFirstTimeStore.ts`; `src/tutorial/tutorialAckStore.ts` (optional `storageKey`, default unchanged); `src/legacy-runtime/legacyProgressionResetFlow.ts` (`:110-127`) | new `tests/tutorial/first-time-cards.test.ts` and `first-time-store.test.ts` (test plan items 1, 3, 4); `tests/tutorial/tutorial.test.ts` (default key unchanged); `tests/reset/legacy-progression-reset-flow.test.ts` (new key base in the `:99-107` list; reset removes `mazer.firsttime.seen.v1:<scope>` and leaves `mazer.tutorial.acks:device`) | none | nothing |
| 2 | **Card host and the wrap card.** Glue that feeds touch events to slice 1 and shows the notice and coach mark through the shards-lane host; the wrap-step touch event; the Guide `wrap` row text. | `?lab=firsttime` | new `src/legacy-runtime/legacyFirstTimeHost.ts`; one hook in `src/scenes/MenuScene.ts` where a move is applied (wrap resolution `legacyMaze.ts:508-546`, exact hook fixed at build); `src/legacy-runtime/legacyGuideContent.ts` (`wrap` row) | host test with a fake notice host (fires once, caps hold, flag off draws nothing and reads no storage); preview no-write (item 5); drift `:271-272` and inventory `:97` | **Page A first** | slice 1; shards-lane notice and coach mark on `main` |
| 3 | **Switch card and rename (D1).** Touch = the gate going from unlit to triggered (`isLegacyBleedGateTriggered`, F18); coach mark on the opened border cell. Guide heading "Wrap gate" becomes "Switch", with the new text. | `?lab=firsttime` | `legacyFirstTimeHost.ts`, `legacyFirstTimeCards.ts`, `legacyGuideContent.ts` (`bleed-gate` row `:187-201`) | trigger fires on the first trigger only; drift `:275`/`:298`; inventory `:98` | Page A (done) | slice 2 |
| 4 | **Guide hide until met, plus the Help "All tips" link (D9).** | `?lab=firsttime` (flag off: sheet unchanged) | `legacyGuideContent.ts` (`buildLegacyGuideSheetModel` `:398-411`); new read module for the met set; the Guide call site `MenuScene.ts:12367`; the Help tab, or the Guide foot until Help lands | drift: flag-off pins unchanged, flag-on cases (10 base rows, plus wrap, plus Switch, `showAll`); `legacy-guide-sheet-plan.test.ts:60` height; after a reset the rows hide again | **Page B first** (link placement) | slice 1 (met set); slices 2-3 so that met can become true |
| 5 | **Hidden-path mask (D8).** `maskLegacyBleedGatedCells` and the masked `createLegacyMazeHazardGraph` (section 3, K3). | `?lab=hazards` (the hazard layer is already off for players) | `src/legacy-runtime/legacyHazardGraphAdapter.ts` (`:32-35`, `:49-73`); shards-lane `legacyShardRun.ts` (passes `bleedGates`) | new `tests/reset/legacy-shard-hidden-path-solvability.test.ts` (the 81 levels, K3 steps 1-6); the mask helper unit test; the mismatch helper against the masked grid | none | shards lane `legacyShardRun.ts` on `main` |
| 6 | **Manifest v2 and curve A (D4).** The shard entry moves from 60 to 100, plus the lock-chance layer (salt `0x4c4f434b`) in the allocator. This is a generation change; the shards lane may own it. | `?lab=hazards` | `src/mazer-core/hazards/schedule.ts` (version `:29`, entries `:34-39`, allocator `:198-247`); shards-lane `legacyShardHint.ts` (`resolveShardFirstLevel` follows the schedule) | schedule and allocator tests; a golden of the lock levels (102, 106, 108, 110, 115, ... and 100% from 283); an assertion that lock levels intersected with Switch-placeable levels equal slice 5's 81-level constant | none | slice 5 (so no v2 level ships the clash) |
| 7 | **Locked-gate card.** Touch = first shard pickup or first step onto the locked star; absorbs the shard-lane hint (R5). | `?lab=firsttime` + `?lab=hazards` | `legacyFirstTimeHost.ts`; shards-lane `legacyShardHint.ts`; `legacyGuideContent.ts` (`hazard-shard` row text) | trigger and coach mark on the next untaken shard; `introsShown: ['shard']` counts as seen; the hazard intro card for `shard` is null while cards are on | Page A | slices 2 and 6 |
| 8 | **Pulse Gate card.** Touch = first move next to a Pulse Gate; HAZ-008 intro card suppressed for registry-owned kinds (R5). | `?lab=firsttime` + `?lab=hazards` | `legacyFirstTimeHost.ts`; `src/legacy-runtime/legacyHazardOnboarding.ts` (intro card path `:125-173`) | the intro card for `pulseGate` is null while cards are on; the card fires once | Page A | slice 2 |
| 9 | **Level-1 tutorial visuals** (section 8, items 1-3 and 5): goal-line fix, L1 goal coach mark (resolves the `first-run-coach` pending row), trail tip, "Show tips again". | `?lab=firsttime` | `src/legacy-runtime/legacyControlHint.ts`; `legacyFirstTimeHost.ts`; `legacyGuideContent.ts` (pending rows `:347-363`) | inventory `:106`; drift `:122`; trail tip fires once and shares the per-level cap; "Show tips again" removes only the seen record | **Page B first** | slices 1-2 |
| later | **Account sync** of the seen set (section 6). Documented, not built (D6). | n/a | n/a | test plan item 9 | none | Zac's yes at that time, plus the read-only U4 check |

**Turning a slice on for players** (flipping a build default) is its own later step after a phone check. It is not part of any slice above.

---

## 10. Test plan

Pure unit tests (vitest, no browser) land with each slice, in folders CI runs whole (F28). The slice column in section 9 says which items each slice carries.

1. **Registry:** ids unique, priorities unique, copy 90 characters or fewer, every card names an existing Guide row id, `validateTutorialRegistry` passes.
2. **Touch triggers (D5):** each mechanic's touch event (shard pickup or locked-star step, move next to a Pulse Gate, Switch trigger, wrap step) fires its card once. A mechanic on the board but never touched fires nothing, at any level, veterans included. No card fires at a level start. Flag off gives nothing and reads no storage (spy storage, zero calls).
3. **Stacking:**
   - one card per level (S1), with priority only for a same-step tie;
   - session cap 2 with deferral, and the deferred card fires at the next touch in a later level;
   - a touch deferred by a cap still marks the mechanic met (S7);
   - S5 (a card cut off under 800 ms is not acked);
   - the **L200 fresh-account script** from section 5, step by step, including the veteran who never touches a Switch.
4. **Persistence:** ack after dismiss (R3) only; user/guest scopes separate; guest-to-user union; corrupted or throwing storage falls back to memory and never throws; revision bump re-shows; the key is `mazer.firsttime.seen.v1:<scope>` and the tutorial store's default key is unchanged.
5. **Reset clears (D7):** after `applyLegacyProgressionResetLocalEffects`, the account's seen and met record is gone, the other scope's record and `mazer.tutorial.acks:device` are untouched, and the next touch fires the card again.
6. **Preview no-write:** with the scene's preview storage, a full card run leaves a spy `window.localStorage` untouched (zero `setItem`). Slice 0 adds the same test for the control hint.
7. **Absorb (R5):** with cards on, the hazard intro card for `pulseGate`/`shard` is null. `introsShown: ['shard']` counts as seen for `mechanic.locked-gate`.
8. **Guide (D9):** flag off, the sheet equals `LEGACY_GUIDE_ROWS` and every existing pin holds. Flag on: wrap and Switch rows hidden until met, shown once met, hidden again after a reset; `showAll` returns every row; updated regexes and literals; 90-character cap; grid and sheet-height pins for each case.
9. **Hidden-path solvability (D8):** the 81-level test in section 3, K3 (steps 1-6, including the negative control).
10. **Cadence pin (slice 6):** the first Switch levels (22, 24, 28, 29, ...) and the band counts above; the lock list (102, 106, 108, 110, 115, ...) and 100% from 283; the lock-and-Switch intersection equals the 81-level constant.
11. **Account sync (later):** the payload includes `firstTimeSeen`; the fingerprint changes with it; a merge never lowers a revision; an old-shape payload (key missing) does not wipe local; a reset clears the remote key.

Headless browser checks per card (phone-shot, chrome + webkit, Read every PNG). Cards fire on touch, so each check scripts moves to the mechanic on a preview board, not just a page load:
- `?lab=firsttime&previewLevel=10`, walk through a wrap (wrap);
- `=22`, step onto the Switch (Switch);
- hazards lab plus first-time lab, `previewLevel=10`, move next to a Pulse Gate (Pulse Gate; how two lab flags combine in one URL is fixed at build);
- `=102`, take a shard (locked gate, after slice 6);
- `=200`, the stacking case from section 5.
Real-phone check stays under "Not verified" until Zac does it.

---

## 11. Questions: resolved

All ten questions from revision 1 are answered by Zac (section 0, D1-D10). Nothing blocks slice 0 or slice 1.

Left for the build, not for Zac unless he wants a say:
- the R3 move-dismiss delay for touch cards, and the optional "New" marker on Guide rows (options pages A and B);
- whether hunters follow a lit wrap (hazard lane, K3);
- where the "All tips" link sits until the Help tab lands (section 7).

## 12. Not verified

- No build, test run, browser or phone check (docs-only lane).
- Real-board placement rates below L140 (U1, U2).
- Shard placement on real boards and target reachability (U3).
- Live DB settings constraints (U4).
- The F15 preview leak is read from source, not reproduced.
- The 81-level list comes from the two hash rolls and the wrap formula, not from real boards. How many of those boards actually place a Switch and shards, and how often the mask moves a shard, are not measured (the slice 5 test reports both).
- The Help tab is not on `main` at 9219c82d; the "All tips" link placement depends on it landing.
- The shards-lane modules (F16) are still uncommitted in their worktree. Slices 2, 3, 5, 7 and 8 wait for them on `main`.
