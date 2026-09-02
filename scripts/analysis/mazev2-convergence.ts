// Mazer Generation V2 -- Wave 1.5 PR D: corrected generator-convergence
// harness CLI, replacing PR B's own script. Pure logic lives in
// mazev2ConvergenceHarness.ts (importable/testable without triggering a
// full run); this file is just orchestration + I/O.
//
// Corrections from PR B (see
// docs/ops/MAZER-GENERATION-V2-WAVE-1_5-CONVERGENCE-FINDINGS-2026-08-28.md for
// the full audit this responds to):
//   1. Full reviewed recipe corpus x 32 seeds (was 6 recipes x 8 seeds).
//   2. Two explicit lanes -- raw-carving (no candidate search on either
//      engine) and production-pipeline (each engine's own real
//      candidate-search/difficulty-targeting behavior) -- run and reported
//      separately, never blended.
//   3. Legacy-runtime now honors requested width/height via a real
//      scale/aspectRatio mapping instead of a fixed board scale.
//   4. Real shortcut provenance threaded into the shared analyzer instead
//      of a hardcoded 0.
//   5. The canonical bridge (canonicalMaze.ts) now derives real wrap pairs
//      from the grid instead of always reporting wrap-free.
//   6. Failure records: a sample that throws is recorded, not dropped.
//   7. Portable, repo-relative, gitignored local scratch output directory
//      (was an absolute Windows path); its compact artifact remains ignored
//      local scratch unless separately promoted through the existing evidence workflow.
//
// Usage:
//   npx tsx scripts/analysis/mazev2-convergence.ts [--outputDir=./tmp/mazev2-convergence]
//     [--lanes=raw-carving,production-pipeline]

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createMazeV2LegacyRuntimeAdapter } from '../../src/domain/mazeV2/adapters/legacyRuntimeAdapter';
import { createMazeV2DomainMazeAdapter } from '../../src/domain/mazeV2/adapters/domainMazeAdapter';
import type { MazeV2ComparisonLane } from '../../src/domain/mazeV2/adapters/types';
import { MAZE_V2_CONVERGENCE_CORPUS } from './mazev2ConvergenceCorpus';
import { MAZE_V2_LAB_DEFAULT_SEED_CORPUS, MAZE_V2_LAB_DEFAULT_SEED_CORPUS_VERSION } from './mazeV2SeedStrategies';
import {
  assertExpectedCleanGitCommitSha,
  parseConvergenceLanes,
  resolveConvergenceExitCode,
  resolveCleanGitCommitSha,
  resolveRepositoryRootFromAnalysisModuleUrl,
  runOneSampleInChild,
  summarize,
  writeConvergenceArtifactSet,
  type ConvergenceRunRecord
} from './mazev2ConvergenceHarness';

const MAZE_V2_CONVERGENCE_HARNESS_VERSION = 'mazev2-convergence-harness-pr-d-v2';
const MAZE_V2_CONVERGENCE_CORPUS_VERSION = 'mazev2-convergence-corpus-v3-14-recipe';
const DEFAULT_OUTPUT_DIR = './tmp/mazev2-convergence';
const REPO_ROOT = resolveRepositoryRootFromAnalysisModuleUrl(import.meta.url);

const parseCliArgs = (): { outputDir: string; lanes: readonly MazeV2ComparisonLane[] } => {
  const args: Record<string, string> = {};
  for (const entry of process.argv.slice(2)) {
    if (!entry.startsWith('--')) continue;
    const [key, value] = entry.slice(2).split('=');
    if (key) args[key] = value ?? 'true';
  }
  const lanes = parseConvergenceLanes(args.lanes);
  return { outputDir: resolve(args.outputDir ?? DEFAULT_OUTPUT_DIR), lanes };
};

