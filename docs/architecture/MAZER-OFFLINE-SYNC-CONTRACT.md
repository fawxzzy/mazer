# Mazer Offline Sync and Conflict Contract (Draft)

Status: DRAFT, unsigned (section 7 fixtures, 7A coverage matrix and 7B offline flush added 2026-11-12 under MAZER-DATA-004; nothing else in this draft changed)
Date: 2026-11-05
Base: `origin/main` at the commit this branch was cut from (`1670c8af`)
Board card: `mazer-offline-first-play-sync-and-conflict-contract` (state `open`, priority high, 0 percent, "Planning admission"; "No remote write or schema work is authorized by this card.")

This document inventories what the offline/sync layer does today, then proposes the contract for extending it. Section 2 is read from source and tests. Sections 3 to 8 are proposals. Nothing here changes code, schema, or provider state; any server-side change it implies is PROVIDER-GATED and needs the owner's explicit approval in the live thread.

Labels, never merged: **DOCUMENTED FACT** (verified in this repo at the base above), **EXTERNAL EVIDENCE** (outside the repo; none is relied on here), **PROPOSAL**.

## 1. Card requirements

**DOCUMENTED FACT** (from the archived board file, last edited 2026-09-02; see `docs/ops/MAZER-BOARD-RECONCILIATION-2026-11-05.md`)

- Work breakdown: define local checkpoint, progress, inventory, receipt and sync-outbox ownership; idempotency, ordering, retry, conflict, acknowledgement rules; bounded offline entitlement grace; player-safe sync status and recovery.
- Next actions: inventory current local storage and remote receipt behavior; choose a hierarchy for checkpoint, coin, inventory, and verified-run conflicts.
- Acceptance: offline completion and resume work without network; reconnect cannot lose valid later checkpoints or duplicate coins/items; outbox items are idempotent and diagnosable.
- Proof plan: offline/reconnect/duplicate/reordered fixtures and restart recovery.

## 2. What exists today (inventory)

All DOCUMENTED FACT unless marked otherwise.

### 2.1 Local storage (browser)

Keys defined in `src/` (string literals; the account-scoped ones are suffixed per user by `createLegacyAuthScopedStorage` in `src/legacy-runtime/legacyAuth.ts`, which maps a base key to `<baseKey>:<scope>`):

| Key (base) | Owner | Contents |
| --- | --- | --- |
| `mazer.progression.v1` | `legacyProgression.ts` | Player and AI-runner tracks (level ordinal as a decimal string, completed cycles, target complexity, peak complexity, clean/struggle cycles, best time, last receipt id, last completed time), baseline versions, `updatedAt` |
| `mazer.remote-completion-outbox.v1` | `legacyRemoteProgression.ts` | Pending completion entries (version 1) |
| `mazer.remote-account-sync.v1` | `legacyRemoteProgression.ts` | Per-account sync metadata: last observed progression revision, `progressionUpdatedAt` marker, settings revision and fingerprint |
| `mazer.cycle-telemetry.v1` | `mazeCycleTelemetry.ts` | Local run receipt history used for exact gap recovery |
| `mazer.game-toggles.v1` | `legacyGameTogglePreferences.ts` | Game toggle/control preferences (guest and account-scoped) |
| `mazer.auth.*` | `legacyAuth.ts`, OAuth modules | Remembered identity, OAuth pending/quarantine/probe, mutation epochs |
| `mazer.watch-pass.preferences.v1` | `src/settings/preferences.ts` | Watch-pass preview preferences only; never authoritative for anything |
| `mazer.menu.*` | menu/diagnostics code | Layout, input, surface-state and diagnostics snapshots |

Findings from that search:

- No coin, inventory, or entitlement key exists. Those do not exist in source yet (see `docs/research/MAZER_ECONOMY_AND_ENTITLEMENT_CONTRACT_DRAFT.md`).
- No persisted mid-maze run checkpoint was found: no key stores in-progress board state or player position. An attempt that is not completed is not restored by reload. (Absence found by key search only; see UNKNOWN.)
- Guests keep progress locally only; the hydration tests state that guest progress is ignored when signing in to an account (`tests/reset/legacy-remote-progression.test.ts`, "reloads the selected account after sign-in, still ignoring guest progress entirely").

