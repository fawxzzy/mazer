# Mazer Tutorial Registry v1

Data shape and acknowledgement store for the `mazer-first-time-tutorial-system` card. Foundation only: no
tutorial UI, no responsive/accessibility/focus work, and no wiring into scenes. The UI work in the card (image,
copy, Continue action, mobile layout, keyboard focus) remains open and is not covered here.

- Registry: `src/tutorial/tutorialRegistry.ts` (`validateTutorialRegistry`, `getTutorialsForTrigger`, `triggerKey`)
- Ack store: `src/tutorial/tutorialAckStore.ts` (`createTutorialAckStore`, `selectPendingTutorials`)
- Placeholder tokens: `src/tutorial/exampleTutorials.ts` (**example copy only**, not re-exported from the index)

## Token shape

`id`, `trigger`, `repeat`, `revision`, `order`, `copy {titleKey, bodyKey, continueKey}`, optional `imageAssetId`
(an asset manifest id, resolved when an asset index is passed to the validator).

- `trigger`: `{ kind: "account-created" }` or `{ kind: "first-occurrence", event: "<event-id>" }`.
- `repeat`: `once` tokens are suppressed after acknowledgement; `repeatable` tokens are never suppressed (their
  acknowledgements are only counted).
- `revision`: bumping a `once` token's revision shows it again to accounts that acknowledged an earlier revision.
- `order`: display order among tokens sharing a trigger; ties break by id, so ordering is deterministic.
- Copy is by key; display text lives elsewhere.

## Acknowledgement store

- Storage is injected (`Pick<Storage, "getItem" | "setItem" | "removeItem">`); the module never touches `window`
  and performs no network I/O. Local-only by construction.
- Key: `mazer.tutorial.acks:<encodeURIComponent(accountId)>`. An empty account id throws. Separate accounts on one
  storage never share state; `clear()` affects only the store's own account.
- Every operation re-reads storage, so state survives reload and is consistent across store instances.
- `acknowledge` is idempotent for `once` tokens: a repeat returns `{ changed: false }` and does not write.
- Writes are deterministic (sorted keys) and the clock is injected (`now`).

## Stored format and migration

Stored value: `{ "version": 1, "acks": { "<tokenId>": { revision, count, firstAckedAt, lastAckedAt } } }`.

| Input | Result |
|---|---|
| nothing stored | `empty` |
| version 1 | `ok`; malformed entries are dropped and reported (`recovered`) |
| bare array of token ids (defensive legacy shape, no known production writer) | `migrated` to v1 at revision 1, timestamp `1970-01-01T00:00:00.000Z`; persisted on the next write |
| version greater than 1 | `future-version`: not overwritten; acknowledgements work in memory only (`unpersisted`) |
| bad JSON or unrecognized shape | `recovered` to empty; the raw bytes are copied to `<key>.corrupt` before the next write |
| storage that throws | in-memory overlay, never throws to callers; `diagnostics().storageError` is set |

Add future formats by extending `parseStoredTutorialAcks` and bumping `TUTORIAL_ACK_STORED_VERSION`.

## Evidence

`tests/tutorial/tutorial.test.ts` covers idempotent acknowledgement, reload persistence, account isolation and
switching, repeatable tokens, revision bumps, migration, future-version protection, corrupt-storage recovery, and
throwing storage. The card's mobile visual proof and keyboard-focus proof are not run (no UI exists).