const run = async (): Promise<void> => {
  // Bind evidence to a clean source state before creating any output. A HEAD
  // SHA alone is insufficient because uncommitted source can change results.
  const sourceCommitSha = resolveCleanGitCommitSha(REPO_ROOT);
  const { outputDir, lanes } = parseCliArgs();

  const adapters = [createMazeV2LegacyRuntimeAdapter(), createMazeV2DomainMazeAdapter()];
  const allRecords: ConvergenceRunRecord[] = [];

  for (const recipe of MAZE_V2_CONVERGENCE_CORPUS) {
    for (const lane of lanes) {
      for (const adapter of adapters) {
        for (const seed of MAZE_V2_LAB_DEFAULT_SEED_CORPUS) {
          allRecords.push(await runOneSampleInChild(
            adapter.engineId,
            recipe,
            lane,
            seed,
            sourceCommitSha
          ));
        }
      }
    }
  }

  const totalExpected = MAZE_V2_CONVERGENCE_CORPUS.length * lanes.length * adapters.length * MAZE_V2_LAB_DEFAULT_SEED_CORPUS.length;
  console.log(`MazeV2 convergence: ${allRecords.length}/${totalExpected} runs across ${adapters.length} engines, ${lanes.length} lane(s), ${MAZE_V2_CONVERGENCE_CORPUS.length} recipes x ${MAZE_V2_LAB_DEFAULT_SEED_CORPUS.length} seeds.`);
  const failureCount = allRecords.filter((r) => r.outcome === 'exception' || r.outcome === 'invariant-failure').length;
  const unsupportedCount = allRecords.filter((r) => r.outcome === 'unsupported').length;
  if (failureCount > 0) {
    console.log(`${failureCount} sample(s) did not succeed (see per-run records: outcome/errorMessage). Not dropped from the raw output.`);
  }
  if (unsupportedCount > 0) {
    console.log(`${unsupportedCount} sample(s) were explicitly unsupported by their engine/lane contract (see per-run errorMessage). Not misreported as successful measurements.`);
  }

  const summaries = summarize(allRecords);
  const rawRunsPath = resolve(outputDir, 'mazev2-convergence-runs.json');
  const rawSummaryPath = resolve(outputDir, 'mazev2-convergence-summary.json');
  const rawRunsJson = JSON.stringify(allRecords, null, 2);

  const rawRunsDigest = createHash('sha256').update(rawRunsJson, 'utf8').digest('hex');

  const capabilityMatrix = Object.fromEntries(
    adapters.map((adapter) => [adapter.engineId, adapter.capabilities])
  );

  const compactEvidence = {
    harnessVersion: MAZE_V2_CONVERGENCE_HARNESS_VERSION,
    corpusVersion: MAZE_V2_CONVERGENCE_CORPUS_VERSION,
    seedCorpusVersion: MAZE_V2_LAB_DEFAULT_SEED_CORPUS_VERSION,
    sourceCommitSha,
    cliInvocation: `npx tsx scripts/analysis/mazev2-convergence.ts --outputDir=${outputDir} --lanes=${lanes.join(',')}`,
    generatedAtIso: new Date().toISOString(),
    totalRuns: allRecords.length,
    totalExpectedRuns: totalExpected,
    recipeCount: MAZE_V2_CONVERGENCE_CORPUS.length,
    seedCount: MAZE_V2_LAB_DEFAULT_SEED_CORPUS.length,
    lanes,
    engineIds: adapters.map((adapter) => adapter.engineId),
    outcomeCounts: {
      success: allRecords.filter((r) => r.outcome === 'success').length,
      unsupported: allRecords.filter((r) => r.outcome === 'unsupported').length,
      exception: allRecords.filter((r) => r.outcome === 'exception').length,
      invariantFailure: allRecords.filter((r) => r.outcome === 'invariant-failure').length
    },
    capabilityMatrix,
    perRecipeEngineLaneSummary: summaries,
    rawArtifactSha256: rawRunsDigest,
    rawArtifactPath: rawRunsPath
  };

  const compactEvidencePath = resolve(outputDir, 'mazev2-convergence-compact-evidence.json');
  assertExpectedCleanGitCommitSha(REPO_ROOT, sourceCommitSha, 'convergence artifact publication');
  await writeConvergenceArtifactSet(outputDir, {
    rawRunsJson,
    rawSummaryJson: JSON.stringify(summaries, null, 2),
    compactEvidenceJson: JSON.stringify(compactEvidence, null, 2)
  });

  console.log(JSON.stringify({ outcomeCounts: compactEvidence.outcomeCounts, totalRuns: compactEvidence.totalRuns }, null, 2));
  console.log(`Raw runs: ${rawRunsPath}`);
  console.log(`Raw summary: ${rawSummaryPath}`);
  console.log(`Compact evidence: ${compactEvidencePath}`);

  // Preserve the complete diagnostic artifact set before signaling a failed
  // evidence gate to callers. Unsupported samples remain an expected contract
  // result; only exceptions and invariant failures fail the process.
  process.exitCode = resolveConvergenceExitCode(allRecords);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
