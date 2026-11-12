# Mazer AI Run Calibration Thresholds Packet

Date: `2026-11-12`

Board card: `MAZER-AI-001` (finish the configurable AI runner and run-corpus
calibration). Builds on
`docs/ops/MAZER-AI-RUN-SEED-PACKS-BASELINE-PACKET-2026-11-05.md`.

## Outcome

- The configurable runner plays generated levels end to end: the baseline runner
  drives the production menu-demo AI over every seed-pack case, and all 75
  cases in the three committed packs reach the goal with no reset.
- Per-band calibration thresholds are now written down, derived by stated rules
  from the committed baselines, and checkable with one command.
- The three baselines were regenerated on current `main` (after ladder v2,
  wrap fade and no-stub GEN-006). The result digests did **not** change.
- Remote run retention is not built. Recommendation below: drop it.

## Baseline regeneration on current main

`npm run ai:corpus:baseline` was run once per pack against `origin/main`
`1b2d8ebf`. Output is written only when content differs.

| pack | pack hash (unchanged) | resultDigest before and after (identical) | drift |
| --- | --- | --- | --- |
| `mazer-ai-seed-representative` | `sha256:0d6e8708fc36c5959ffb7e1a7e218a6a92930fd31520eb1c124f7764a01eb14b` | `sha256:1c0394f9b50b9b802a43351d848aa774636179cf9facba111fdb61c02952fa03` | none |
| `mazer-ai-seed-stress` | `sha256:70bae411f671ae4780ccbcf0c17fd52d24931a9248e438c1caf6316777f1f368` | `sha256:41ac9201267fdc0a134fbab341306466598faef33d6ce9ec86aa4c9d06f9f9b7` | none |
| `mazer-ai-seed-wrap-anomaly` | `sha256:fff6da86ebfc73b45d6ffadbe599b2e6b5b7516ff04b802bc1929b990f56405c` | `sha256:f2a385dc16a4dcfbd3752d635e7cbd6793127fc9a639fbcb02c27293d1d33fab` | none |

No baseline file changed, so none is committed here. Reading: the pack targets
carry every generation input as a literal (scale, selection, all eight profile
fields), so level-ladder changes that only alter what a *level number* resolves
to cannot move them, and the generator and walker changes that landed since
2026-11-05 did not alter any of these 75 cases. That is evidence about these
packs, not proof that nothing changed in generation for other inputs. If a later
generator change moves a digest, regenerate, run `--check` below, and read the
diff.

`npm run ai:corpus:coverage` on the same tree: `allPacksCurrent: true`, no
uncovered bands, no uncovered purposes (all three packs `current`, six bands
covered).

## Threshold table

Source of truth: `tests/fixtures/ai-run-seed-packs/calibration-thresholds.v1.json`
(schema `mazer.ai-run-calibration-thresholds.v1`), derived from the baselines
listed in its `basedOn` block. Each band pools its *standard-AI* targets (every
target whose id does not contain `weak-ai`).

| band | standard targets | run-quality min floor | AI pressure median ceiling | route overrun max ceiling | median complexity range |
| --- | --- | ---: | ---: | ---: | --- |
| tutorial | tutorial-t8 | 90 | 10 | 0.1 | 25.1 to 41.9 |
| starter | starter-early-t16, starter-late-t64, starter-mid-t32 | 90 | 10 | 0.1 | 39 to 65 |
| explorer | explorer-t96, wrap-explorer-both-axes | 90 | 10 | 0.1 | 135 to 225 |
| navigator | navigator-t160, wrap-navigator-heavy-feeders, wrap-navigator-portrait | 90 | 10 | 0.1 | 186 to 310 |
| architect | architect-t280 | 90 | 10 | 0.1 | 222.8 to 371.3 |
| mythic | mythic-t400 | 90 | 10 | 0.1 | 300 to 500 |

### Rules (same text as `rules` in the JSON)

- Hard, every case in every band: reaches the goal, uses no reset, never beats
  the benchmark shortest path, no profile-normalization drift. Any violation
  fails.
- Run-quality min floor: `floor(lowest standard-AI run-quality total - 10)` to a
  multiple of 5, never below 0.
- AI pressure median ceiling: `ceil(highest per-target median AI pressure + 10)`
  to a multiple of 5.
- Route overrun max ceiling: highest per-target max overrun ratio `+ 0.10`,
  rounded to 2 decimals.
