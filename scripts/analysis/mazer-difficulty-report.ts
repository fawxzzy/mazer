/**
 * DRAFT difficulty report (packet P7): runs the fallible practice bots over the
 * production maze generator for a range of levels and prints per-tier rows, a
 * monotonicity violation rate, and a ladder-ceiling estimate.
 *
 *   npx vite-node ./scripts/analysis/mazer-difficulty-report.ts
 *   npx vite-node ./scripts/analysis/mazer-difficulty-report.ts --first=2 --last=40 --seeds=6 --epsilon=4 --json
 *
 * Deterministic: fixed per-level maze seeds, fixed bot seeds, no clock.
 * Hazards are hand-placed by a fixed rule from the P3 specs and every placement
 * is checked with `validateLevelHazards`; a rejected placement is dropped and
 * counted, never silently kept.
 */

import {
  shuttlePeriod,
  type HazardGraph,
  type HazardSpec
} from '../../src/mazer-core/hazards/graphContract';
import { validateLevelHazards } from '../../src/mazer-core/hazards/validation';
import { DEFAULT_BOT_LADDER } from '../../src/mazer-core/eval/bots';
import {
  checkMonotoneDifficulty,
  computeLadderCeiling,
  type DifficultyLevelSpec,
  type LevelDifficultyMeasurement
} from '../../src/mazer-core/eval/difficultyReport';
import { createLegacyMaze, type LegacyMazeGenerationProfile } from '../../src/legacy-runtime/legacyMaze';
import { createLegacyMazeHazardGraph } from '../../src/legacy-runtime/legacyHazardGraphAdapter';

const parseInt32 = (name: string, fallback: number): number => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const value = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const FIRST_LEVEL = Math.max(2, parseInt32('first', 2));
const LAST_LEVEL = parseInt32('last', 40);
const SEED_COUNT = Math.max(1, parseInt32('seeds', 6));
const EPSILON = parseInt32('epsilon', 4);
const BOARD_SIZE = 35;
const JSON_OUTPUT = process.argv.includes('--json');

// ---------------------------------------------------------------------------
// STAND-IN geometry profiles. The real budget lane (P2) is unmerged, so this is
// a small local approximation of its nested tape: branch rungs first, dead-end
// caps from level 7, wrap rungs from level 12.
// replace with resolveGeometryBudgetProfile when integrated
// ---------------------------------------------------------------------------
const STAND_IN_CHECKPOINTS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40] as const;
const STAND_IN_DEAD_CAPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32] as const;
const STAND_IN_WRAPS = [
  { horizontal: true, vertical: false, feeders: null },
  { horizontal: true, vertical: true, feeders: null },
  { horizontal: true, vertical: true, feeders: 2 },
  { horizontal: true, vertical: true, feeders: 3 },
  { horizontal: true, vertical: true, feeders: 4 }
] as const;

const standInProfile = (level: number): Partial<LegacyMazeGenerationProfile> => {
  let branch = 0;
  let dead = 0;
  let wrap = 0;
  for (let rung = 1; rung <= level - 1; rung += 1) {
    const unlockedDead = rung >= 6;
    const unlockedWrap = rung >= 11;
    const turn = rung % 3;
    if (unlockedWrap && turn === 0 && wrap < STAND_IN_WRAPS.length) {
      wrap += 1;
    } else if (unlockedDead && turn === 1 && dead < STAND_IN_DEAD_CAPS.length) {
      dead += 1;
    } else if (branch < STAND_IN_CHECKPOINTS.length - 1) {
      branch += 1;
    } else if (dead < STAND_IN_DEAD_CAPS.length) {
      dead += 1;
    } else if (wrap < STAND_IN_WRAPS.length) {
      wrap += 1;
    }
  }
  const wrapStep = wrap === 0 ? null : STAND_IN_WRAPS[wrap - 1]!;
  return {
    checkpointCountOverride: STAND_IN_CHECKPOINTS[branch]!,
    straightnessBias: 0.95,
    maxDeadEndCount: dead === 0 ? 0 : STAND_IN_DEAD_CAPS[dead - 1]!,
    requiredOppositeBorderConnections: {
      horizontal: wrapStep?.horizontal ?? false,
      vertical: wrapStep?.vertical ?? false
    },
    borderFeederTargetPerSide: wrapStep?.feeders ?? null
  };
};

const mix32 = (a: number, b: number): number => {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

// ---------------------------------------------------------------------------
// Hand-placed example hazards (P3 specs) on the static shortest route.
// ---------------------------------------------------------------------------
const bfsRoute = (graph: HazardGraph, start: number, goal: number): number[] => {
  const previous = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let head = 0; head < queue.length && !previous.has(goal); head += 1) {
    for (const next of graph.neighbors(queue[head]!)) {
      if (!previous.has(next)) {
        previous.set(next, queue[head]!);
        queue.push(next);
      }
    }
  }
  const route: number[] = [];
  for (let cursor = goal; cursor !== -1; cursor = previous.get(cursor)!) {
    route.push(cursor);
  }
  return route.reverse();
};

interface HazardPlan {
  readonly specs: HazardSpec[];
  readonly dropped: number;
}

