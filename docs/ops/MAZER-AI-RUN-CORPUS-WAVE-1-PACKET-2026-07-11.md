# Mazer AI Run Corpus Wave 1 Packet

## Delivered

- Added `npm run ai:corpus:audit` as a local, export-driven audit command.
- Added the `mazer.ai-run-corpus-audit.v1` aggregate report contract.
- Added fixture coverage for redaction, coverage accounting, purpose-specific quality gates, wrapped-benchmark mismatch detection, and local file output.
- Added the audit suite to `test` and `test:verify` so repository verification cannot skip it.

## Contract

The command accepts an explicitly supplied JSON export in either `{ "progressionCount": number, "receipts": [] }` form or a raw receipt array. It reports aggregate counts only:

- progression versus durable receipt coverage
- surfaces, versions, origins, and seed diversity cohorts
- missing-field and quality reason-code counts
- stored AI signal counts without reimplementing a scorer
- wrapped route-benchmark mismatch counts
- bounded completion, path, shortest-path, and frame-time distributions

The report deliberately excludes raw account identifiers, row IDs, and player paths. It creates no Supabase client, performs no database call, and cannot write or delete a receipt or progression state.

## Imported Audit Context

The operator-provided July 11 read-only audit reported 1,341 completed AI cycles, 1,139 durable receipts, a 202-cycle coverage gap, no exact duplicates, 916 behavior-ready AI receipts, 540 route-calibration-ready receipts, and wrapped completions that can undercut the canonical solution-path benchmark. Those counts remain source evidence for a future redacted export run; this packet does not claim to have re-queried live Supabase.

## Verification

```text
npm run ai:corpus:audit -- --help
npm run lint
npm run verify
```

`npm run verify` passed on July 11, 2026: 40 test files, 315 tests, followed by a successful production build.

## Explicit Non-Changes

- No Mazer Vercel production deployment or promotion.
- No Supabase schema or row mutation.
- No Fawxzzy account progression reset.
- No synthetic receipt backfill.
- No AI-scoring, shortest-path, generator, or progression weight change.

## Next Boundary

Wave 2 owns shared scorer parity and a true shortest-path implementation over the legal wrapped movement graph. Wave 1 exposes the data-quality evidence needed to test those changes; it does not tune live formulas.
