# Mazer first-time cards: spec (2026-11-26)

Status: SPEC, docs only. No app code, no flag flip, no DB change in this PR.
Base: `origin/main` 8aaf0af7 (Merge PR #727). Every `file:line` below is from that tree unless it names another worktree.
Owner decisions this spec follows: Zac, 2026-11-26 (relayed in the lane brief). Visual picks come later through a live options page; nothing here picks a look.

Tags used on facts: **[measured]** = I ran it (scratch script, output quoted); **[prior-measured]** = another session ran it on real boards, raw output on disk; **[read]** = read from source, not run; **[UNKNOWN]** = not established.

---

## 1. Vocabulary

| Zac's word | Code name | What the player sees | Guide row today |
|---|---|---|---|
| Gated tiles | wrap corridors / bleed-off paths (`legacyBleedPaths.ts`, `wrapStats`) | open edges you walk off and come back on the far side | `wrap`, heading "Wrap" |
| (no name yet) | bleed gate (`legacyBleedGates.ts`, Gate D "Pulse ring") | pale tile with a dashed ring; stepping on it opens a hidden wrap | `bleed-gate`, heading "Wrap gate" |
| Locked gates | shards (`src/mazer-core/hazards/shards.ts`) | end star stays locked until the shards are taken in order | `hazard-shard`, heading "Shard" (hazard layer only) |
| Pulse Gate | hazard `pulseGate` | a gate that opens and shuts on a beat | `hazard-gate`, heading "Pulse Gate" (hazard layer only) |

**Name proposal for the pulse-ring tile: "Switch".** Reasons: it says what the tile does (step on it, a wrap switches on); it is one plain word; it avoids a fourth "gate" next to Pulse Gate, locked gate and the "Wrap gate" heading. Runners-up: "Beacon" (fits the glow, says nothing about the effect), "Key tile" (suggests something you carry). Zac picks (Q1).

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

### 2.3 Existing "seen" and onboarding machinery

- F11 [read] Hazard intro cards (HAZ-008) mark `introsShown` in the local exposure record `mazer.hazard-exposure.v1`. The key is auth-scoped by the scene and is "never part of the account settings JSON" (`src/legacy-runtime/legacyHazardOnboarding.ts:38-39, 125-173`; `src/mazer-core/hazards/exposure.ts:1-60`). Only `pulseGate` is a live kind (`legacyHazardOnboarding.ts:45`). The card text IS the Guide row (`legacyHazardOnboarding.ts:107-110`). The card shows 4500 ms; the first move dismisses it (`:48`).
- F12 [read] The tutorial registry and ack store exist:
  - `TutorialToken {id, trigger: account-created | first-occurrence{event}, repeat, revision, order, copy}` (`src/tutorial/tutorialRegistry.ts:9-26, 51-61`);
  - acks live under `mazer.tutorial.acks:<encoded accountId>` (`src/tutorial/tutorialAckStore.ts:8, 72`).
  - The only user today is the level-1 control hint, token `level-1.controls`, stored with the fixed account id `device` (`src/legacy-runtime/legacyControlHint.ts:10-13`; `src/render/legacyControlHintOverlay.ts:62`).
- F13 [read] A progress reset never clears `mazer.tutorial.acks` (`src/legacy-runtime/legacyProgressionResetFlow.ts:110-120`).
- F14 [read] Level Preview (`?previewLevel=N`) swaps in in-memory storage (`src/legacy-runtime/legacyLevelPreview.ts:1-20, 138-148`; `src/scenes/MenuScene.ts:2515`). `resolveBrowserLocalStorage()` returns it while preview is active (`MenuScene.ts:15130-15132`). Hazard onboarding reads storage only through that method (`MenuScene.ts:11010-11022`), so preview cannot write the exposure record.
- F15 [read] **Preview leak (existing, not run in a browser):** the control hint is installed from boot with `window.localStorage` directly (`src/boot/main.ts:277`; `legacyControlHintOverlay.ts:48-62`), with no preview check. `?previewLevel=1` should therefore show the hint and write `mazer.tutorial.acks:device` to the real device. Small, but it breaks "preview writes nothing". Fix proposed in section 9 (PR-H).
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
  - The pending rows are `first-run-coach` (an owner decision) and `auto-pause` (`legacyGuideContent.ts:347-363`).
- F25 [read] Copy mismatch: the Goal row says "Reach the spinning twin stars" (`legacyGuideContent.ts:115`); the level-1 hint says "Reach the star".
- F26 [read] What the drift test pins (`tests/reset/legacy-guide-content-drift.test.ts`):
  - the row id order (`:72`) and the pending ids (`:122`);
  - the wrap text, by regex (`:271-272`), and the Switch text, by `/dashed ring/` (`:298`);
  - every row 90 characters or fewer (`:510-513`);
  - the glossary grid: 12 rows fill 3 lines, all 16 fill 4 (`:529`).

---

## 3. Locked-gate curve

**Proposal A (recommended): locked-gate chance is 0 below 100. It is 30% at 100, rising linearly to 100% at 283, and holds at 100% from 283.**
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
- **K3 (clash, hidden wrap):** from 100 to 282, 81 levels carry both a Switch and a lock [measured, by hash]. Shard placement treats the hidden path as open (F10). So a shard can land on a cell the player cannot see until the Switch is lit, or the proven route can rely on it. Fix options, shards lane:
  1. Recommended: treat hidden cells as walls for placement and the verdict, so a hidden path can only shorten things once lit.
  2. Never roll a lock on a Switch level before 283. This cuts lock share by about 75% in 140-282.
  - Not measured: how often (1) changes a placement.
- **K4 (watch):** shard solvability (`src/mazer-core/hazards/shardSolvability.ts`) was not re-run here. A only changes WHICH levels carry shards, not the band or the verdict.

---

## 4. Card registry

The four live cards, plus the existing level-1 hint, kept as is:
- Each card is the pair Zac picked: an **in-flow notice** (the shards-lane `inFlowNotice`) plus a **coach mark** (`coachMarkView`).
- All copy is 90 characters or fewer, to match the Guide cap.
- Every card is **once per account**, at revision 1. A revision bump re-shows a changed card (F12).

| id | Mechanic | Priority (1 = first) | Trigger: on board | Trigger: on touch | Notice copy (title / body / action) | Coach mark anchor / label | Guide row |
|---|---|---|---|---|---|---|---|
| `mechanic.locked-gate` | Locked gate (shards) | 1 (mandatory) | level start, shard count > 0 | first bump on the locked star | "New" / "Take the shards in order. The star stays locked until you do." / "Got it" | shard 1 / "Take this first" | `hazard-shard` |
| `mechanic.pulse-gate` | Pulse Gate | 2 (on route) | level start, live gate specs > 0 | first block by a shut gate | "New" / "Gates open and shut on a beat. Wait for the gap, then go through." / "Got it" | first gate on the solution route / "Wait for the gap" | `hazard-gate` |
| `mechanic.switch` | Switch (pulse-ring tile) | 3 (optional) | level start, `bleedGates.length > 0` | first step onto the tile | "New" / "A pale tile with a dashed ring hides a wrap. Walk onto it to open it." / "Got it" | the Switch tile / "Step here" | `bleed-gate` |
| `mechanic.wrap` | Gated tiles (wrap) | 4 (optional) | level start, at least one VISIBLE wrap (an ungated path from `listBleedPaths` minus gated keys) | first wrap step | "New" / "Open edges wrap: walk off one to come back on the far side. Edge stars fill as beams hit." / "Got it" | the border cell of the nearest visible wrap (by walking distance from start) / "Open edge" | `wrap` |
| `level-1.controls` (existing) | Controls | 0 | level 1 | n/a | unchanged (F22) | none | `move` |

Rules:

- **R1 First interaction, never a fixed level.**
  - A card is a candidate on the first level start where its mechanic is on the board for this account and its id is not acked.
  - A wrap hidden behind an unlit Switch does not count as on the board for `mechanic.wrap`.
  - The on-touch trigger only fires a card that was deferred (section 5) and not yet shown. It shows the notice without a coach mark, because the player is already on the spot.
- **R2 One source of copy.**
  - The card body is the Guide row text, as hazard intro cards already do (`legacyHazardOnboarding.ts:107-110`).
  - Where today's Guide text reads badly in a card ("Later mazes ..."), change the Guide row, not the card (section 7).
- **R3 Ack moment.**
  - The card is marked seen when it is dismissed: "Got it", the first move at least 800 ms after it showed, or the 4500 ms timeout.
  - If the app dies while a card is up, the card shows again next time. That is acceptable.
- **R4 Coach mark lifetime.** The coach mark stays until the player reaches the anchor, the notice is dismissed plus 4 s, or the level ends, whichever comes first. Reduced motion: the ring holds still (already in `coachMarkView`).
- **R5 Absorb the old paths.**
  - While first-time cards are on, hazard onboarding's own intro card (F11) is suppressed for `pulseGate` and `shard`, so no card shows twice.
  - `introsShown` stays as the generation and Guide input.
  - The shards-lane first-shard hint becomes the `mechanic.locked-gate` entry. Its "seen" is read as `acked OR introsShown.includes('shard')`, so nobody sees it twice across the migration.

---

## 5. Stacking and catch-up

- **S1 At most one card per level start.** Of the candidates on this board, pick the lowest priority number (table above): mandatory before on-route before optional. Ties cannot happen (each priority is unique).
- **S2 At most one coach mark on screen,** and only with its own notice.
- **S3 Session cap: 2 cards per app session** (one launch until the tab closes). The level-1 control hint does not count toward the cap. Cards past the cap are deferred, never dropped.
- **S4 Deferral.**
  - A deferred card stays unacked and becomes a candidate again at the next level start where its mechanic is on the board, or through its on-touch trigger (R1).
  - Nothing is queued across levels where the mechanic is absent.
  - Above 283 there are no wraps or Switches, so their cards simply never fire there. That is correct: the mechanic is not in the player's game any more.
- **S5 No flash-and-gone.** If the level ends less than 800 ms after the card appeared, it is not acked (R3) and comes back at the next eligible level start. This covers the short early levels.
- **S6 Composes with hazard catch-up** (F7). Hazard kinds are already introduced one per level. Cards ride on top and never add a hazard.
- **S7 The Guide lists everything met** (acked or deferred-but-seen-on-board), so a player who skipped a card can still read it.

Worked case: **an account at L200 that never saw any card** (e.g. a new device, cleared storage, or cards shipped after they passed). Assume the hazard layer is on and the account is past the shard stage.

1. L200 start. The candidates are locked gate (shards placed), Switch (L200 is a gate level and 9/10 seeds place one, M2) and wrap (no: the only wrap is hidden behind the Switch, R1). The card is **locked gate**, with a coach mark on shard 1. The Switch is deferred.
2. During L200, if the player steps onto the Switch: the on-touch trigger would fire, but the level already used its one card, so it stays deferred (S1 wins over the touch trigger).
3. L201 start (it rolls a gate). The candidates are Switch, plus Pulse Gate if live. The card is Pulse Gate if live, otherwise Switch. That is session card 2.
4. The session cap is hit. The next app session continues with Switch, then wrap: wrap fires when a lit Switch's wrap is first used (on touch) or on a later level with a visible wrap. Above 140, wraps exist only on Switch levels (measured above), and the kept wrap is assumed to be the gated one, so wrap usually arrives by touch.

Result: four cards over four levels or two sessions, never two at once, mandatory first.

**Backfill (open, Q5):** wraps and Switches have been live for players for a long time, while Pulse Gates and locked gates were never live (F9). Recommendation: when the feature first runs for an account whose progression level is past a mechanic's first level by 20 or more, pre-ack `mechanic.wrap` and `mechanic.switch` only. Veterans have already used them, and nobody has met Pulse Gates or locked gates. This is a suppression rule, not a level trigger.

---

## 6. Persistence design

**Where progress lives today:**
- level progress is account-synced (F20);
- toggles ride `mazer_profiles.settings` (F21);
- hazard exposure is local and auth-scoped (F11);
- tutorial acks are local, and the control hint is per device (F12).

**Design (PR1):**

- **P1 Store.** Reuse the tutorial ack store (`createTutorialAckStore`) with registry tokens: `trigger: first-occurrence`, `event: mechanic-on-board:<mechanic>`, `repeat: once`, `revision: 1`, `order = priority`. `validateTutorialRegistry` already exists. No new storage format.
- **P2 Scope.** `accountId` = `user:<id>` when signed in, `guest` otherwise (the same scope string as `createLegacyAuthScopedStorage`, `src/legacy-runtime/legacyAuth.ts:1081-1095`). On sign-in, merge the guest acks into the user acks as a union with max revision, so signing up does not re-show cards. The level-1 hint stays per device: input is a device fact; mechanics are account facts.
- **P3 Storage handle.** Always obtained through the scene's `resolveBrowserLocalStorage()` (F14), never `window.localStorage`. Level Preview then lands every ack in the in-memory sandbox, and nothing reaches the device. A preview at L200 shows a brand-new account, which is exactly the stacking case to screenshot.
- **P4 Reset.** Progress reset leaves acks alone (F13), so a reset does not re-teach. Q7 asks whether Zac wants the opposite.
- **P5 Flag.** `?lab=firsttime`, remembered in `mazer.lab.firsttime.v1`, with build default `false`, mirroring `legacyHazardLayerFlag.ts`, plus a live-cards list (like `HAZARD_ONBOARDING_LIVE_KINDS`). Each PR adds its card id to the list. With the flag off, the system holds nothing, reads no storage and draws nothing.

**Account sync (later slice, PR5): NO schema change, NO SQL, client code only.**

- New key inside `mazer_profiles.settings`: `firstTimeSeen: { "<cardId>": <revision> }` (well under 200 bytes).
- The column is a jsonb object with only a `jsonb_typeof = 'object'` check (F21), so the key fits as is (repo migration; U4 live check outstanding).
- Client changes:
  - a picker for the new key next to `pickLegacyGameTogglePreferences`;
  - include it in `createRemoteProfilePayload` (`legacyRemoteProgression.ts:386-393`) and in the fingerprint (`:268`);
  - on pull, merge remote into local as a union with max revision; on write, send the union.
- Risk: an older cached client writes the whole settings object without the key and drops it remotely. Local stays the source of truth and the next new-client write restores it. Worst case: one card re-shows on a new device.
- **Needs Zac:**
  - a yes to have the client write this new key into production profile rows (no DDL, no migration, no RPC change);
  - plus the read-only U4 check before it ships.
  - If Zac prefers a dedicated column instead, that IS a DB change: a migration adding `first_time_seen jsonb not null default '{}'` to `mazer_profiles`, through `docs/ops/MAZER-SQL-CHANGE-PROCESS.md`. It needs his approval of the exact SQL. Not recommended: the jsonb key does the job.

---

## 7. Guide sync (`legacyGuideContent.ts` + `tests/reset/legacy-guide-content-drift.test.ts`)

No card adds a new Guide row. All four already have one. Per card:

| Card | Guide change | Drift test change |
|---|---|---|
| wrap | Row `wrap` text becomes the card body, e.g. "Open edges wrap: walk off one to come back on the far side. Edge stars fill as beams hit." (89 characters; final wording at build). Optionally hide the row until met (Q9). | `:271-272` regexes updated to the new text; 90-character cap still holds. Hiding until met changes the row count, so the 3-line grid pin (`:529`) changes too. |
| switch | Row `bleed-gate` heading "Wrap gate" becomes "Switch" (if Q1 = Switch). Text: "A pale tile with a dashed ring hides a wrap. Walk onto it to open it." (69 characters). | `:298` `/dashed ring/` still matches; the heading assertion, if any, gets updated. |
| locked gate | Row `hazard-shard` text becomes the card body: "Take the shards in order. The star stays locked until you do." The heading stays "Shard" unless Q3 renames it. The row appears once `shard` is a live kind (shards lane). | Hazard row text and the 16-row grid (`:529`) unchanged in count. |
| pulse gate | None. Row `hazard-gate` text is already the card body. | None. |
| level-1 (section 8) | Resolving `first-run-coach` moves it out of `LEGACY_GUIDE_PENDING_ROWS`. | `:122` pending ids; `:72` row order if a row is added. |

Rule for every card PR: change the Guide row, the drift test and the card in the same PR (one source, R2).

---

## 8. Level-1 guide and Help: today and proposals

What exists today: F22-F25. One device-scoped control hint at L1, a 12-row Guide that shows wrap and Switch rows from L1, and nothing else in play for levels 2-10.

Proposals (copy and behaviour only; looks come from a later options page):

1. **Fix the goal mismatch** (F25): the hint says "Reach the twin stars to clear the maze." to match the Goal row and the board.
2. **L1 goal coach mark:** after the control hint is dismissed, a coach mark on the twin stars, "Reach these". This is the `first-run-coach` pending row's job, and it resolves that pending entry (an owner decision, F24).
3. **Trail tip by touch:** on the first step back over the player's own trail, the notice "Step back to wipe your trail." It fires once, no coach mark, priority 5, and it shares the per-level cap.
4. **Guide shows what you have met:** wrap and Switch rows hidden until their card fires or the mechanic is met (like the hazard rows already are), plus a small "New" marker on rows met since the Guide was last opened. Changes the grid pin (F26); needs the options page (Q9).
5. **"Show tips again"** action at the foot of the Guide: it clears this account's first-time acks (not the level-1 device hint). Useful for players and QA. It goes through the same scoped storage, so it is a no-op in preview.
6. **Help vs Guide:** Guide stays the glossary ("How to play"). Help (support, rating, contact) stays separate, as in the feedback-rating spec (memory, 2026-11-25; not re-read in repo).

---

## 9. Build slicing

Each PR is independently shippable behind `?lab=firsttime` (build default off). Each carries tests and a Playbook verify result. The visual look of each card comes from a live options page first (Zac's standing rule).

| PR | Scope | Depends on |
|---|---|---|
| **PR1** | Registry (`src/legacy-runtime/legacyFirstTimeCards.ts`: tokens, priorities, board-fact resolver, stacking S1-S5, pure); ack-store persistence with P2 scopes and guest merge; flag P5; wrap card (`mechanic.wrap`) with notice + coach mark; Guide `wrap` row text and drift test. Scene glue in a new module, not `MenuScene.ts` (Wave 5C). | Shards lane notice + coach mark on `main` |
| PR2 | Switch card + name (Q1) + Guide heading. | PR1, Q1 |
| PR3a | Locked-gate curve A: manifest v2 (shard entry 60 to 100 + chance layer), allocator tests, a determinism golden that pins the lock-level list. Generation change; the shards lane may own it. | Q4 |
| PR3b | Locked-gate card: absorbs the shard-lane hint (R5). | PR1, shards in play, PR3a |
| PR4 | Pulse Gate card: suppress the HAZ-008 intro card for registry-owned kinds (R5). | PR1 |
| PR5 | Account sync of the seen set (section 6). | PR1, Zac yes (Q6), U4 read |
| PR6 | Level-1 and Guide proposals 1-5 (after options-page picks). | PR1 |
| PR-H | Preview leak fix (F15): the control hint skips install, or uses in-memory storage, when `?previewLevel` is present; plus a test. | none |
| PR-B | Backfill suppression (section 5), if Q5 = yes. | PR1 |

---

## 10. Test plan

Pure unit tests (vitest, no browser) land with each PR.

1. **Registry:** ids unique, priorities unique, copy 90 characters or fewer, every card names an existing Guide row id, `validateTutorialRegistry` passes.
2. **Board-fact resolver:** a fixture maze with a visible wrap gives a wrap candidate. A gated-only wrap does not. A Switch, shards and live gate specs give their candidates. Flag off gives nothing and reads no storage (spy storage, zero calls).
3. **Stacking:**
   - one per level (S1);
   - priority order;
   - session cap 2 with deferral, and the deferred card fires at the next eligible level;
   - the on-touch trigger respects S1;
   - S5 (a card cut off under 800 ms is not acked);
   - the **L200 fresh-account script** from section 5, step by step.
4. **Persistence:** ack after dismiss (R3) only; user/guest scopes separate; guest-to-user union; corrupted or throwing storage falls back to memory and never throws; revision bump re-shows; progress reset leaves acks (pin F13).
5. **Preview no-write:** with the scene's preview storage, a full card run leaves a spy `window.localStorage` untouched (zero `setItem`). Add the same test for the control hint in PR-H.
6. **Absorb (R5):** with cards on, the hazard intro card for `pulseGate`/`shard` is null. `introsShown: ['shard']` counts as seen for `mechanic.locked-gate`.
7. **Guide drift:** updated regexes, 90-character cap, grid pins.
8. **Cadence pin (PR3a):** the first Switch levels (22, 24, 28, 29, ...) and the band counts above; the lock list (102, 106, 108, 110, 115, ...) and 100% from 283.
9. **Account sync (PR5):** the payload includes `firstTimeSeen`; the fingerprint changes with it; a merge never lowers a revision; an old-shape payload (key missing) does not wipe local.

Headless browser checks per card (phone-shot, chrome + webkit, Read every PNG):
- `?lab=firsttime&previewLevel=10` (wrap);
- `=22` (Switch);
- hazards lab plus first-time lab, `previewLevel=10` (Pulse Gate; how two lab flags combine in one URL is fixed at build);
- `=102` (locked gate, after PR3a);
- `=200` (the stacking case).
Real-phone check stays under "Not verified" until Zac does it.

---

## 11. Open questions for Zac

1. **Name** for the pulse-ring tile: "Switch" (recommended), "Beacon", or "Key tile"?
2. On-screen word for gated tiles: keep the Guide's "Wrap" (recommended), or use "gated tiles"?
3. Locked-gate heading on screen: keep "Shard" with the notice "The star stays locked ..." (recommended), or rename the row "Locked star"?
4. Curve A (30% at 100 to 100% at 283) and the manifest v2 move of the shard intro from 60 to 100: OK?
5. Backfill: pre-ack wrap and Switch for accounts already 20 or more levels past them (recommended yes)?
6. Sync the seen set to the account through a new key in profile settings (no SQL; the client writes a new key to production rows): yes now, later, or never? Recommended: later (PR5), after PR1-PR2 prove out.
7. Should a progress reset re-show the cards? Recommended no (today's acks survive a reset).
8. Hidden-wrap clash K3: should shards treat hidden cells as walls (recommended), or should locks skip Switch levels before 283?
9. Guide: hide wrap and Switch rows until met, plus a "New" marker (changes the Guide grid; options page first)?
10. Caps: one card per level and two per session: OK?

## 12. Not verified

- No build, test run, browser or phone check (docs-only lane).
- Real-board placement rates below L140 (U1, U2).
- Shard placement on real boards and target reachability (U3).
- Live DB settings constraints (U4).
- The F15 preview leak is read from source, not reproduced.
