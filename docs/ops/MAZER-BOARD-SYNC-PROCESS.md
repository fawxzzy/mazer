# Mazer board sync process (events, one command, milestone cadence)

Status: process contract. Owner request 2026-11-13: update the project boards less often and spend far fewer tokens doing it. This replaces "edit the registry after every merge" with "append one line per fact, fold them in one deterministic command at a milestone".

## What changed and why

Before: after every merge, deploy or decision an LLM agent hand-edited card text in `config/mazer-owner-work-registry.json`, recomputed the provenance counts, regenerated the export and work report, opened a Mazer pull request, waited for 12 checks, re-pinned FawxzzyWeb by hand (allowlist hash, new ids, three hard-coded counts), opened and waited on a second pull request, then built the site. Fifteen such agent runs averaged about 147 tool calls and about 87k output tokens each. The ledger (`config/mazer-work-ledger.json`) was often not updated at all (the seventh sync left it stale), and a registry-only merge could turn main red because the Verify workflow was skipped on the pull request but ran on the push.

After: three separated jobs, each cheap.

| Job | Who | Cost | When |
| --- | --- | --- | --- |
| 1. Record an event | any worker or the coordinator | one shell command, no pull request, no CI | when a fact becomes true (merge, deploy, check, decision, new card) |
| 2. Fold events | `board-sync.mjs apply` (no LLM), by hand or by the Board sync workflow | one command plus one pull request with one check | at a milestone (below), not per pull request |
| 3. Publish | FawxzzyWeb re-pin (`board-sync.mjs web`), unaliased build, owner moves aliases | one Web pull request, one build | right after job 2, only when the owner-facing site should show the new board |

The owner-facing board is allowed to lag. The lag is stated, not hidden (see "Staleness marker").

## Options considered (ranked)

1. **Event queue on a side branch plus a deterministic fold and a scheduled or on-demand job (chosen).** Appending is one command and never touches `main`, a pull request or CI; the queue is visible to every worktree, machine and to a GitHub Action; the fold is code, so statuses are checked against evidence mechanically and the text is generated from structured fields.
2. Local-only pending file. Cheapest, but invisible to cloud jobs and other machines and lost with the clone. Kept only as the offline fallback.
3. Events committed to `main` per pull request. Free of new infrastructure, but every worker pull request then edits one shared file (merge conflicts) and every append is a commit and, for non-ignored paths, a full CI run. This recreates the cost being removed.
4. Keep the agent, make its prompt shorter. Cuts some tokens but keeps hand-edited JSON, two CI waits and the drift risk.
5. Make FawxzzyWeb read the Mazer export live (no re-pin). Best end state for job 3 but a Web architecture change with an owner decision (card FW-PROJECTS-001); out of scope here. The deterministic re-pin below removes the manual work meanwhile.

## Event format

One JSON object per line, appended to the `board-events` branch (file `events.jsonl`) with:

```
node scripts/board/board-sync.mjs event --card MAZER-VIS-030 --status review \
  --text "Edge diamonds fill when the beam touches them. Not checked on a phone." \
  --pr 492:1dc4e9ca --deployed fawxzzy-mazer-dq6f32ysl --headless --device false
```

Flags: `--card` (required), `--text` (required, one plain line, 700 chars max), `--status`, `--title` (90 max), `--pr <number>[:<mergedSha>]` (repeat; `--webpr` for FawxzzyWeb), `--deployed <build>`, `--headless`, `--device true|false|none` (`none` = no device surface), `--checked-on "<device, build>"` (required with `--device true`), `--note`, `--lane`, or `--json '<whole event>'` for blocker, verify steps and new cards. `ts` defaults to now (UTC). The id is the first 12 hex characters of the sha256 of the canonical event, so the same event is never applied twice and an edited line is detected.

| Field | Meaning |
| --- | --- |
| `v` | always 1 |
| `ts` | ISO UTC time the fact became true; events fold in `ts` order |
| `card` | stable `MAZER-AREA-NNN` id |
| `status` | optional: `active`, `in_progress`, `planning`, `review`, `blocked`, `completed`, `deferred_candidate` (`archived` is refused) |
| `text` | one plain line for the card; no URLs, file paths or emails; never contains the words that begin a generated line |
| `evidence` | optional `{ prs: [{repo, number, mergedSha?}], deployedBuild?, headless?, deviceChecked? (true/false/null), checkedOn? }` |
| `blocker` | optional `{ kind, unblockedBy, summary, ask, recommendation? }`, or `null` to clear |
| `verify` | optional list of `{ step, where, expected }` replacing the ledger steps |
| `note`, `lane` | ledger fields |
| `title` | optional new card title |
| `new` | creates a card: `{ title, description, cardType, priority, dependencies, acceptanceCriteria (3 or more) }` |
| `reopen` | `true` to move a completed card back |
| `by` | free label, not part of the id |

