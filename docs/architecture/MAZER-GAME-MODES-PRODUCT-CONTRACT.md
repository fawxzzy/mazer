# Mazer Game Modes Product Contract (lane L11, 2026-11-19)

Status: product contract plus a shell. It names the game today "Endless", adds a mode registry and a one-tab leaderboard strip, and proposes (never applies) a database column. It adds no new mode, no obstacle, no enemy, no route and no flag, and nothing about how Endless plays changes. It grants no merge, deploy, database, provider, credential or DNS authority.

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

## 6. Out of scope here

Any second mode, mode switching UI, a mode picker on the menu, per-mode progression storage, any database apply, any change to ranking or rank letters, the hazard lab.

## 7. Evidence (headless; nothing checked on a real phone)

`tests/reset/legacy-game-modes.test.ts` (registry, reserved slot unreachable, tab shell in each body, layout, no mode field in requests), the existing leaderboard view/plan/fixture tests, and a phone-emulated screenshot of the Leaderboard sheet.