### 2.2 Local progression storage and migrations (`src/legacy-runtime/legacyProgression.ts`)

- Baseline versions: `LEGACY_PROGRESSION_PLAYER_BASELINE_VERSION = 5`, `LEGACY_PROGRESSION_AI_BASELINE_VERSION = 3`. A stored save with a lower version is rebased on read (the read path compares each baseline version to the constant and rewrites).
- Local anti-tamper: a browser-only provenance sentinel (an impossible `struggleCycles` value reserved for the player track at baseline v5) marks a save as having a trusted lineage. Untrusted saves fail closed to Level 1. Impossible ordinals (a level that exceeds completed cycles plus one) also fail closed. This is the guard added after the 2026-08-23 progression incident described in the hazard contract draft.
- Ordinals are canonical unsigned decimal strings (lossless beyond `Number.MAX_SAFE_INTEGER`), compared with `compareLegacyProgressionOrdinals`.
- Storage writes return success/failure; callers treat a failed write as "still pending".

### 2.3 Completion outbox and monotonic merge (`src/legacy-runtime/legacyRemoteProgression.ts`)

- An accepted completion is turned into an outbox entry containing `clientRunId` (UUID), `completedAt`, `completedLevel`, `mazeSeed`, `mazeSize`, a bounded `receipt`, `rulesetId` (`legacy-v1` or `endless-v1`), recipe fields, and `surface` (`play` or `menu-demo`). `enqueueRemoteCompletion` is idempotent by `clientRunId`: a second enqueue of the same id returns the existing outbox.
- The outbox is persisted with a read-back verification (the writer re-reads and compares entry order and ids before reporting success). A failed durable write leaves the entry pending; the sync metadata `progressionUpdatedAt` marker is cleared whenever anything is pending or failed, so an unsynchronised state can never look synced.
- Server calls (`mazer_complete_level` for the player track with `p_expected_revision`; `mazer_complete_ai_level` for the AI track; `mazer_reset_progression`; `mazer_initialize_progression`). Direct table writes for completions and cycle receipts are retired and fail closed (`writeLegacyRemoteCycleReceipt`, `writeLegacyRemoteProgressionState`).
- Server idempotency: `supabase/migrations/20260822000100_mazer_endless_completion_rpc.sql` requires `p_client_run_id` (raises `22023` if null) and a unique index on `(user_id, client_run_id)` in `mazer_cycle_receipts` (`20260822000000_mazer_endless_progression_foundation.sql`) enforces one receipt per run id per account. The RPC advances level, cycles, target complexity (+4, clamp 400), rank and color tier server-side; the client does not send those.
- Replay (`replayLegacyRemoteCompletions` then `flushLegacyRemoteCompletionOutbox`):
  1. Read the player and AI rows; re-read local state and outbox after every awaited remote call, and union rather than replace (a completion appended during an await is never dropped).
  2. If the local track is ahead of the remote with no covering outbox entries, derive the exact missing chain from local telemetry receipts (`deriveExactRemoteCompletionRecovery`), prepend it in sequential order, and dedupe by run UUID. Anything it cannot prove exactly stays held and is reported, never invented.
  3. For each entry, compare its `completedLevel` to the server cursor: `next` (equal) is submitted; `gap` (greater) is deferred; `lower` is removed only after an authenticated own-row lookup in `mazer_cycle_receipts` proves that exact `client_run_id` was accepted (`proveRemoteCompletionReceiptAccepted`); an unproven lower entry is kept durably and does not block the valid chain.
  4. A `40001` (revision conflict) on a player completion triggers one cursor refresh and one retry.
  5. After each accepted entry the server row is merged into local state and the entry is removed; if the removal write fails the loop stops and the entry stays pending (it will be retried with the same run id, which the server dedupes).
  6. Final metadata records the last revision; `progressionUpdatedAt` is set only when there is no error and the outbox is empty.
