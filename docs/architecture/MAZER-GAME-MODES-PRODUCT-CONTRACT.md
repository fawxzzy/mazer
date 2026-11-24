# Mazer Game Modes Product Contract (lane L11, 2026-11-19)

Status: product contract plus a shell. It names the game today "Endless", adds a mode registry and a one-tab leaderboard strip, and proposes (never applies) a database column. It adds no new mode, no obstacle, no enemy, no route and no flag, and nothing about how Endless plays changes. It grants no merge, deploy, database, provider, credential or DNS authority.

Amended 2026-11-23 (design) and 2026-11-24 (build, MAZER-MODE-002): sections 8 to 13 add the mode-select sheet that opens after Play, what is per-mode versus global, the lossless move of today's single-mode saves into Endless, the plug-in procedure for the next mode, the locked slot style, and a data-model sketch. As of 2026-11-24 the sheet IS built (Stack layout, Endless plus one plain locked "More soon" slot) and the owner picks are recorded in section 13; the per-mode storage and database parts (sections 10 and 12) are still design only and nothing in them is applied. Sections 1 to 7 are unchanged except where marked "(amended)".

Owner decisions recorded (Zac, 2026-11-18/19, lane plan `MAZER-LANES-2026-11-18`, section L11 and "Decisions from Zac"): the current gameplay becomes Endless with all progression preserved; obstacles and enemies stay out of Endless and get their own future mode (set up only, do not build); the leaderboard gets one tab per mode; the leaderboard `mode` column is approved IN PRINCIPLE, the exact scratch-tested SQL is shown before any apply; existing scores become Endless.

## 1. What a mode is

A **game mode** is a named way to play with its own rules, its own progression ladder and its own leaderboard tab. A mode is real only when it is in the registry (`src/legacy-runtime/legacyGameModes.ts`, `LEGACY_GAME_MODES`). The registry is the only list of modes: tabs, score-to-mode mapping and the fallback read it, nothing duplicates it.

- **Registered** = playable and shown as a tab. Today: `endless`.
- **Reserved slot** = a documented place for a future mode, in `LEGACY_RESERVED_GAME_MODE_SLOTS`. Not playable, no tab, not accepted as a mode id, no route, no flag, no code. Today: `hazards`.
- A mode is not the launch mode (`?mode=play` / `menu` in `legacyLaunchMode.ts` only says whether the app opens on the menu or straight into play). It is also not the hazard lab (`?lab=hazards`, which stays as it is).
- Adding a mode is a deliberate source change with its own card: registry entry, its rules, its ladder, its tab, its tests, its Guide copy.

## 2. What Endless guarantees

Endless is today's game, unchanged:

- Generated ladder with no upper level limit, strict "every level harder than the last" through geometry saturation, frozen board size and zoom, tile style B Chip, the dark neon look.
- Every account's level, rank letter, target complexity, completed cycles, checkpoints and receipts are preserved as they are. Nothing is migrated, reset or recomputed. The level a player has is their Endless level.
- No obstacles and no enemies in Endless. The hazard layer remains the dormant lab behind `?lab=hazards` (default off); this contract does not move it, and its own flip needs the owner's sign-off as before.
- The menu demo AI and Level Preview use the Endless ladder.
- A client that does not know about modes, and a database that has no mode column, behave exactly as Endless.

## 3. How scores map to modes

- A score is `player_level` on the player's progression row, ranked by `player_level desc, level_reached_at asc nulls last, user_id asc` (unchanged).
- **Every existing score becomes Endless.** There is no per-score rewrite: a row with no mode, and any response that carries no mode, is Endless (`resolveLegacyScoreMode`, which also maps an unknown value to Endless).
- The Endless tab uses the existing leaderboard calls (`mazer_leaderboard_page`, `mazer_leaderboard_self_rank`), which rank Endless by definition. The client sends no mode field and reads no mode field today (pinned by `tests/reset/legacy-game-modes.test.ts`), so the shell is safe to merge and deploy with or without the database column.
- Proposed database side (NOT applied, owner approval of the exact sha256 required, see `docs/ops/sql-proposals/mazer-leaderboard-mode-20261119/README.md`): an additive `mode text not null default 'endless'` column on the progression table, so every existing row is Endless, plus an index and the two existing leaderboard functions restricted to `mode = 'endless'`. The progression row is keyed by account alone today, so it holds exactly one score per account. A second mode that needs its own score per account needs a key change or its own table, and a mode-aware function; that decision belongs to the card that builds the second mode, not to this one.

