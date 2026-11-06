import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createLegacyRuntimeMazeForMode,
  LEGACY_GENERATION_SELECTION_DEFAULT_TOLERANCE,
  type LegacyGenerationMode
} from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  resolveLegacyPlayableShortestPath,
  resolveLegacyShortestPath
} from '../../src/legacy-runtime/legacyMaze';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeComplexity,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionDifficultyProfile,
  resolveLegacyProgressionLevel,
  resolveLegacyProgressionScaleDetail
} from '../../src/legacy-runtime/legacyProgression';

// Measurement-only harness for "lane E: difficulty shaping". It reports how
// closely the PRODUCTION generation pipeline (createLegacyRuntimeMazeForMode
// with a targetComplexity, i.e. the default candidate search plus any
// pressure/adaptive retry) tracks the complexity target. It never mocks
// generation and never changes behaviour; it only reads the result.

export const LEGACY_GENERATION_DELIVERY_REPORT_SCHEMA = 'mazer.legacy-generation-delivery-report.v1';
export const LEGACY_GENERATION_DELIVERY_DEFAULT_TARGETS: readonly number[] = [8, 12, 16, 24, 44, 60, 90, 140, 200];
export const LEGACY_GENERATION_DELIVERY_DEFAULT_SEED_START = 1;
export const LEGACY_GENERATION_DELIVERY_DEFAULT_SEED_END = 24;
// Same default the in-game player settings use (settings.scale); see the
// header notes in the report for why no viewport is applied.
export const LEGACY_GENERATION_DELIVERY_BASE_SCALE = 50;
// Mirrors the lifecycle's own selection tolerance (imported, not copied).
export const LEGACY_GENERATION_DELIVERY_TOLERANCE = LEGACY_GENERATION_SELECTION_DEFAULT_TOLERANCE;

export type LegacyGenerationDeliverySurface = 'play' | 'menu';

export interface LegacyGenerationDeliveryReportOptions {
  readonly seeds?: readonly number[];
  readonly surface?: LegacyGenerationDeliverySurface;
  readonly targets?: readonly number[];
}

export interface LegacyGenerationDeliveryTargetRow {
  readonly band: string;
  readonly boardHeightMean: number;
  readonly boardWidthMean: number;
  readonly complexityTotalMax: number;
  readonly complexityTotalMean: number;
  readonly complexityTotalMin: number;
  readonly countAdaptiveRetryUsed: number;
  readonly countOverTarget: number;
  readonly countOverTargetPlusTolerance: number;
  readonly countPressureRetryUsed: number;
  readonly countUnderTarget: number;
  readonly countUnderTargetMinusTolerance: number;
  readonly deadEndCountMean: number;
  readonly deliveryCounts: {
    readonly 'on-target': number;
    readonly 'over-target': number;
    readonly 'under-target': number;
  };
  readonly directShortestPathStepsMean: number;
  readonly edgeWrapsMean: number;
  readonly edgeWrapsMax: number;
  readonly n: number;
  readonly overshootMean: number;
  readonly playableShortestPathStepsMean: number;
  readonly resolvedScale: number;
  readonly searchedCandidateCountMean: number;
  readonly splitCountMean: number;
  readonly target: number;
}

export interface LegacyGenerationDeliveryReport {
  readonly header: {
    readonly aspectRatio: number;
    readonly baseScale: number;
    readonly notes: readonly string[];
    readonly schema: string;
    readonly seeds: readonly number[];
    readonly selectionTolerance: number;
    readonly surface: LegacyGenerationDeliverySurface;
    readonly targets: readonly number[];
    readonly viewport: null;
  };
  readonly observations: {
    readonly firstTargetWithEdgeWraps: number | null;
    readonly meanOvershootPerTarget: Readonly<Record<string, number>>;
    readonly playableShortestPathMeanNonDecreasingInTarget: boolean;
    readonly playableShortestPathDecreases: readonly { readonly from: number; readonly to: number }[];
    readonly targetsWithAnyUnderTarget: readonly number[];
  };
  readonly rows: readonly LegacyGenerationDeliveryTargetRow[];
}