- Monotonic merge: `mergeLegacyProgressionStateAdvancements` merges track-by-track with maximum for level and completed cycles (lossless ordinals), `cleanCycles`, `peakComplexity`, `struggleCycles`, `targetComplexity`, minimum for `bestCompletionTimeMs`, and takes the remaining fields from the most recently completed track. A stale device therefore cannot lower visible progress.
- The `ruleset_id` is limited to `legacy-v1` and `endless-v1`; unknown ids are dropped on read.

### 2.4 Authoritative hydration (`docs/ops/MAZER-AUTHORITATIVE-PROGRESSION-HYDRATION-2026-08-27.md`)

- Own-row Supabase progression is authoritative evidence: a coherent remote row lacking the browser sentinel is accepted (when the player level does not exceed completed cycles plus one) and stamped with the sentinel before caching, so later offline reads keep it. Untrusted local saves still require the sentinel. Impossible remote ordinals still rebase to Level 1. Obsolete difficulty above the earned ceiling is clamped while server-proven level and cycles are kept. The change did not alter authentication, RLS, completion ordering or leaderboard ranking.
- A related AI-row fix is in the 2026-10-12/13 history (authoritative AI progression hydration; menu AI paused until account access resolves). It is visible in `git log` and was not re-read in detail for this draft.

### 2.5 Settings and revisions

- `mazer_profiles.settings` is the canonical cross-device game-toggle/control row. `revision` on progression and profile rows is a monotonic optimistic-concurrency guard; normal advancement can rebase forward once after a conflict; destructive replacement or reset refuses to overwrite a newer revision. A scoped local sync envelope records the last observed revision and local fingerprints so local advancement reconciles without resurrecting an accepted reset (`docs/MAZER_SUPABASE_STORAGE.md`).
- Applied status of the migrations in a live project is UNKNOWN from the repo alone.

### 2.6 Tests that pin the current behavior

`tests/reset/legacy-remote-progression.test.ts` (selected, by title): "retains one exact completion UUID across failure and replay beyond Number.MAX_SAFE_INTEGER"; "keeps an accepted receipt pending when durable clear fails, then retries the same run id once"; "keeps sync metadata pending when a local completion retry receipt cannot be persisted"; "reconstructs the exact proven 59-to-64 cloud gap as five idempotent completions"; "refreshes the remote cursor before repairing a gapped outbox and converges exactly once"; "unions a completion appended while remote refresh is awaiting and never returns regressed local state"; "returns fresh local progress and every live receipt when a post-await remote read fails"; "preserves an unproven stale UUID without letting it block a valid multi-device completion chain"; "preserves a stale UUID when exact acceptance proof fails without blocking the valid cursor"; "never regresses pending account progress across reload and sign-out/sign-in hydration"; "keeps pending local level 30 over remote level 17 on cold bootstrap even when stale metadata says synced"; "discards a deferred completion result after the authenticated account changes"; "fails closed instead of directly PATCHing a completed-run advancement". `tests/reset/legacy-progression.test.ts` covers the rebase and sentinel behavior (for example "rebases a versioned but impossible player level before it can unlock late-game hazards").

These tests were located and read by title. They were not executed in this docs-only session.

### 2.7 Gaps against the card

- No coin, inventory, or entitlement state to reconcile yet.
- No local mid-attempt checkpoint to resume.
- No player-facing sync status model beyond `completionSyncState` (`idle`, `pending`, `synced`), `pendingCompletionCount`, and a `playerMessage` field on the sync result.
- No documented rule for what offline play is permitted when entitlement exists.

## 3. Conflict hierarchy (proposal)

When two sources disagree about the same account, the higher tier wins and lower tiers are derived or reconciled around it.