const placeHazards = (graph: HazardGraph, start: number, goal: number, level: number): HazardPlan => {
  const route = bfsRoute(graph, start, goal);
  const accepted: HazardSpec[] = [];
  let dropped = 0;
  const tryAdd = (spec: HazardSpec): void => {
    const verdict = validateLevelHazards(graph, [...accepted, spec], { start, goal });
    if (verdict.pass) {
      accepted.push(spec);
    } else {
      dropped += 1;
    }
  };
  const at = (fraction: number): number => route[Math.max(1, Math.min(route.length - 2, Math.floor(route.length * fraction)))]!;

  // Timed gates from level 8: one more gate every 8 levels, open 2 of every 3 or 4 ticks.
  const gateCount = level < 8 ? 0 : 1 + Math.floor((level - 8) / 8);
  for (let i = 0; i < gateCount; i += 1) {
    const period = i % 2 === 0 ? 4 : 3;
    tryAdd({
      kind: 'timedGate',
      cell: at((i + 1) / (gateCount + 1)),
      period,
      openFrom: 1,
      openFor: period - 1
    });
  }

  // One shuttle patroller from level 16, placed on a junction-adjacent stretch of the route.
  if (level >= 16) {
    const length = 3 + Math.min(4, Math.floor((level - 16) / 8));
    const junctions = route
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell, index }) => index > 2 && index < route.length - length - 2 && graph.isJunction(cell));
    for (const { index } of junctions) {
      const patrolRoute = route.slice(index, index + length);
      const before = accepted.length;
      tryAdd({ kind: 'patrol', route: patrolRoute, period: shuttlePeriod(patrolRoute.length), phase: level % 3 });
      if (accepted.length > before) {
        break;
      }
    }
  }
  return { specs: accepted, dropped };
};

// ---------------------------------------------------------------------------

const levelCache = new Map<number, { spec: DifficultyLevelSpec; dropped: number; hazardCount: number }>();

const buildLevel = (level: number): DifficultyLevelSpec => {
  const cached = levelCache.get(level);
  if (cached) {
    return cached.spec;
  }
  const maze = createLegacyMaze(BOARD_SIZE, BOARD_SIZE, mix32(20261105, level), undefined, standInProfile(level));
  const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
  const plan = placeHazards(graph, start, goal, level);
  const spec: DifficultyLevelSpec = { levelId: `L${level}`, graph, start, goal, hazards: plan.specs };
  levelCache.set(level, { spec, dropped: plan.dropped, hazardCount: plan.specs.length });
  return spec;
};

const seeds = Array.from({ length: SEED_COUNT }, (_, i) => mix32(0xb07, i + 1));
const bots = DEFAULT_BOT_LADDER;

const report = computeLadderCeiling(buildLevel, {
  firstLevel: FIRST_LEVEL,
  lastLevel: LAST_LEVEL,
  bots,
  seeds,
  tolerance: 15,
  minRun: 5,
  smoothSpan: 5
});
const monotone = checkMonotoneDifficulty(report.measurements, { epsilon: EPSILON });

const fmt = (value: number | null, digits = 1): string => (value === null ? '-' : value.toFixed(digits));
const pad = (value: string, width: number): string => value.padStart(width);

const tierCell = (measurement: LevelDifficultyMeasurement, kind: string): string => {
  const tier = measurement.tiers.find((entry) => entry.kind === kind);
  if (!tier) {
    return '';
  }
  return `${pad(fmt(tier.passRate * 100, 0), 4)}% ${pad(fmt(tier.meanTurns, 0), 5)}t ${pad(fmt(tier.meanWaits, 1), 4)}w ${pad(fmt(tier.meanContacts, 1), 4)}c`;
};

if (JSON_OUTPUT) {
  process.stdout.write(`${JSON.stringify({ report, monotone }, null, 2)}\n`);
} else {
  console.log(`Mazer difficulty report (DRAFT) board=${BOARD_SIZE}x${BOARD_SIZE} seeds=${SEED_COUNT} bots=${bots.length}`);
  console.log('geometry profiles are a STAND-IN, not resolveGeometryBudgetProfile');
  console.log(`${pad('lvl', 3)} ${pad('len', 4)} ${pad('H1', 6)} ${pad('hz', 2)} ${pad('drp', 3)} ${pad('index', 7)} | oracle t/w   | limited pass turns waits hits | noisy pass turns waits hits | myopic pass turns waits hits`);
  report.measurements.forEach((measurement, row) => {
    const level = report.levels[row]!;
    const cached = levelCache.get(level)!;
    const oracle = `${pad(fmt(measurement.oracleTicks, 0), 4)}/${pad(fmt(measurement.oracleWaits, 0), 2)}`;
    console.log([
      pad(String(level), 3),
      pad(fmt(measurement.geometry?.len ?? null, 0), 4),
      pad(fmt(measurement.geometry?.h1 ?? null, 1), 6),
      pad(String(cached.hazardCount), 2),
      pad(String(cached.dropped), 3),
      pad(fmt(measurement.index, 1), 7),
      '|',
      oracle.padEnd(11),
      '|',
      tierCell(measurement, 'planner-limited'),
      '|',
      tierCell(measurement, 'planner-noisy'),
      '|',
      tierCell(measurement, 'myopic')
    ].join(' '));
  });
  const indices = report.measurements.map((measurement) => measurement.index!);
  const blockSize = Math.max(1, Math.ceil(indices.length / 4));
  const blocks: string[] = [];
  for (let from = 0; from < indices.length; from += blockSize) {
    const slice = indices.slice(from, from + blockSize);
    blocks.push(`L${report.levels[from]}-${report.levels[from + slice.length - 1]}=${fmt(slice.reduce((a, b) => a + b, 0) / slice.length)}`);
  }
  console.log(`mean index by block: ${blocks.join('  ')}`);
  console.log(`monotone: pairs=${monotone.pairs} violations=${monotone.violationCount} rate=${(monotone.violationRate * 100).toFixed(1)}% worstDrop=${monotone.worstDrop.toFixed(1)} epsilon=${monotone.epsilon}`);
  console.log(`ladder ceiling: ${report.ceilingLevel === null ? 'none within range' : `level ${report.ceilingLevel} (index ${fmt(report.ceilingIndex)})`}; unsolvable levels: ${report.unsolvableLevels.length === 0 ? 'none' : report.unsolvableLevels.join(',')}`);
}
