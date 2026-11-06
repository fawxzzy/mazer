// Offline comparison of the CURRENT progression target-complexity formula with
// stated candidate formulas, replayed over the deterministic outcome fixtures.
//
// Read-only and side-effect free: no storage, no network, no clock, no server.
// It never edits a live threshold; candidates are local models defined below
// and are NOT wired into the game. Rank thresholds and the 8..400 clamp are
// the live ones (resolveLegacyProgressionRank / LEGACY_PROGRESSION_*).
//
// Run:  npm run progression:compare            (text tables)
//       npm run progression:compare -- --json  (machine-readable)
//       npm run progression:compare -- --max-completions=200
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_PROGRESSION_MAX_COMPLEXITY,
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  createEmptyLegacyProgressionState,
  recordLegacyProgressionCycle,
  resolveLegacyMazeComplexity,
  resolveLegacyProgressionPerformanceScoreForReceipt,
  resolveLegacyProgressionRank,
  type LegacyProgressionRank,
  type LegacyProgressionSignal,
  type LegacyProgressionState,
  type LegacyProgressionTrackId
} from '../../src/legacy-runtime/legacyProgression';
import type { MazeCycleTelemetrySurface } from '../../src/legacy-runtime/mazeCycleTelemetry';
import {
  PROGRESSION_OUTCOME_IDS,
  createProgressionOutcomeMaze,
  createProgressionOutcomeReceipt,
  type ProgressionOutcomeId
} from './lib/progressionOutcomeFixtures';

export interface CandidateFormula {
  description: string;
  id: string;
  /** Target-complexity step for one accepted completion, given the quality signal. */
  step: (signal: LegacyProgressionSignal) => number;
}

// "current" is replayed through the real recordLegacyProgressionCycle; its
// entry here only documents the step so tables can show it next to candidates.
export const CURRENT_FORMULA: CandidateFormula = {
  description: 'live: flat +4 per completion, outcome ignored',
  id: 'current',
  step: () => 4
};

export const CANDIDATE_FORMULAS: readonly CandidateFormula[] = [
  {
    description: 'candidate A: slower flat step, +2 per completion, outcome ignored',
    id: 'slow-flat-2',
    step: () => 2
  },
  {
    description: 'candidate B: signal-weighted, challenge +4 / hold +2 / ease +1, never negative',
    id: 'signal-weighted',
    step: (signal) => (signal === 'challenge' ? 4 : signal === 'hold' ? 2 : 1)
  }
];

const SURFACES: readonly MazeCycleTelemetrySurface[] = ['play', 'menu-demo'];
const RANK_TARGETS: ReadonlyArray<{ rank: LegacyProgressionRank; threshold: number }> = [
  { rank: 'D', threshold: 28 },
  { rank: 'C', threshold: 46 },
  { rank: 'B', threshold: 70 },
  { rank: 'A', threshold: 96 },
  { rank: 'S', threshold: 125 }
];

const clampTarget = (value: number): number => Math.max(
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  Math.min(LEGACY_PROGRESSION_MAX_COMPLEXITY, value)
);

const trackIdFor = (surface: MazeCycleTelemetrySurface): LegacyProgressionTrackId => (
  surface === 'play' ? 'player' : 'ai-runner'
);

export interface TrajectoryPoint {
  rank: LegacyProgressionRank;
  signal: LegacyProgressionSignal;
  target: number;
}

/** Real formula: replays receipts through recordLegacyProgressionCycle. */
export const replayCurrent = (
  surface: MazeCycleTelemetrySurface,
  outcomes: readonly ProgressionOutcomeId[]
): TrajectoryPoint[] => {
  const trackId = trackIdFor(surface);
  let state: LegacyProgressionState = createEmptyLegacyProgressionState();
  return outcomes.map((outcomeId, index) => {
    state = recordLegacyProgressionCycle(
      undefined,
      state,
      createProgressionOutcomeReceipt(outcomeId, surface, index),
      createProgressionOutcomeMaze(index)
    );
    const track = state.tracks[trackId];
    return { rank: track.rank, signal: track.lastSignal, target: track.targetComplexity };
  });
};

/** Candidate model: steps the baseline target by the quality signal. */
export const replayCandidate = (
  formula: CandidateFormula,
  surface: MazeCycleTelemetrySurface,
  outcomes: readonly ProgressionOutcomeId[]
): TrajectoryPoint[] => {
  let target = LEGACY_PROGRESSION_MIN_COMPLEXITY;
  return outcomes.map((outcomeId, index) => {
    const receipt = createProgressionOutcomeReceipt(outcomeId, surface, index);
    const complexity = resolveLegacyMazeComplexity(createProgressionOutcomeMaze(index)).total;
    const signal = resolveLegacyProgressionPerformanceScoreForReceipt(receipt, complexity).signal;
    target = clampTarget(target + formula.step(signal));
    return { rank: resolveLegacyProgressionRank(target), signal, target };
  });
};

const repeat = (outcomeId: ProgressionOutcomeId, count: number): ProgressionOutcomeId[] => (
  Array.from({ length: count }, () => outcomeId)
);

export const firstCompletionAtOrAbove = (
  trajectory: readonly TrajectoryPoint[],
  threshold: number
): number | null => {
  const index = trajectory.findIndex((point) => point.target >= threshold);
  return index === -1 ? null : index + 1;
};

export interface ComparisonReport {
  completionsToRank: Array<{
    formula: string;
    outcome: ProgressionOutcomeId;
    ranks: Record<string, number | null>;
    surface: MazeCycleTelemetrySurface;
  }>;
  maxCompletions: number;
  perOutcome: Array<{
    deltas: Record<string, number>;
    outcome: ProgressionOutcomeId;
    qualitySignal: LegacyProgressionSignal;
    score: number;
    surface: MazeCycleTelemetrySurface;
  }>;
  recovery: Array<{ formula: string; surface: MazeCycleTelemetrySurface; targets: number[] }>;
}