1. **Verified run** (a completion the server accepted: a receipt row keyed by `(user_id, client_run_id)` plus the server-computed track). Immutable and idempotent. It is the only tier that can advance the level ordinal, completed cycles, target complexity, rank, or leaderboard position. Local state may be ahead (pending) but is never authoritative over an accepted run.
2. **Checkpoint** (Endless in-attempt or durable-progress marker, once defined; the meaning of "checkpoint" is an open owner decision, see the hazard contract draft). Monotonic by `(level, checkpoint index)`: a later valid checkpoint is never replaced by an earlier one. A checkpoint can never lower, or substitute for, a verified run.
3. **Coin** (cosmetic currency). An append-only event ledger of grants and spends, each with a client-generated event id. The balance is derived from the ledger, never stored as an absolute that devices overwrite.
4. **Inventory** (owned and selected cosmetics, items). Owned set is derived from grant, draw and spend events (set union by event id). Selection state is a per-account preference, last-writer-wins by revision, and never affects ownership.

Rationale. Higher tiers carry integrity or competitive weight and must not be derivable from lower, more tamper-prone tiers. Lower tiers are cosmetic and can be rebuilt from events. This also matches the card's rule that no transaction directly changes rank or leaderboard authority.

Per-tier merge rules:

- Verified run: merge by union on run id; the existing monotonic track merge stays as is.
- Checkpoint: take the maximum; ties resolved by the server revision.
- Coin: union of events by id; recompute balance; sort by per-account sequence then event time. If recomputation would make the balance negative, the latest unfundable spend events are held (not applied) and flagged for support or retry, and earlier grants are never discarded.
- Inventory: owned = union; a duplicate grant event for an already-owned item resolves per the economy contract's duplicate policy exactly once (guarded by the event id).

## 4. Outbox idempotency rules (proposal)

Extends the existing run outbox; the existing behavior in section 2.3 is preserved.

1. Every outbox entry has a client-generated UUID (`clientEventId`; for completions this is the existing `clientRunId`), an event `kind`, a schema `version`, and an account scope. Entries are stored only in the account-scoped key.
2. Enqueue is idempotent by id. Replaying the same id any number of times has exactly the same effect as once.
3. Ordering. Completions are applied in strict sequential level order per track (existing `next/gap/lower` classification). Coin and inventory events carry a per-account monotonic sequence assigned at enqueue; the server (when it exists) accepts out-of-order delivery by sequence and applies each id once.
4. Removal only after proof. An entry is removed only after the server response is merged into durable local state, or an exact acceptance lookup proves the id was accepted. A failed durable local write keeps the entry.
5. Unprovable entries are kept, never dropped and never blindly resubmitted out of order; they are surfaced as a held state.
6. Bounded size and age: a maximum entry count and a per-entry schema version, with a defined player-safe message when exceeded. Numbers are UNKNOWN (owner/engineering decision).
7. Diagnosability: the existing counters (`pendingCompletionCount`, `recoveredCompletionCount`, last error) extend to each event kind, redacting private data.
8. Account change: a deferred result is discarded when the authenticated account changes (existing behavior, pinned by test).

## 5. Reconnect behavior (proposal)

1. Offline play always works for gameplay and for local progression; completion enqueues and local state advances immediately.
2. On reconnect or sign-in: hydrate the authoritative row first; merge monotonically; then repair gaps; then flush entries sequentially (existing order). Never replace durable local state with a pre-await snapshot (existing rule).
3. A cursor conflict (`40001`) retries once after refresh; a second failure leaves entries pending with a player-safe retry message.
4. A reordered or duplicated delivery must produce the same final state as in-order single delivery (an invariant for the fixtures in section 7).
5. Sync status shown to the player: `synced`, `pending (n)`, `held` (unprovable or gap), `error (retryable)`; wording is a design decision. Never show raw backend text (consistent with the auth-gate card).

## 6. Entitlement offline grace (proposal)