## 4. Leaderboard tabs

One tab per registered mode, in registry order, shown under the `Back to Menu` row whenever a board (or its loading, empty or failure state) is the body. The signed-out and username-gate bodies replace the whole board and carry no tabs. Today there is one display-only `Endless` chip, selected. It is not a switch; interactive tabs (44 px hit areas, a selected-mode state, one request per mode) arrive with the second mode. The Guide does not describe the leaderboard's contents, so its copy is unchanged.

## 5. The future hazards slot

Obstacles and enemies become their own mode (working name `hazards`), with their own ladder and leaderboard tab, and never run inside Endless. Reserved here only. This supersedes, for the build order, the assumption in `MAZER-HAZARD-PRODUCT-CONTRACT.md` that hazards enter the one ladder at fixed levels; the signed hazard contract is not edited here, and its vocabulary, fairness and schedule work stand as the design for that future mode. Reconciling the two documents is the first task of the card that builds the mode.

## 6. Out of scope here (amended)

Any second mode, any database apply, any change to ranking or rank letters, the hazard lab. The mode-select sheet is built (MAZER-MODE-002, section 8); per-mode storage (section 10) and the database column (section 12) are still not built or applied.

## 7. Evidence (headless; nothing checked on a real phone)

`tests/reset/legacy-game-modes.test.ts` (registry, reserved slot unreachable, tab shell in each body, layout, no mode field in requests), the existing leaderboard view/plan/fixture tests, and a phone-emulated screenshot of the Leaderboard sheet.

## 8. Mode-select flow (built 2026-11-24, MAZER-MODE-002)

- Order: sign-in gate, main menu, **Play** (the START button and the tap-to-play prompt both go through one hook, `requestLegacyPlayStart` in `MenuScene.ts`), then the **mode-select sheet**, then the chosen mode's run. Back to Menu is always present and closes the sheet with no state change.
- The sheet lists the registry modes in registry order, then one plain locked slot (section 11). Endless is the first and only playable entry today. The sheet is shown even while Endless is the only mode (owner decision, section 13 Q1); there is no auto-start of the last mode (Q3).
- Each entry shows the mode name, one plain tagline and that mode's own stats (Endless: Level and Rank, read from the existing progression, never written by the sheet).
- Choosing Endless closes the sheet and starts the run through the existing `START_RUN` path, so progression, checkpoint, outbox and leaderboard behave exactly as before.
- Keyboard: Enter on the menu is the keyboard Play button and opens the sheet (same hook as a tap). In the sheet, Enter starts the selected playable entry, or the only playable entry when the selection is locked; Escape closes the sheet (the standard back action).
- Input guard: taps on Play, the cards, the Play/Back buttons and Enter are ignored for 250 ms (`LEGACY_MODE_SELECT_INPUT_GUARD_MS`) after the sheet opens and after it closes, so a double-tap on Play cannot land on the Endless card and a double-tap on Back cannot re-open the sheet. Escape is not guarded.
- Documented exemptions (they do not open the sheet and start Endless directly): the `?mode=play` boot shortcut, the QA/diagnostics start hooks (`startRun` and the QA overlay start command), the level-preview jump (it picks a level of the one Endless ladder), and in-run restarts. Every player-facing Play path (tap anywhere, the Play button, Enter) goes through the sheet.
- Code: pure layout plan and item model in `src/legacy-runtime/legacyModeSelectPlan.ts`; overlay kind `'mode-select'` in `legacyOverlayRouting.ts`; a thin scene painter in `MenuScene.ts`. Tests: `tests/reset/legacy-mode-select-plan.test.ts`, `tests/architecture/mode-select-flow-contract.test.ts`.

## 9. Layout (decided 2026-11-24: A Stack now, flips to C Tiles past 3 entries)

Three layouts were prototyped as real app UI on a throwaway branch (never merged) and compared on the options page `docs/ops/MAZER-MODE-SELECT-OPTIONS-2026-11-23.html`. The owner delegated the pick; the decision:

| Option | What it is | Taps to start Endless | Scales to | Status |
|---|---|---|---|---|
| A Stack | One card per mode; tap a playable card to start it. The locked slot sits below, muted. | 1 | up to 3 entries | **Built; in use up to 3 entries** |
| C Tiles | 2-column grid of tiles, a detail strip for the selected mode, a Play button. | 2 (tile, Play) | 8 or more modes | **Built in the plan module; used automatically past 3 entries** |
| B Pager | One large panel with arrows and dots, plus a Play button. | 1 | about 5 modes | Dropped: hides modes behind arrows and scales worst |

The variant is chosen by entry count only (`resolveLegacyModeSelectVariant`: Stack for 3 or fewer entries, Tiles above), so adding the next mode is a list change and the flip to Tiles needs no rewrite. Entries counted are playable plus locked.

## 10. Per-mode versus global data

| Item | Scope | Notes |
|---|---|---|
| Level, rank letter, target complexity, completed cycles | Per mode | Endless keeps today's values untouched |
| Best score (`player_level`, `level_reached_at`) | Per mode | One row per (account, mode) once a second mode needs its own score (section 12) |
| Leaderboard | Per mode | One tab per registered mode (section 4) |
| Saves: run checkpoint, completion outbox, receipts | Per mode | See `MAZER-ENDLESS-CHECKPOINT-STORE.md` and `MAZER-OFFLINE-SYNC-CONTRACT.md`; a mode id is added to the entry, absent means Endless |
| Achievements | Per mode, plus an account-wide total | No achievement system exists in code today; when one is added each achievement declares its mode or "any" |
| Account, username, sign-in session | Global | Unchanged |
| Settings (toggles, control mode, sound, dark mode, floating anchor) | Global | A mode may later declare a mode-only setting; none today |
| Cosmetics (player, trail, tile style, future shop) | Global | Owned once, usable in every mode |
| Last chosen mode | Global | Convenience only; never read for ranking |

Rule: if a value changes how a score is earned or ranked it is per mode; if it changes how the app looks or sounds, or who the player is, it is global.

## 11. Locked and coming-soon slots (amended 2026-11-24)

- One plain locked slot is drawn after the playable modes: same size as a playable card, muted colors, a padlock, the name **More soon** and the line "New modes land here". It does **not** name Hazards or any future mode (owner decision, Q4); `hazards` stays in the reserved list in `legacyGameModes.ts` and is never shown.
- It has no Play action (a Stack locked card is not tappable; the Tiles Play button reads "Locked", disabled, secondary tone) and it never starts anything, shows a leaderboard tab or writes data.
- Copy makes no promise of a date or of what a mode will contain.
- A slot becomes a playable entry only when its card adds the mode to the registry (plug-in procedure below), which also needs a tagline in `LEGACY_MODE_SELECT_TAGLINES` (a test pins this).

## 12. Data-model sketch (NOT applied, NOT built)

Local save keys (browser storage). Today every key is auth-scoped as `<base>:user:<id>` (for example `mazer.progression.v1:user:<id>`).

- Endless keeps its **legacy keys as they are** and they mean Endless forever: `mazer.progression.v1`, `mazer.endless-checkpoint.v1`, `mazer.remote-completion-outbox.v1` and `mazer.remote-account-sync.v1`. No rename, no copy, no delete.
- A new mode stores its own state under a mode-suffixed key: `<base>:user:<id>:mode:<modeId>` (for example `mazer.progression.v1:user:<id>:mode:hazards`). Global keys (`mazer.game-toggles.v1`, `mazer.dark-mode.v1`, `mazer.floating-anchor.v1`, and a new `mazer.last-mode.v1`) are not mode-scoped.
- One helper (working name `resolveModeStorageKey(base, userId, modeId)`) owns this shape, returns the legacy key for `endless`, and is the only code that builds a mode key. Unknown mode ids resolve to Endless, matching `resolveLegacyScoreMode`.

Server (Supabase, `mazer` schema). `mazer_progression_states` has `user_id` as its primary key, so it holds one score per account.

