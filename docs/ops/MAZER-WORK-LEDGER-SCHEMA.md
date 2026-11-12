# Mazer work ledger (schema v1)

The registry (`config/mazer-owner-work-registry.json`) stays the single source of truth for each card's status, title, priority and dependencies. The ledger (`config/mazer-work-ledger.json`) holds only what the registry cannot express: proof tier, who or what blocks a card, exact verification steps, work lane and file hints. `node scripts/analysis/work-report.mjs` joins the two into `docs/ops/MAZER-WORK-REPORT.md` and `.json`. Those two outputs are generated and never hand-edited; CI runs `--check` and fails when they are stale.

Update flow after a batch: board sync updates the registry, then update the ledger entries for the cards that moved, then run `node scripts/analysis/work-report.mjs` and commit all four files together.

## File shape

```json
{ "schemaVersion": 1, "registry": "config/mazer-owner-work-registry.json", "cards": { "MAZER-XXX-000": { ... } } }
```

Every key under `cards` must be a registry id. A card with no entry, or an entry with no lane or blocker, is reported under "Unclassified" when it is open, so nothing is dropped silently.

## Card entry

| Field | Type | Meaning |
| --- | --- | --- |
| `evidence` | object or null | Proof for shipped work. null when nothing is recorded. |
| `evidence.prs` | `[{ repo, number, mergedSha? }]` | Pull requests that carry the card (`repo` is `fawxzzy/mazer` or `fawxzzy/FawxzzyWeb`). |
| `evidence.deployedBuild` | string, optional | Production build or main sha the change was verified live on. |
| `evidence.headless` | boolean | true only when the card text records a headless-browser or capture-harness run. Unit tests alone are false. |
| `evidence.deviceChecked` | boolean or null | true: checked on a real phone. false: shipped without one. null: no device surface (tooling, governance, data, docs). |
| `blocker` | object or null | Why the card cannot move. |
| `blocker.kind` | `owner-decision`, `provider`, `device`, `dependency`, `deferred-by-owner` | |
| `blocker.summary` | string | One plain line of context. |
| `blocker.unblockedBy` | `Zac`, `provider`, `device`, `other-card` | Who or what removes it. |
| `blocker.ask` | string | One plain sentence: what is needed. Required to be non-empty for every card in "Needs you now". |
| `blocker.recommendation` | string | The recommended answer or next step. |
| `verify` | `[{ step, where, expected }]` | Exact steps for a human. `where` is `phone`, `installed-app`, `production` or `external-tool`. |
| `lane` | `agent-buildable`, `long-running`, `owner-only` or null | Who can work it. |
| `filesHint` | string[] | Files the change is likely to touch, for conflict planning in the ready queue. Hints, not promises. |
| `note` | string, optional | One plain line for in-progress and review cards (the audit note). An addition to the first draft of the schema; the generator treats it as optional. |

## Buckets (each card lands in exactly one, first match wins)

1. `status == completed`: Completed, split by proof tier: `device` (deviceChecked true), `headless` (headless true, deviceChecked false), `source-only` (neither), `no-device-surface` (deviceChecked null), `unrecorded` (no evidence entry).
2. `status == deferred_candidate`: Deferred.
3. Open card with `blocker.kind == owner-decision`, or with any `verify` step: Needs you now (decision, or phone and device check). Its `blocker.ask` is the line Zac reads.
4. Open card with any other blocker, or registry status `blocked`: Blocked, grouped by `blocker.unblockedBy`.
5. `status == review`: In review.
6. `status` in `in_progress` or `active`, or lane `long-running`: In progress.
7. Lane `agent-buildable`: Ready to build, ordered by priority then id. A card whose registry dependencies are not all completed is placed in Blocked (another card) instead, derived from the registry, so the ledger does not need to repeat dependencies.
8. Anything else: Unclassified.

The ready queue warns when two cards share a hint path and when a card touches files of more than one UI wave (`MenuScene.ts` 5C, `legacyPlayerMessage.ts` 3B, `menuRuntimeDiagnostics.ts` 1C, `package.json` 5B).

## Determinism

No clock and no randomness. The only date is the registry's own `updatedAt`. Cards sort by priority (critical, high, medium, low, none) then id; completed cards sort by registry `updatedAt` descending then id.

Tests: `tests/reset/work-report.test.ts`.