- A signed, server-issued entitlement lease is cached with an expiry after each successful online verification; offline play is allowed while the lease is valid; offline play never extends or mints a lease; a backward clock step is detected against the last server time seen.
- When the lease expires offline, the player sees a reconnect-to-continue state. Local progress and the outbox remain intact and sync after reconnect. Nothing is deleted.
- The grace duration and lease format are owner decisions; the lease issuance is PROVIDER-GATED. Details are in `docs/research/MAZER_ECONOMY_AND_ENTITLEMENT_CONTRACT_DRAFT.md`.

## 7. Test and proof plan (proposal)

Fixtures, each runnable without a network by injecting a fake client (the existing tests already inject `clientOverride` and `MemoryStorage`):

1. Offline completion, process restart, resume: state and outbox survive; no network calls.
2. Reconnect flush: exactly one server call per entry; final state equals the in-order case.
3. Duplicate delivery of the same id: no double advance, no double coin or item.
4. Reordered delivery: same final state.
5. Storage failure (quota/blocked) at each write: entries stay pending; metadata never claims synced.
6. Multi-device: two devices complete different levels; monotonic merge keeps the higher; the lower chain is proven or held.
7. Account switch during an await: deferred result discarded.
8. Coin ledger: union of two devices' events yields the same balance regardless of order; unfundable spend is held; duplicate draw event resolves the duplicate policy once.
9. Entitlement: expired lease offline blocks play but preserves data; backward clock rejected; offline can never create an active entitlement.
10. Hydration regression: the Level 110 and impossible Level 99 payloads from the 2026-08-27 hydration doc keep their documented outcomes.

Real-environment proof (NOT VERIFIED until performed): airplane-mode behavior on real iOS and Android browsers and installed PWAs, background-tab storage eviction, and multi-day offline. These cannot be proven by unit tests; see the browser matrix in `docs/architecture/MAZER-PWA-STRATEGY-AND-BROWSER-MATRIX.md`.

### 7A. Coverage matrix (2026-11-12, **DOCUMENTED FACT**, verified by running the files named)

Legend: **covered** = a test asserts the whole fixture; **partial** = the core is asserted but one named part is not; **missing** = no test; **not buildable** = the objects the fixture needs do not exist in `src/`.

Proof file added by MAZER-DATA-004: `tests/reset/legacy-remote-progression-proof-fixtures.test.ts`. It drives the real outbox and `replayLegacyRemoteCompletions` with an injected fake server (modelled on `20260822000100_mazer_endless_completion_rpc.sql`: a duplicate run id is a no-op, a stale revision is `40001`, a wrong level is `22023`) and an in-memory storage that can throw or silently drop writes. Existing file: `tests/reset/legacy-remote-progression.test.ts`.