Example new-card event: `--json '{"v":1,"ts":"2026-11-14T09:00:00Z","card":"MAZER-VIS-040","status":"planning","text":"New card.","new":{"title":"...","description":"...","cardType":"feature","priority":"low","dependencies":[],"acceptanceCriteria":["a","b","c"]}}'`.

If the push fails (offline), the event is saved in the git directory of the clone and `board-sync.mjs flush` (or the next `event`) sends it.

## Status versus evidence (enforced by the fold, not by an agent)

- `completed` requires a merged PR (`mergedSha`) AND `deployedBuild`. Work with no runtime surface (tooling, docs, tests, governance) sets `--device none` and then needs only the merged PR.
- Merged but not deployed, or an open PR: use `review`. The generated sentence says "PR #N open" or "Merged, not deployed".
- Device state is explicit: `--headless --device false` adds "Checked only in headless Chromium, not on a real phone."; no headless flag adds "Unit tests only: no browser or phone check."; `--device true` needs `--checked-on`.
- `blocked` needs a blocker. A completed card does not move back without `reopen`. A new card cannot be created completed. Unknown cards are refused unless the event carries a `new` block. Dependencies must exist. New cards need three acceptance criteria (exporter rule).
- Any rejected event stops the whole fold; nothing is written. The owner export and the work report are built in memory first, so a public-safety rejection by the exporter also writes nothing.
- The evidence sentence is generated from the evidence fields, so the card text cannot claim more than the evidence.

## What the fold writes

`node scripts/board/board-sync.mjs plan` prints the diff (cards moved, new cards, byte delta, export hash) and writes nothing. `apply` writes, in one step:

1. `config/mazer-owner-work-registry.json`: status, `updatedAt`, a generated `Board update <date>: <text> <evidence sentence>` line appended to the description (only the newest three generated lines stay in a card; every event stays in the archive), new cards, recomputed `provenance` counts, `provenance.boardSync`, registry `updatedAt`. File line endings are preserved.
2. `config/mazer-work-ledger.json`: evidence (PRs, build, headless, device), blocker, verify, note, lane. Only changed or new entries are patched, so the file's mixed formatting is untouched.
3. `config/mazer-board-events.jsonl`: the append-only archive of applied events (the audit trail and the idempotency key; a replay is a no-op).
4. `exports/mazer.project-board.owner-export.v1.json` and `docs/ops/MAZER-WORK-REPORT.md` / `.json`, regenerated from the new registry and ledger by the existing generators.

Card titles, acceptance criteria and long descriptions that need judgement stay manual edits (a normal pull request); the fold never rewrites them except through `title` and `new`.

## Trigger policy (when to sync)

Sync at milestones, not per pull request:

1. the end of a batch (after the batch's merges and the one production deploy),
2. immediately before the owner asks for a report or a Needs-you list,
3. when `board-sync.mjs status` says SYNC DUE: 12 or more pending events, or the oldest pending event is 7 or more days old (`--max-events`, `--max-days` override),
4. never because a single pull request merged.

`node scripts/board/board-sync.mjs status --due` exits 0 when due and 3 when not, for scripts and the workflow. Before choosing next work, read the board and the pending events (`status` prints the count; the events branch is the up-to-date source for work that has not been folded yet).

## Staleness marker

- `status` prints: `Board as of <registry date> (last sync <date>, <N> events applied in total), <P> pending events, oldest <d> d. Not due.`
- The work report carries `Last board sync: <date> (<N> board events applied in total)` once a sync has run, and says that later work waits in the pending events.
- Anything that quotes the board to the owner (batch report, Needs-you list) starts with the `status` line.
- The public FawxzzyWeb page shows the export's own dates; a "board as of" banner there is a Web follow-up.

## Combined pull request flow

Manual (about ten steps, no agent needed):

1. `git fetch origin`; worktree off `origin/main`; `node scripts/board/board-sync.mjs plan`, read the diff.
2. `node scripts/board/board-sync.mjs apply`.
3. Commit the six generated files in one pull request. Only the "Owner export" workflow runs (one check, about a minute); the 12-check Verify workflow ignores board-only changes.
4. Merge on a clean state with all checks passed on the exact head (`--match-head-commit`).
5. In a FawxzzyWeb worktree off `origin/main`: `node <mazer>/scripts/board/board-sync.mjs web --web . --write` (it only copies the export into `planning/board-sources/`; the Web Projects page is owner-only, so there is no allowlist or hard-coded count), then the Web commands it prints (`npm run data:project-board-owner-snapshot`, `npm run test:project-board-preview`, `npx eslint .`, `npm run build`), commit the listed files, open the Web pull request, merge when `verify` passes.
6. Unaliased production build and readback (`Mazer, N cards`); the owner moves the four aliases.

Automated: `.github/workflows/board-sync.yml` (run it from the Actions tab or `gh workflow run board-sync.yml`) does steps 1 to 3 with no LLM and no secrets: it checks the trigger policy (skip with the `force` input), runs `plan` and `apply`, verifies the outputs, opens the pull request and starts the Owner export workflow on its branch (pull requests opened with the workflow token do not start `pull_request` workflows, so it dispatches `ci.yml`). A weekly schedule exists but only runs when the repository variable `MAZER_BOARD_SYNC_SCHEDULE` is `on`. Prerequisite: the repository setting that lets Actions create pull requests. Not yet exercised in a real run: the first dispatch after merge is its test; if it fails, the manual flow above is unchanged.

Production builds, alias moves, database, env values and DNS stay outside all of this.

## CI robustness (why main cannot go red between syncs)

- The "generated work report is current" check lived in the Verify workflow, which is skipped for board-only pull requests but always runs on the push to main, so a registry-only merge turned main red. It now lives in the Owner export workflow, whose triggers are exactly the inputs and outputs (registry, ledger, event archive, export, report, generators). The check runs whenever those files change and on the push to main for the same paths; it cannot be stale without one of those paths changing in the same pull request.
- `apply` writes registry, ledger, archive, export and report together, so the generated files are never half updated.
- `tests/reset/work-report.test.ts` no longer pins specific card ids as "needs the owner"; a decision being answered used to break Verify on main.
- The Owner export workflow also runs `board-sync.mjs check` (registry and ledger ids, archive integrity, provenance counts, canonical registry formatting) and `tests/board-sync.test.mjs`.

## Rollback

- Before apply: delete nothing; `plan` writes nothing. A wrong event is corrected by a new event (events are append-only), or by `git checkout` of the six files in the worktree before committing.
- After a merged sync: revert the sync pull request (`gh pr revert` or `git revert -m 1 <merge sha>`); the archive reverts with it, so the same events are pending again and a corrected set can be folded.
- After a Web re-pin: revert the Web pull request and rebuild; production keeps serving the previous build until the owner moves aliases, and the previous deployment is the alias rollback target.
- The `board-events` branch is a plain git branch. To discard queued events: `git push origin :board-events`.
- Backing out the whole process: delete `scripts/board`, the two workflow additions and this document; the registry, ledger, export and report remain valid and can be edited by hand exactly as before.

## Adopting the pattern in Fitness and Atlas

The fold is Mazer-specific only in its paths, card id pattern and the exporter import. Fitness can reuse `board-events.mjs` unchanged (pass its registry and ledger) with its own `board-sync` wrapper pointing at its registry, exporter and report; the `board-events` branch and the policy are per repository. Until then `fitness-board-sync` stays as is. Atlas has no ledger yet; start with events and the registry fold, and add the ledger when its report needs evidence tiers.

## Limits and unverified claims

- The Board sync workflow and the `board-events` branch have not run against GitHub yet; the event store is tested against local bare repositories (append, two clones alternating, offline fallback, flush) and the fold against scratch copies of the real registry and ledger.
- Token and step figures for the new flow are projections; the "before" figures are measured from the fifteen recorded agent runs (see the pull request description).
- The Web re-pin only copies the export; FawxzzyWeb regenerates its owner snapshot from every card (no allowlist, no hard-coded counts since 2026-11-13).