const round = (value: number, precision = 3): number => {
  const factor = 10 ** precision;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const mean = (values: readonly number[]): number => (
  values.length === 0 ? 0 : round(values.reduce((sum, value) => sum + value, 0) / values.length)
);

const countWhere = <T>(values: readonly T[], predicate: (value: T) => boolean): number => (
  values.filter(predicate).length
);

export const buildLegacyGenerationDeliverySeeds = (start: number, end: number): number[] => {
  const seeds: number[] = [];
  for (let seed = start; seed <= end; seed += 1) {
    seeds.push(seed);
  }
  return seeds;
};

const measureTarget = (
  target: number,
  seeds: readonly number[],
  surface: LegacyGenerationDeliverySurface
): LegacyGenerationDeliveryTargetRow => {
  const mode: LegacyGenerationMode = surface;
  // Same construction as the production adapter: the player track with the
  // requested targetComplexity, scale/profile resolved from it, then the
  // production entry point with only { targetComplexity } selection options.
  const baseTrack = createEmptyLegacyProgressionState().tracks.player;
  const track = {
    ...baseTrack,
    level: String(resolveLegacyProgressionLevel(target)),
    targetComplexity: target
  } as typeof baseTrack;
  const difficulty = resolveLegacyProgressionDifficultyProfile(target);
  const scaleDetail = resolveLegacyProgressionScaleDetail(
    LEGACY_GENERATION_DELIVERY_BASE_SCALE,
    track,
    { surface }
  );
  const profile = resolveLegacyMazeGenerationProfileForProgression(track, { fraction: scaleDetail.fraction });

  const samples = seeds.map((seed) => {
    const maze = createLegacyRuntimeMazeForMode(
      mode,
      scaleDetail.scale,
      seed,
      profile,
      { targetComplexity: target },
      1
    );
    const complexity = resolveLegacyMazeComplexity(maze);
    const playable = resolveLegacyPlayableShortestPath(maze.grid, maze.start, maze.goal);
    const direct = resolveLegacyShortestPath(maze.grid, maze.start, maze.goal, 'direct-floor');
    const selection = maze.generation?.selection;
    return {
      adaptiveRetryUsed: selection?.adaptiveRetryUsed === true,
      deadEnds: complexity.deadEndCount,
      delivery: selection?.delivery ?? 'on-target',
      direct: direct.stepCount ?? 0,
      height: maze.height,
      playable: playable.stepCount ?? 0,
      pressureRetryUsed: selection?.pressureRetryUsed === true,
      searched: selection?.searchedCandidateCount ?? 0,
      splits: complexity.splitCount,
      total: complexity.total,
      width: maze.width,
      wraps: complexity.edgeWrapCount
    };
  });

  const totals = samples.map((sample) => sample.total);
  const tolerance = LEGACY_GENERATION_DELIVERY_TOLERANCE;
  return {
    band: difficulty.band,
    boardHeightMean: mean(samples.map((sample) => sample.height)),
    boardWidthMean: mean(samples.map((sample) => sample.width)),
    complexityTotalMax: round(totals.length === 0 ? 0 : Math.max(...totals)),
    complexityTotalMean: mean(totals),
    complexityTotalMin: round(totals.length === 0 ? 0 : Math.min(...totals)),
    countAdaptiveRetryUsed: countWhere(samples, (sample) => sample.adaptiveRetryUsed),
    countOverTarget: countWhere(totals, (total) => total > target),
    countOverTargetPlusTolerance: countWhere(totals, (total) => total > target + tolerance),
    countPressureRetryUsed: countWhere(samples, (sample) => sample.pressureRetryUsed),
    countUnderTarget: countWhere(totals, (total) => total < target),
    countUnderTargetMinusTolerance: countWhere(totals, (total) => total < target - tolerance),
    deadEndCountMean: mean(samples.map((sample) => sample.deadEnds)),
    deliveryCounts: {
      'on-target': countWhere(samples, (sample) => sample.delivery === 'on-target'),
      'over-target': countWhere(samples, (sample) => sample.delivery === 'over-target'),
      'under-target': countWhere(samples, (sample) => sample.delivery === 'under-target')
    },
    directShortestPathStepsMean: mean(samples.map((sample) => sample.direct)),
    edgeWrapsMax: samples.length === 0 ? 0 : Math.max(...samples.map((sample) => sample.wraps)),
    edgeWrapsMean: mean(samples.map((sample) => sample.wraps)),
    n: samples.length,
    overshootMean: mean(totals.map((total) => total - target)),
    playableShortestPathStepsMean: mean(samples.map((sample) => sample.playable)),
    resolvedScale: scaleDetail.scale,
    searchedCandidateCountMean: mean(samples.map((sample) => sample.searched)),
    splitCountMean: mean(samples.map((sample) => sample.splits)),
    target
  };
};

export const buildGenerationDeliveryReport = ({
  seeds = buildLegacyGenerationDeliverySeeds(
    LEGACY_GENERATION_DELIVERY_DEFAULT_SEED_START,
    LEGACY_GENERATION_DELIVERY_DEFAULT_SEED_END
  ),
  surface = 'play',
  targets = LEGACY_GENERATION_DELIVERY_DEFAULT_TARGETS
}: LegacyGenerationDeliveryReportOptions = {}): LegacyGenerationDeliveryReport => {
  const rows = targets.map((target) => measureTarget(target, seeds, surface));

  const decreases: { from: number; to: number }[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous && current && current.playableShortestPathStepsMean < previous.playableShortestPathStepsMean) {
      decreases.push({ from: previous.target, to: current.target });
    }
  }
  const meanOvershootPerTarget: Record<string, number> = {};
  for (const row of rows) {
    meanOvershootPerTarget[String(row.target)] = row.overshootMean;
  }

  return {
    header: {
      aspectRatio: 1,
      baseScale: LEGACY_GENERATION_DELIVERY_BASE_SCALE,
      notes: [
        'Generation goes through createLegacyRuntimeMazeForMode with selection options { targetComplexity } only (production default candidate search + pressure/adaptive retries).',
        'No viewport is supplied to resolveLegacyProgressionScaleDetail, so the device scale cap is the no-viewport default (96) and the feeder fraction comes from that; aspectRatio is fixed at 1. Real devices may resolve different scales.',
        'Seeds are passed to generation unchanged (seed N is candidate seed N, N+1, ...).',
        'Over/under counts are reported both strictly against the target and against target +/- selectionTolerance.',
        'Observations are descriptive only; they are not pass/fail gates.'
      ],
      schema: LEGACY_GENERATION_DELIVERY_REPORT_SCHEMA,
      seeds: [...seeds],
      selectionTolerance: LEGACY_GENERATION_DELIVERY_TOLERANCE,
      surface,
      targets: [...targets],
      viewport: null
    },
    observations: {
      firstTargetWithEdgeWraps: rows.find((row) => row.edgeWrapsMean > 0)?.target ?? null,
      meanOvershootPerTarget,
      playableShortestPathDecreases: decreases,
      playableShortestPathMeanNonDecreasingInTarget: decreases.length === 0,
      targetsWithAnyUnderTarget: rows.filter((row) => row.countUnderTarget > 0).map((row) => row.target)
    },
    rows
  };
};