- **Phase 1 (proposed, scratch-tested, NOT applied): MODE-001.** Additive `mode text not null default 'endless'` column with a check and an index; the two leaderboard functions restricted to `mode = 'endless'`. Every existing row is Endless with no data rewrite. Files: `supabase/migrations/20260828170000_mazer_leaderboard_game_mode.sql` (apply), and in `docs/ops/sql-proposals/mazer-leaderboard-mode-20261119/`: `rollback.sql`, `README.md`, `scratch-test/`. This amendment does not change those files.
- **Phase 2 (sketch only, decided by the second-mode card):** a second mode that needs its own score per account should use a separate table keyed `(user_id, mode)` with mode-aware write and leaderboard functions, leaving the live primary key and the Endless row alone. Changing the live key loses to the separate table on rollback safety. Not drafted as SQL and not tested.
- Completion payloads gain an optional `mode` field (absent means Endless); `rulesetId` stays per ruleset.

Re-run evidence for phase 1 on 2026-11-23, current main `56043a17`: the pinned `@electric-sql/pglite@0.5.13` scratch test passed 27 of 27, 0 failed. Tested file hashes (LF bytes): apply sha256 `b597fc5b57662d054a39bbcfc7b792fa83d193dceb70d2312526c3f9be529644`, rollback sha256 `38530b2fedc8081e1269003bc4bc0efcfd490a06d94d76cf10a3e52495162443`. Not applied to any live database; the fresh live preimage read, independent review and the owner box naming the sha256 are still to do.

### Lossless migration of today's single-mode saves

1. Nothing is moved or rewritten. Existing local keys and server rows are read as Endless by definition (legacy key means Endless; column default is `'endless'`).
2. A client that does not know about modes keeps working against the same keys and rows; a mode-aware client reads the same keys for Endless. Old and new clients can interleave on one account.
3. Client code that reads both shapes ships before any SQL; the SQL, if and when applied, is additive, and its rollback restores the previous function bodies and drops only the column, check and index.
4. Before any apply: `tests/reset/legacy-game-modes.test.ts` plus a new storage-key test proving a mode-less account resolves to the legacy keys and that level, rank and checkpoint read back identical.

### Plug-in procedure for the next mode

One card per mode, in this order: (1) move its id from the reserved list into `LEGACY_GAME_MODES` with name, tagline and Guide copy; (2) its rules and ladder module; (3) its storage keys through `resolveModeStorageKey`; (4) its server table and functions (own SQL change process, owner box); (5) its leaderboard tab becomes interactive; (6) its mode-select entry turns from a locked slot into a playable one; (7) tests for each step and a phone-emulated capture. The hazards mode additionally needs the reconciliation named in section 5.

## 13. Decisions recorded (owner delegated the picks, 2026-11-24: "get it all done, make ur best choices")

- Q1. Show the sheet while Endless is the only mode? **Yes**, shown after Play every time (the owner asked for it).
- Q2. Layout? **A Stack now**, **C Tiles** automatically past 3 entries; B Pager dropped (section 9).
- Q3. Auto-start the last chosen mode? **No.** Play always opens the sheet; the "last mode" convenience in section 10 stays unbuilt.
- Q4. Named locked slot? **No.** A plain "More soon" slot only; Hazards is not named anywhere in the UI.
- Q5. Achievements? **Per mode, with one account-wide total.** Design only; no table, column or UI is added by this change.
- Still open (not asked of the owner yet): when the second mode's card starts, the per-mode storage shape (section 10) and the leaderboard `mode` column apply (MODE-001 SQL proposal) are decided and applied in that card, not here.

## 14. Evidence for sections 8 to 13 (headless emulation; nothing checked on a real phone)

Built in MAZER-MODE-002 (branch `claude/mode-select-20261124`). Playwright flow in Chromium and WebKit, default and dark-mode themes, 390x844, 360x640 and 768x1024: tap Play opens the sheet, Back to Menu closes it, tap Endless starts play, no console errors; the sheet itself changes no progression, checkpoint or outbox storage key (only the generic `mazer.cycle-telemetry.v1` counter moves, as for any overlay). Captures live under the ATLAS scratch folder `tmp/phone-shot/mode-select-20261124`. The fresh fixture account has no saved progression, so captures show Level 1, Rank E. Not checked: a real iPhone, safe areas, a signed-in real account with progress, the Tiles layout on screen (it is covered by plan tests only), any database.