| # | Fixture | Status | Tests (file: title) |
| --- | --- | --- | --- |
| 1 | Offline completion, restart, resume | covered | proof: "keeps three offline completions in order with zero server calls, and survives a restart"; "after a restart the reconnect flush sends each run exactly once and lands on level 4"; "a flush cut short by a dropped connection resumes after restart without re-sending the accepted run". Existing: "retains one exact completion UUID across failure and replay beyond Number.MAX_SAFE_INTEGER". A restart is simulated by copying the durable key/value map into a fresh storage object, not by a real page reload. |
| 2 | Reconnect flush, one server call per entry | covered | proof: "after a restart the reconnect flush sends each run exactly once ..." (three `accepted` calls, one per run). Existing: "reconstructs the exact proven 59-to-64 cloud gap as five idempotent completions"; "refreshes the remote cursor before repairing a gapped outbox and converges exactly once"; the three MAZER-FLOW-009 flush tests (7B). |
| 3 | Duplicate delivery of the same id | covered for completions; the coin and item half is not buildable | proof: "completing the same run twice keeps one outbox entry and the server advances once"; "a response lost after the server accepted the run is settled by the exact receipt lookup, not re-sent"; "replaying a fully flushed outbox again is a no-op with no server calls"; "an outbox that already holds the same run id twice submits it once"; "a throwing clear after the server accepted keeps the entry pending, then the retry is a duplicate and advances nothing". Existing: "keeps an accepted receipt pending when durable clear fails, then retries the same run id once". |
| 4 | Reordered delivery converges to the in-order state | covered, with one finding (below) | proof: "a reverse-ordered outbox is repaired from the local receipt history and equals the in-order state in one replay"; "a reverse-ordered outbox without local receipts never over-advances and holds as pending, not synced"; "a reverse-ordered outbox flushed directly (no recovery pass) converges in at most three flushes with no duplicate or out-of-order accept". |
| 5 | Storage failure at each write; metadata never claims synced | covered for enqueue, clear and metadata writes | enqueue: "a throwing outbox write at enqueue keeps the completion unsynced ..."; "a silently dropped outbox write at enqueue (no exception) is caught by the read-back ...". clear: "a throwing clear after the server accepted ..."; "a silently dropped clear (no exception) is caught by the read-back ...". metadata: "a throwing sync-metadata write while the entry is pending never makes the result claim synced"; "a throwing sync-metadata write after the server accepted still reports the server-confirmed state, with a marker that bootstrap reads as unsynced". Also "after every storage failure clears, the next healthy replay delivers the run once and marks synced". Existing: "keeps sync metadata pending when a local completion retry receipt cannot be persisted". Not covered: a failure of the local progression write (`mazer.progression.v1`), which is outside the outbox. |
| 6 | Multi-device: higher wins, lower chain proven or held | partial | Existing: "preserves an unproven stale UUID without letting it block a valid multi-device completion chain"; "preserves a stale UUID when exact acceptance proof fails without blocking the valid cursor"; "merges first-contact device progress without lowering a newer canonical track"; "never lets a stale higher completion count lower either visible progression track". Missing: two live fake clients completing different levels against one fake server in a single test. |
| 7 | Account switch during an await | covered | Existing: "discards a deferred completion result after the authenticated account changes"; "never regresses pending account progress across reload and sign-out/sign-in hydration". |
| 8 | Coin ledger | **not buildable** | No coin or inventory object exists in `src/`. Recorded as `test.todo` in the proof file. |
| 9 | Entitlement offline grace | **not buildable** | No entitlement object exists in `src/`. Recorded as `test.todo` in the proof file. |
| 10 | Hydration regression (Level 110 coherent row, impossible Level 99) | partial | Existing: "hydrates a coherent production-shaped historical row instead of rebasing it to Level 1" (Level 110); `legacy-progression.test.ts`: "still rejects impossible player progression from an authoritative remote row". The literal Level 99 three-cycle payload from the 2026-08-27 hydration doc is not asserted by that number. |

How CI runs these. `npm test` globs `tests/reset`, but the CI workflow `.github/workflows/verify.yml` does not run `npm test`: it lists test files by name. The step "Verify progression, RPC, leaderboard, and UI boundaries" now lists the new proof file next to `legacy-remote-progression.test.ts`, so the fixtures run on every PR.

**Finding (reported, not fixed; this card adds proof fixtures only).** In `deriveExactRemoteCompletionRecovery`, the branch for a cloud row still at level 1 with no receipt boundary takes `surfaceReceipts.slice(0, localBoundaryIndex + 1)`. Local telemetry is newest first and the local boundary is the newest receipt (index 0), so that slice holds one receipt however many completions were made. With two or more offline completions, a lost outbox and a fresh cloud row, recovery is therefore held with "Local play telemetry does not exactly cover the progression gap" instead of rebuilding the chain. Nothing is lost (local progress and receipts stay and the run is reported as held, never invented), so the effect is a stuck-pending sync, not corruption. The failing expectation is recorded as `test.skip` "rebuilds a multi-completion chain from local receipts when the cloud row is still at level 1 and the outbox is lost". Probable fix: `slice(localBoundaryIndex)`, taking every receipt from the local boundary to the oldest. A single-completion case passes today only because the one-element slice happens to be exact.