const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, sortKeysDeep(record[key])])
    );
  }
  return value;
};

export const serializeGenerationDeliveryReport = (report: LegacyGenerationDeliveryReport): string => (
  `${JSON.stringify(sortKeysDeep(report), null, 2)}\n`
);

export const formatGenerationDeliveryReportTable = (report: LegacyGenerationDeliveryReport): string => {
  const columns: readonly [string, (row: LegacyGenerationDeliveryTargetRow) => string | number][] = [
    ['target', (row) => row.target],
    ['n', (row) => row.n],
    ['scale', (row) => row.resolvedScale],
    ['band', (row) => row.band],
    ['totMean', (row) => row.complexityTotalMean],
    ['totMin', (row) => row.complexityTotalMin],
    ['totMax', (row) => row.complexityTotalMax],
    ['over', (row) => row.countOverTarget],
    ['over+tol', (row) => row.countOverTargetPlusTolerance],
    ['under', (row) => row.countUnderTarget],
    ['under-tol', (row) => row.countUnderTargetMinusTolerance],
    ['playSP', (row) => row.playableShortestPathStepsMean],
    ['flatSP', (row) => row.directShortestPathStepsMean],
    ['wraps', (row) => row.edgeWrapsMean],
    ['dead', (row) => row.deadEndCountMean],
    ['split', (row) => row.splitCountMean],
    ['searched', (row) => row.searchedCandidateCountMean],
    ['pressRetry', (row) => row.countPressureRetryUsed],
    ['adaptRetry', (row) => row.countAdaptiveRetryUsed]
  ];
  const cells = report.rows.map((row) => columns.map(([, read]) => String(read(row))));
  const widths = columns.map(([name], index) => Math.max(
    name.length,
    ...cells.map((line) => line[index]?.length ?? 0)
  ));
  const render = (line: readonly string[]): string => line.map((cell, index) => cell.padStart(widths[index] ?? 0)).join('  ');
  const lines = [
    `Legacy generation delivery report (${report.header.schema})`,
    `surface=${report.header.surface} targets=[${report.header.targets.join(',')}] seeds=${report.header.seeds[0] ?? '-'}..${report.header.seeds.at(-1) ?? '-'} (n=${report.header.seeds.length}) tolerance=${report.header.selectionTolerance} viewport=none aspectRatio=${report.header.aspectRatio} baseScale=${report.header.baseScale}`,
    render(columns.map(([name]) => name)),
    ...cells.map(render),
    `playable shortest path mean non-decreasing in target: ${report.observations.playableShortestPathMeanNonDecreasingInTarget}`
      + (report.observations.playableShortestPathDecreases.length > 0
        ? ` (decreases: ${report.observations.playableShortestPathDecreases.map((entry) => `${entry.from}->${entry.to}`).join(', ')})`
        : ''),
    `first target with mean edge wraps > 0: ${report.observations.firstTargetWithEdgeWraps ?? 'none'}`,
    `targets with any under-target result: ${report.observations.targetsWithAnyUnderTarget.length > 0 ? report.observations.targetsWithAnyUnderTarget.join(', ') : 'none'}`
  ];
  return `${lines.join('\n')}\n`;
};

