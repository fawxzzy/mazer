# Mazer Endless Checkpoint Store

## Status

`src/legacy-runtime/legacyEndlessCheckpointStore.ts` is a pure, versioned (schema v1) store for Endless run, attempt, checkpoint, resume, abandon, retry, and failure state. It is built on the merged pure lifecycle resolver (`resolveLegacyEndlessLifecycleTransition`, Mazer PR #59) and adds durable bookkeeping, a legal-transition table, reset-scope policy, idempotent application, stable serialization, and corrupt-data recovery behind an injected Storage-like interface.

Board card: `mazer-endless-progression-mode-contract`.

## Public API

- Records: `createLegacyEndlessCheckpointRecord({ runId, initialLevel? })`, `resolveLegacyEndlessCheckpointPhase`, `resolveLegacyEndlessResumeTarget`, `resolveLegacyEndlessPrivateScoreInputs`.
- Transitions: `applyLegacyEndlessCheckpointEvent(record, { event, eventId, resetScope? })` returns `applied | duplicate | rejected` and never mutates its input. `LEGACY_ENDLESS_CHECKPOINT_TRANSITION_TABLE` and `LEGACY_ENDLESS_RESET_SCOPE_CONTRACTS` are exported data.
- Serialization: `serializeLegacyEndlessCheckpointRecord`, `parseLegacyEndlessCheckpointRecord`, `LEGACY_ENDLESS_CHECKPOINT_MIGRATIONS` (empty stub).
- Storage: `LegacyEndlessCheckpointStorage` (`getItem` / `setItem`), `loadLegacyEndlessCheckpoint`, `persistLegacyEndlessCheckpoint`, `createLegacyEndlessCheckpointStore`.

## Transition table

Phase is derived: `fresh` (no applied events), `active`, or `abandoned`.

| Phase | start | complete | fail-current-attempt | abandon | resume |
| --- | --- | --- | --- | --- | --- |
| fresh | accept | not-started | not-started | not-started | not-started |
| active | already-started | accept | accept | accept | accept |
| abandoned | already-started | abandoned-requires-resume | abandoned-requires-resume | already-abandoned | accept |

## Reset scopes

`fail-current-attempt` and `resume` require a `resetScope`; other events forbid one. Every scope preserves the durable last-completed checkpoint.

| Scope | Event | Spends an attempt | State |
| --- | --- | --- | --- |
| `player` | fail-current-attempt | yes | active |
| `enemy-contact` | fail-current-attempt | yes | active |
| `close-reopen` | resume | no | active |
| `offline-reconnect` | resume | no | active |
| `hazard-contact` | fail-current-attempt | yes | reserved (future) |

`hazard-contact` is a documented future value. Hazards do not exist yet, so applying it is rejected with `scope-reserved` until a later packet flips the contract state to `active`.

## Invariants

- The lifecycle checkpoint is monotonic: `complete` sets `checkpointLevel` to the level just finished and resets the attempt to 1; failure, abandon, and resume never lower or clear it.
- `currentLevel > checkpointLevel` whenever a checkpoint exists. `lastCheckpoint.level` mirrors `lifecycle.checkpointLevel`. Parsing rejects records that break either rule.
- Idempotency: `eventId` is caller-owned and deterministic. A repeated `eventId` inside the bounded window (last 64 ids) returns the unchanged record. Ids older than the window are not remembered, so callers must not replay events that old.
- No wall clock, randomness, or id generation. `runId` and `eventId` are always injected. A source-scan test enforces this, including no direct `localStorage`.
- Serialization is stable: sorted keys, no whitespace, `{ record, schemaVersion }` envelope.
- Loading never overwrites. A corrupt payload is copied to `<key>.corrupt` (single slot, size-bounded) and a fresh record is returned; the caller's first applied event replaces the original. A payload from a newer schema yields `unsupported-version` with `writeBlocked: true` and is never overwritten.
- Persisting writes the whole record and verifies it by read-back. A failed write reports `persisted: false`, keeps the in-memory record, and is repaired by the next successful write.

## Private score inputs

The store holds per-completion input facts only (`level`, `attemptsUsed`, `eventId`, `sequence`, bounded to the last 32) under `scoreVersion: 1`. There is no field for score, coins, elapsed time, or any aggregate, and parsing copies through an allowlist so raw client totals found on disk are dropped. These inputs are not authoritative: a server-side contract decides any score. Raw client totals must never be added here.

## Not wired (later packets)

- No scene wiring. `MenuScene` and the play loop do not call this store.
- No persistence migration. The store uses its own key, `mazer.endless-checkpoint.v1`, and does not read or write the progression storage key/version, `targetComplexity`/rank fields, the completion outbox, or any server RPC.
- No remote sync or monotonic-merge integration with account progression.
- No result receipts or leaderboard authority.
- Hazard and enemy gameplay do not exist; `enemy-contact` and `hazard-contact` are only reset-scope labels.
- The migration table is an empty stub; the first schema change adds an entry there.