- Median complexity range: `0.75x` to `1.25x` the median of per-target median
  measured complexity in the band. This is a before/after drift alarm for the
  generator, not a quality claim.
- Discrimination: at least one weak-AI target must still show AI pressure
  median above 0 and run-quality minimum below 100. Otherwise the pack no
  longer separates a weak AI from a strong one and needs a new pack version.

### Measured values behind the table (current main)

| band | standard cases | run-quality min | AI pressure median (max over targets) | overrun max | median complexity | target complexity |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| tutorial | 6 | 100 | 0 | 0 | 33.5 | 8 |
| starter | 18 | 100 | 0 | 0 | 52 | 16 / 32 / 64 |
| explorer | 14 | 100 | 0 | 0 | 180 | 96 / 96 |
| navigator | 22 | 100 | 0 | 0 | 248 | 160 / 160 / 160 |
| architect | 3 | 100 | 0 | 0 | 297 | 280 |
| mythic | 3 | 100 | 0 | 0 | 400 | 400 |

Weak-AI targets (excluded from the table above, used for discrimination):
`explorer-t96-weak-ai-long-tail` (rank E, `shortcut-gambler`) has run-quality
min 92, AI pressure median 9.313 (max 13.523) and overrun max 0.224, so the pack
still discriminates. `mythic-t400-weak-ai` (rank E, no bias) is clean on every
case (pressure 0, run quality 100): a rank E AI with the default bias does not
struggle even at scale 96.

## Reproduce

Plain node, fixtures only, no account data, no `package.json` script needed:

```
npm run ai:corpus:baseline -- --seed-pack tests/fixtures/ai-run-seed-packs/<pack>.pack.json \
  --output tests/fixtures/ai-run-seed-packs/baselines/<packId>.v1.0.0.baseline.json \
  --markdown-output tests/fixtures/ai-run-seed-packs/baselines/<packId>.v1.0.0.baseline.md
npm run ai:corpus:coverage
node scripts/analysis/ai-run-calibration-thresholds.mjs --check    # baselines vs committed thresholds, exit 1 on violation
node scripts/analysis/ai-run-calibration-thresholds.mjs --table    # table derived from the current baselines
node scripts/analysis/ai-run-calibration-thresholds.mjs --derive   # rewrite calibration-thresholds.v1.json (only if changed)
```

`tests/architecture/ai-run-calibration-thresholds-contract.test.mjs` pins the
derivation rules on synthetic baselines, the checker's failure modes, and that
this packet's table and baseline digests equal the committed thresholds file. It
deliberately does not assert committed metric values against the baselines, so a
generator change shows up when baselines are regenerated and `--check` is run,
not as a surprise CI failure.

## Findings

- The AI is clean on every standard-AI target (pressure 0, run quality 100).
  Thresholds therefore guard against regression; they do not rank AI
  skill. This matches the stale "Known limits" note and the 2026-11-05 marker
  observation that menu-demo AI no longer discriminates ranks.
- 68 of the 75 cases land `over-target` on selected complexity (measured
  complexity above target plus tolerance); only architect/mythic land on
  target. The generator over-delivers complexity in the tutorial through
  navigator bands (for example tutorial target 8 delivers a median of 33.5).
  The complexity range in the table records what is delivered today so that a
  generator change is visible, it does not endorse the delivery. Whether to
  tighten selection is a product/generation call and belongs to the generator
  lane, not to this card.

## Remote run retention: recommend dropping

Acceptance criterion 3 requires any remote run retention to be explicitly
approved before it is built. It has not been approved and nothing was built.
Recommendation: drop it. The calibration corpus is fully reproducible from
committed, hash-sealed packs plus a deterministic runner, so a remote store of
recorded runs adds a provider-side write path, account-data handling and
retention policy without improving calibration. If a future need appears
(real-player run quality over time), open a new card with a data policy first.

## Not done / limits

- Thresholds are derived from one build's baselines on fixtures; they are not
  validated against real player runs.
- Replaying candidate progression formulas against the packs remains a separate
  work item.
- `ai-runner-calibration.ts` calls `createLegacyGeneratedMenuMaze` with the
  correct argument order since `52d212bf`; the 2026-11-05 packet's "Known limits"
  paragraph saying otherwise was stale and is corrected in that packet.