const readListArgument = (name: string): number[] | undefined => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }
  return raw.split(',').map(Number).filter((value) => Number.isFinite(value));
};

const readNumericArgument = (name: string): number | undefined => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  return raw === undefined ? undefined : Number(raw);
};

const isDirectExecution = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();

if (isDirectExecution) {
  const seedStart = readNumericArgument('seed-start') ?? LEGACY_GENERATION_DELIVERY_DEFAULT_SEED_START;
  const seedEnd = readNumericArgument('seed-end') ?? LEGACY_GENERATION_DELIVERY_DEFAULT_SEED_END;
  const surfaceArgument = process.argv.find((argument) => argument.startsWith('--surface='))?.slice('--surface='.length);
  const surface: LegacyGenerationDeliverySurface = process.argv.includes('--menu') || surfaceArgument === 'menu'
    ? 'menu'
    : 'play';
  const startedAtMs = Date.now();
  const report = buildGenerationDeliveryReport({
    seeds: buildLegacyGenerationDeliverySeeds(seedStart, seedEnd),
    surface,
    targets: readListArgument('targets') ?? LEGACY_GENERATION_DELIVERY_DEFAULT_TARGETS
  });
  // Wall time goes to stderr only so stdout stays byte-stable.
  process.stderr.write(`generation delivery report wall time: ${Date.now() - startedAtMs} ms\n`);
  process.stdout.write(
    process.argv.includes('--table')
      ? formatGenerationDeliveryReportTable(report)
      : serializeGenerationDeliveryReport(report)
  );
}