Behaviour the fixtures pin (observations, not changes):
- A reordered outbox converges in one replay only when local receipts let recovery re-derive the sequential order (existing entries are deduped by run id, so `recoveredCompletionCount` is 0). Without receipts it is held as pending with an error and nothing is submitted out of order. Flushing a reversed outbox directly (the completion path, no recovery pass) takes up to one flush per entry because each pass defers gapped entries.
- A response lost after server acceptance is settled in the same flush: the cursor refresh shows the entry is below the server level, and the own-row receipt lookup proves the exact run id before the entry is removed.
- A failed sync-metadata write is swallowed by design (it is a cache). A stale marker cannot equal the new local `updatedAt`, which `bootstrapLegacyRemoteAccountState` treats as unsynced and merges monotonically.

### 7B. Offline flush (MAZER-FLOW-009, **DOCUMENTED FACT**)

`src/legacy-runtime/legacyOfflineCompletionFlush.ts` is a pure helper (no Phaser, no Supabase). `MenuScene.installLegacyOfflineCompletionFlush` injects the event target (`window`), the online probe (`navigator.onLine !== false`), the flush call (`replayLegacyRemoteCompletions`) and the notifier, and skips installation in level-preview sandboxes. Behaviour:

1. On the browser `online` event it runs one flush. A flush already running defers a single re-run after it ends, so replays never overlap.
2. The flush is the replay in section 2.3. If the authenticated account or hydration sequence changed during the await, the scene discards the result (`isLegacyRemoteCompletionContextCurrent`) and the helper receives `null`.
3. Every completion result is passed to `noteCompletionResult`. When the completion is not synced, work is pending and the browser is offline, the player gets one message per outage: "You are offline. Progress is saved on this device and will sync when you reconnect." Further offline completions in the same outage do not repeat it.
4. When a flush returns `synced` with zero pending and an outage notice was shown, the player gets one message, "Back online. Saved progress synced.", and the notice re-arms for the next outage. A failed or throwing flush leaves the notice armed and the outbox durable; the next completion, boot or `online` event retries.
5. `dispose()` removes the listener and stops further notices.

Tests: `tests/reset/legacy-remote-progression.test.ts`, describe "MAZER-FLOW-009 offline completion flush": "flushes the outbox on the online event and announces the outage once"; "does not announce while online and re-arms the notice for the next outage"; "keeps the outage notice armed when the online flush fails and survives a throwing flush". Not tested: the `MenuScene` closure (the discard-on-account-change branch) and a real `online` event in a real browser.

Running the fixtures: `npx vitest run tests/reset/legacy-remote-progression-proof-fixtures.test.ts tests/reset/legacy-remote-progression.test.ts` (also part of `npm test` and of the CI step named in 7A). Section 7A was verified on 2026-11-12 by running those two files; see the PR for the results.

## 8. Provider-gated / out of scope

Any new Supabase table, column, RPC, or migration (coin ledger, inventory, entitlement lease, sequence tracking), any apply to a live project, any payment or store step, any Vercel environment change. None is authorized or started by this document.

## Decisions needed from the owner

1. Approve the hierarchy: verified run > checkpoint > coin > inventory (and the per-tier merge rules).
2. Define "checkpoint" for the Endless attempt (completed level versus in-maze waypoint) and whether mid-attempt resume is a requirement.
3. Whether coin and inventory events need a server ledger (PROVIDER-GATED) or may remain local-first with later server reconciliation.
4. Outbox bounds (entry count, age) and the player-facing sync status wording.
5. Entitlement grace duration and lease approach.
6. Whether guest-to-account progress transfer is wanted (today guest progress is ignored on sign-in).
7. Which real-device sync proofs are required before release.

## UNKNOWN

- Whether the live Supabase project has the documented migrations applied as written.
- Whether any mid-attempt state is persisted by a path the key search did not reveal (for example in-memory only, or through a non-literal key).
- Server-side behavior under concurrent completions beyond what the migrations and tests show.
- Storage eviction and quota behavior on real iOS/Android browsers.
- Numeric bounds (outbox size, age, grace duration).
- Real-device behaviour of everything in section 7B (airplane mode, the `online` event on iOS and Android browsers and installed PWAs).
