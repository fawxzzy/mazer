# Mazer Game Modes Product Contract (lane L11, 2026-11-19)

Status: product contract plus a shell. It names the game today "Endless", adds a mode registry and a one-tab leaderboard strip, and proposes (never applies) a database column. It adds no new mode, no obstacle, no enemy, no route and no flag, and nothing about how Endless plays changes. It grants no merge, deploy, database, provider, credential or DNS authority.

Amended 2026-11-23 (lane "mode select", DESIGN ONLY): sections 8 to 13 add the mode-select menu that opens after Play, what is per-mode versus global, the lossless move of today's single-mode saves into Endless, the plug-in procedure for the next mode, the locked slot style, and a data-model sketch. The mode-select sheet is NOT built in this repo state: three layout options exist only as a flag-gated prototype branch (section 9) for the owner to pick from, and the pick is still open. Sections 1 to 7 are unchanged except where marked "(amended)".

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

Any second mode, any database apply, any change to ranking or rank letters, the hazard lab. The mode picker and per-mode storage that this section used to exclude are now designed (sections 8 to 12) but still not built: the build belongs to its own card after the owner picks a layout (section 9) and answers section 13.

## 7. Evidence (headless; nothing checked on a real phone)

`tests/reset/legacy-game-modes.test.ts` (registry, reserved slot unreachable, tab shell in each body, layout, no mode field in requests), the existing leaderboard view/plan/fixture tests, and a phone-emulated screenshot of the Leaderboard sheet.

## 8. Mode-select flow (amended 2026-11-23, DESIGN ONLY)

- Order: sign-in gate, main menu, **Play** (the START_RUN button and the tap-to-play prompt both go through one entry point), then the **mode-select sheet**, then the chosen mode's run. Back to Menu is always present and always closes the sheet with no state change.
- The sheet lists the registry modes in registry order, then locked slots (section 11). Endless is the first and only playable entry today.
- While Endless is the only playable mode the sheet is a deliberate extra tap. Whether to ship it before the second mode exists, or to skip straight into Endless until then, is an owner decision (section 13, Q1). The launch flag `?mode=play` (straight into play) keeps skipping the sheet; deep links never land on it.
- Each entry shows the mode name, one plain tagline and that mode's own stats (Endless: Level and Rank). Nothing global is shown inside an entry.
- Choosing a mode starts that mode's run exactly as Play does today. The chosen mode id is remembered as the "last mode" (a global convenience, section 10) and nothing else changes.
- The sheet is a pure plan module plus a scene painter in the same pattern as the other overlays; it is added in a new `src/legacy-runtime/*` module (Wave 5C: no new behavior inside `MenuScene.ts` beyond a thin hook).

## 9. Layout options (owner picks one; NOT built)

All three were built as real app UI behind `?modeSelectPreview=A|B|C` on a throwaway prototype branch (`claude/modes-proto-20261123`, never merged) and captured in the real Phaser canvas, light and dark, Chromium and WebKit emulation. The options page is `docs/ops/MAZER-MODE-SELECT-OPTIONS-2026-11-23.html`.

| Option | What it is | Taps to start Endless | Scales to | Weakness |
|---|---|---|---|---|
| A Stack | One card per mode; tap a card to start it. Locked cards sit below, muted. | 1 | about 4 modes | Becomes a scroll list after about 4 entries |
| B Pager | One large mode panel with arrows and dots, plus a Play button. | 1 (Play) when Endless is first | about 5 modes | Hides the other modes behind arrows and dots |
| C Tiles | 2-column grid of tiles, a detail strip for the selected mode, a Play button. | 2 (tile, Play) | 8 or more modes | Needs two taps even for the only playable mode |

Recommendation: **A Stack now**, and move to **C Tiles** when the mode count passes 3 entries (playable plus locked). A is the fewest taps while the list is short and reads like the existing menu sheets, and the plan module is data-driven so the move to C is a variant swap, not a rewrite. B loses: it hides modes behind arrows and scales worst.

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

## 11. Locked and coming-soon slots

- A reserved slot (today `hazards`, plus a generic "More soon" placeholder) is drawn as a card or tile of the same size as a playable one, with a padlock glyph, muted colors, the label "Coming soon" and a one-line neutral tagline.
- It has **no Play action** (the button reads "Coming soon", disabled, secondary tone) and it never starts anything, shows a leaderboard tab or writes data.
- Copy makes no promise of a date or of what the mode contains beyond the registry tagline. The slot states that Endless progress is unaffected.
- A slot becomes a playable entry only when its card adds it to the registry (plug-in procedure below); the reserved list and the registry never both contain the same id.

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

## 13. Open questions for the owner

- Q1. Show the mode-select sheet while Endless is the only playable mode, or skip straight into Endless until the second mode is real?
- Q2. Layout pick: A Stack (recommended), B Pager or C Tiles; and whether to auto-switch to C past 3 entries.
- Q3. Once more than one mode is playable, should Play auto-start the last chosen mode with the sheet reachable from a "Modes" menu entry?
- Q4. Show a named locked slot (`Hazards`) before its mode is committed, or only a generic "More soon"? The prototype shows both.
- Q5. Achievements are not built; confirm they should be per mode with an account-wide total.

## 14. Evidence for sections 8 to 13 (headless; nothing checked on a real phone)

Prototype branch `claude/modes-proto-20261123` (flag-gated, default off, never merged): `src/legacy-runtime/legacyModeSelectPlan.ts`, a thin `MenuScene.ts` hook and `tests/reset/legacy-mode-select-plan.test.ts` (18 tests: five phone viewports per layout with 44 px targets and no overflow, locked Play disabled, flag parser). Headless click flow in Chromium: Play opens the sheet, Back to Menu closes it, choosing Endless starts play, in all three layouts. Captures in Chromium and WebKit, light and dark, with labelled sample stats (Level 37, Rank C) because local progression fails closed to Level 1 for a fresh fixture account. Not checked: a real iPhone, safe areas, any signed-in real account, any database.