export const buildComparisonReport = (maxCompletions = 150): ComparisonReport => {
  const formulas = [CURRENT_FORMULA, ...CANDIDATE_FORMULAS];
  const replayFor = (
    formula: CandidateFormula,
    surface: MazeCycleTelemetrySurface,
    outcomes: readonly ProgressionOutcomeId[]
  ): TrajectoryPoint[] => (
    formula.id === CURRENT_FORMULA.id
      ? replayCurrent(surface, outcomes)
      : replayCandidate(formula, surface, outcomes)
  );

  const perOutcome: ComparisonReport['perOutcome'] = [];
  const completionsToRank: ComparisonReport['completionsToRank'] = [];
  for (const surface of SURFACES) {
    for (const outcome of PROGRESSION_OUTCOME_IDS) {
      const receipt = createProgressionOutcomeReceipt(outcome, surface, 0);
      const complexity = resolveLegacyMazeComplexity(createProgressionOutcomeMaze(0)).total;
      const score = resolveLegacyProgressionPerformanceScoreForReceipt(receipt, complexity);
      const deltas: Record<string, number> = {};
      for (const formula of formulas) {
        deltas[formula.id] = replayFor(formula, surface, [outcome])[0]!.target - LEGACY_PROGRESSION_MIN_COMPLEXITY;
      }
      perOutcome.push({ deltas, outcome, qualitySignal: score.signal, score: score.total, surface });

      for (const formula of formulas) {
        const trajectory = replayFor(formula, surface, repeat(outcome, maxCompletions));
        completionsToRank.push({
          formula: formula.id,
          outcome,
          ranks: Object.fromEntries(
            RANK_TARGETS.map(({ rank, threshold }) => [rank, firstCompletionAtOrAbove(trajectory, threshold)])
          ),
          surface
        });
      }
    }
  }

  const recoveryOutcomes: ProgressionOutcomeId[] = [
    'failed', 'failed', 'failed', 'perfect', 'perfect', 'perfect', 'perfect'
  ];
  const recovery: ComparisonReport['recovery'] = [];
  for (const surface of SURFACES) {
    for (const formula of formulas) {
      recovery.push({
        formula: formula.id,
        surface,
        targets: replayFor(formula, surface, recoveryOutcomes).map((point) => point.target)
      });
    }
  }

  return { completionsToRank, maxCompletions, perOutcome, recovery };
};

const pad = (value: string | number, width: number): string => String(value).padEnd(width);

export const formatComparisonReport = (report: ComparisonReport): string => {
  const formulaIds = [CURRENT_FORMULA.id, ...CANDIDATE_FORMULAS.map((formula) => formula.id)];
  const lines: string[] = [];
  lines.push('Progression formula comparison (offline, fixtures only; no live threshold changed)');
  lines.push('');
  for (const formula of [CURRENT_FORMULA, ...CANDIDATE_FORMULAS]) {
    lines.push(`  ${pad(formula.id, 16)} ${formula.description}`);
  }
  lines.push('');
  lines.push('Note: candidates read the scorer quality signal for BOTH surfaces. The live player');
  lines.push('track forces every completion to "challenge" (resolveProgressionSignal), so the');
  lines.push('player columns for candidate B are a what-if, not a live behaviour.');
  lines.push('');
  lines.push('1. Target delta for ONE completion from baseline target 8');
  lines.push(`  ${pad('surface', 10)}${pad('outcome', 9)}${pad('score', 7)}${pad('quality', 11)}${formulaIds.map((id) => pad(id, 16)).join('')}`);
  for (const row of report.perOutcome) {
    lines.push(
      `  ${pad(row.surface, 10)}${pad(row.outcome, 9)}${pad(row.score, 7)}${pad(row.qualitySignal, 11)}`
      + formulaIds.map((id) => pad(`+${row.deltas[id]}`, 16)).join('')
    );
  }
  lines.push('');
  lines.push(`2. Completions needed to first reach each rank when every run is that outcome (cap ${report.maxCompletions}; "-" = not reached)`);
  lines.push(`  ${pad('surface', 10)}${pad('outcome', 9)}${pad('formula', 16)}${RANK_TARGETS.map(({ rank, threshold }) => pad(`${rank}(${threshold})`, 8)).join('')}`);
  for (const row of report.completionsToRank) {
    lines.push(
      `  ${pad(row.surface, 10)}${pad(row.outcome, 9)}${pad(row.formula, 16)}`
      + RANK_TARGETS.map(({ rank }) => pad(row.ranks[rank] ?? '-', 8)).join('')
    );
  }
  lines.push('');
  lines.push('3. Struggle then recovery: 3 failed then 4 perfect, target after each completion');
  for (const row of report.recovery) {
    lines.push(`  ${pad(row.surface, 10)}${pad(row.formula, 16)}${row.targets.join(' -> ')}`);
  }
  lines.push('');
  return lines.join('\n');
};

const readMaxCompletions = (argv: readonly string[]): number => {
  const raw = argv.find((arg) => arg.startsWith('--max-completions='))?.split('=')[1];
  const parsed = raw === undefined ? 150 : Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 150;
};

const main = (): void => {
  const argv = process.argv.slice(2);
  const report = buildComparisonReport(readMaxCompletions(argv));
  process.stdout.write(
    argv.includes('--json')
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${formatComparisonReport(report)}\n`
  );
};

// Only run as a script, never when imported (tests import the pure builders).
const isDirectExecution = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectExecution) {
  main();
}
