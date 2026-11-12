# Mazer AI Run Seed Packs and Baseline Report Packet

Date: `2026-11-05`

Board card: `mazer-ai-run-corpus-quality-calibration` (work item: generate
representative, stress, and wrap-anomaly seed packs for deterministic
before-and-after testing).

## Outcome

Three versioned, content-hashed seed packs and a deterministic baseline runner
now exist. Running the production menu-demo AI over a pack yields a stable JSON
and markdown report, and an idempotent coverage report says which packs and
difficulty bands have a current baseline. Nothing reads or writes account data,
a database, progression state, or receipts; scoring and receipt contracts are
unchanged.

## Packs

Committed under `tests/fixtures/ai-run-seed-packs/` as `<packId>.pack.json`,
schema `mazer.ai-run-seed-pack.v1`.

| Pack id | Purpose | Targets / cases | Bands |
| --- | --- | --- | --- |
| `mazer-ai-seed-representative` | typical menu-demo play across the early bands | 6 / 36 | tutorial, starter, explorer, navigator |
| `mazer-ai-seed-stress` | large boards, an under-skilled AI, and a fixed long-tail seed set | 4 / 15 | explorer, architect, mythic |
| `mazer-ai-seed-wrap-anomaly` | forced opposite-border connections and extra feeders (wrapped shortest paths), including a portrait aspect ratio | 3 / 24 | explorer, navigator |

Each pack has `packId`, `packVersion` (semver), `purpose`, `runnerContract`, and
a `hash` (`sha256:` of the key-sorted canonical JSON of everything except the
hash). Editing a pack without re-sealing fails validation.

## Parameters are explicit, not level-derived

Level 1-30 generation is being changed by another lane, so a pack target does
not say "level N". Each target carries every commit-independent input to the
run:

- `scale`, `aspectRatio`
- `selection`: `targetComplexity`, `candidateCount`, `tolerance`
- `generationProfile`: all eight `LegacyMazeGenerationProfile` fields as literals
  (checkpoint counts and override, dead-end cap, straightness, shortcut and
  route-quality multipliers, border feeders, required opposite-border
  connections)
- `ai`: `skillLevel`, `skillRank`, `biasProfile` (`null` keeps the production
  default)
- `seeds`: fixed uint32 list

`band` is a coverage label and `levelRangeHint` is informational; neither feeds
generation. The literals were captured once from the progression resolver and
then frozen. If a later generator change alters what those literals produce,
the pack hash stays the same and the baseline `resultDigest` changes: that is
the intended before/after signal. The runner also records
`generationProfileNormalized` per case, so a change to the profile clamps shows
up as `profileNormalizationDriftCount > 0` instead of silently changing what the
pack means.

The long-tail target (`explorer-t96-weak-ai-long-tail`) uses seeds selected
because the rank E AI with the `shortcut-gambler` bias made wrong-branch,
backtrack, or recovery decisions at the time the pack was cut. After a
generator change those seeds may stop being long-tail; the drift is reported,
not hidden, and a new pack version is the response.

## How to run

```
npm run ai:corpus:baseline -- --seed-pack tests/fixtures/ai-run-seed-packs/mazer-ai-seed-stress.pack.json \
  --output tests/fixtures/ai-run-seed-packs/baselines/mazer-ai-seed-stress.v1.0.0.baseline.json \
  --markdown-output tests/fixtures/ai-run-seed-packs/baselines/mazer-ai-seed-stress.v1.0.0.baseline.md

npm run ai:corpus:coverage
node scripts/analysis/ai-run-corpus-audit.mjs --seal-seed-pack <pack.json>
```

The baseline mode needs `vite-node` (the runner imports `src/` TypeScript),
hence the dedicated npm script; the coverage and seal modes are plain node.
Output files are written only when their content changes, so reruns are no-ops.
Baseline files are named `<packId>.v<packVersion>.baseline.{json,md}` in the
`baselines/` folder next to the packs. A full run of all three packs takes about
one minute.

## Baseline report

Schema `mazer.ai-run-seed-pack-baseline.v1`: pack identity and hash, scorer
ids and versions, runner constants, a data policy block, per-target summaries
(counts, signal counts, min/median/max/mean for complexity, path lengths,
overrun, run-quality total, AI pressure, coverage ratio), per-case compact rows,
and `resultDigest`. There is no timestamp, commit, host path, user id, client
run id, or player path, so identical inputs produce byte-identical files.

Runner contract `menu-demo-advance-walker-v1`: maze from
`createLegacyRuntimeMazeForMode('menu', ...)`, walker config from
`createLegacyMenuDemoWalkerConfig`, stepping loop and receipt construction as in
`ai-runner-calibration.ts`. `averageFrameMs` (16) and `completedAt` are fixed
synthetic values recorded in the report environment. Receipts are built in
memory only to read the existing scorers' output.

## Coverage accounting

`createSeedPackCoverageReport` is a pure function of the committed packs and
baselines. Per pack it reports one of `current` (baseline pack hash matches),
`stale` (pack edited after its baseline), `missing`, or `invalid`. Per band it
reports covering packs and whether a current baseline exists. Re-running it, or
re-running a baseline, cannot change the result by itself.

## Proof

- `tests/analysis/ai-run-seed-packs.test.mjs`: schema and hash validation,
  tamper and duplicate rejection, key-order-independent hashing, aggregation
  math, coverage states, and no-rewrite on repeat CLI runs.
- `tests/analysis/ai-run-seed-pack-baseline.test.ts`: determinism of two runner
  executions, report shape and redaction, input immutability, CLI idempotency,
  and that each committed baseline matches its pack hash and case counts.
- Tests deliberately do not assert committed metric values, so the other lane's
  generation change does not break CI; it shows up as a changed digest when the
  baselines are regenerated.

## Known limits

- The production AI is clean on most generated boards (rank A/S had no
  mistakes in the representative pack), so most cases score 100 and AI
  pressure 0. Discrimination comes from the long-tail and weak-AI targets.
- `ai-runner-calibration.ts` once called `createLegacyGeneratedMenuMaze(scale, seed)`
  with the wrong argument order. That was fixed in `52d212bf` (it now passes
  `(scale, scale, seed)`); the seed-pack runner always used the correct
  production entry point.
- Baselines record one runner build; they are evidence about the current
  commit's behavior, not a quality gate.
- Replaying candidate progression formulas against these packs is a separate
  work item.
- Update 2026-11-12: baselines were regenerated on current `main` with no
  `resultDigest` drift, and per-band thresholds now live in
  `docs/ops/MAZER-AI-RUN-CALIBRATION-THRESHOLDS-2026-11-12.md`.
