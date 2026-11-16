// Slice H5: fallible-bot clear-time and contact distributions with Hunters, over the shipped ladder.
//
//   npx vite-node --script scripts/analysis/hunter-bot-distributions.ts -- [--levels=35,60,150,300] [--seeds=4]
//     [--boards=phone,desktop] [--assert] [--out=<file.json>]
//
// For every (level, board, seed) it generates the shipped maze, runs the H2 overlay (gates, Sentries) and the H5
// Hunter overlay on top, times the joint verdict of the shipped set, then plays the level with three bots through
// the deterministic Hunter run (`stepHunterRun`):
//   - exact:   replays the stored joint witness (the demo path); must clear in witness ticks with 0 contacts;
//   - careful: probes 3 ticks ahead along the static shortest path and avoids predicted contact, 5% random errors;
//   - sloppy:  probes 1 tick ahead, 15% random errors.
// Errors come from a seeded mix32 stream, so every number below is reproducible. Every run is replayed from its
// recorded input log and the digests must match (replay determinism).
//
// --assert exits 1 unless: joint verdict median < 40 ms (state cap 200k); no Hunter ever exceeds 3 contacts; the
// exact bot clears every Hunter level clean in witness ticks; every replay digest matches; L35 ships 1 Hunter at
// speed divisor 3 when its overlay is full; fallible bots strand (no clear within the tick budget) in at most 5% of runs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createLegacyMazeHazardGraph } from '../../src/legacy-runtime/legacyHazardGraphAdapter';
import { resolveLegacyHazardOverlay } from '../../src/legacy-runtime/legacyHazardOverlay';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import {
  HAZARD_ACTION_ORDER,
  HUNTER_BURNOUT_CONTACTS,
  HUNTER_VERDICT_MEDIAN_BUDGET_MS,
  checkHunterJointVerdict,
  computeHunterOverlay,
  createHunterRunContext,
  decodeHunterInputLog,
  encodeHunterInputLog,
  mix32,
  playHunterRun,
  replayHunterRun,
  staticDistancesFrom,
  stepHunterRun,
  type HazardAction,
  type HazardGraph,
  type HunterRunContext,
  type HunterRunPolicy,
  type HunterRunState
} from '../../src/mazer-core/hazards';
import { findWitnessRouteWithChasers } from '../../src/mazer-core/hazards/chaserSolvability';
import { LADDER_BOARDS, generateLadderMaze, seedForIndex } from './lib/progressionLadderSampling';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

export const STRANDED_RATE_MAX = 0.05;

export interface BotProfile {
  readonly name: string;
  /** witness = replay the stored joint witness; planner = A* joint plan, replanned after every slip or contact; probe = static route with a short lookahead. */
  readonly kind: 'witness' | 'planner' | 'probe';
  /** Probe bots: ticks looked ahead. */
  readonly horizon: number;
  /** Share of ticks replaced by a uniformly random action (a slip). */
  readonly errorRate: number;
  /** Counted in the stranding assertion (the reckless probe bot is reported for information only). */
  readonly asserted: boolean;
}

export const BOTS: readonly BotProfile[] = [
  { name: 'exact', kind: 'witness', horizon: 0, errorRate: 0, asserted: true },
  { name: 'careful', kind: 'planner', horizon: 0, errorRate: 0.05, asserted: true },
  { name: 'sloppy', kind: 'planner', horizon: 0, errorRate: 0.15, asserted: true },
  { name: 'reckless', kind: 'probe', horizon: 2, errorRate: 0.1, asserted: false }
];

/** State cap of one bot replan (bots only; not part of any verdict). */
export const BOT_PLAN_STATE_CAP = 50_000;

export interface BotRunRow {
  readonly bot: string;
  readonly reachedGoal: boolean;
  readonly ticks: number;
  readonly contacts: number;
  readonly maxHunterContacts: number;
  readonly burnouts: number;
  readonly clean: boolean;
  readonly replayMatches: boolean;
}

export interface LevelRow {
  readonly level: number;
  readonly board: string;
  readonly seedIndex: number;
  readonly width: number;
  readonly height: number;
  readonly gates: number;
  readonly sentries: number;
  readonly huntersAllocated: number;
  readonly huntersShipped: number;
  readonly speedDivisor: number | null;
  readonly hunterStatus: string;
  readonly hunterReasons: readonly string[];
  readonly verdictRuns: number;
  readonly overlayMs: number;
  /** One joint verdict of the shipped set (null when no Hunter ships). */
  readonly verdictMs: number | null;
  readonly witnessTicks: number | null;
  readonly runs: readonly BotRunRow[];
}

const quantile = (values: readonly number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
};

/** Greedy static step: the move that lowers the static distance to the goal most (first in action order on ties). */
const greedyAction = (graph: HazardGraph, toGoal: Int32Array, cell: number): HazardAction => {
  let best: HazardAction = 'wait';
  let bestDistance = toGoal[cell]!;
  for (const action of HAZARD_ACTION_ORDER) {
    if (action === 'wait') { continue; }
    const next = graph.moveTarget(cell, action);
    if (next >= 0 && toGoal[next]! >= 0 && toGoal[next]! < bestDistance) {
      best = action;
      bestDistance = toGoal[next]!;
    }
  }
  return best;
};

const slip = (bot: BotProfile, rngSeed: number, state: HunterRunState): HazardAction | null => {
  const roll = mix32(rngSeed, state.tick, state.contacts);
  return (roll % 10_000) / 10_000 < bot.errorRate ? HAZARD_ACTION_ORDER[mix32(roll, 0x5eed) % HAZARD_ACTION_ORDER.length]! : null;
};

/**
 * Probe bot: scores each action by (predicted contact within `horizon` ticks along the static route, static
 * distance afterwards). Probes ignore the bot's own invulnerability, as a player dodges while blinking too.
 */
const probePolicy = (bot: BotProfile, toGoal: Int32Array, rngSeed: number): HunterRunPolicy => (
  (state: HunterRunState, context: HunterRunContext): HazardAction => {
    const slipped = slip(bot, rngSeed, state);
    if (slipped !== null) { return slipped; }
    const from = { ...state, invulnerable: 0 };
    let best: HazardAction = 'wait';
    let bestScore = Number.POSITIVE_INFINITY;
    for (const action of HAZARD_ACTION_ORDER) {
      let probe = stepHunterRun(context, from, action, { probe: true });
      let hit = probe.events.some((event) => event.type === 'contact');
      for (let depth = 1; depth < bot.horizon && !hit && !probe.state.reachedGoal; depth += 1) {
        probe = stepHunterRun(context, probe.state, greedyAction(context.graph, toGoal, probe.state.cell), { probe: true });
        hit = probe.events.some((event) => event.type === 'contact');
      }
      const score = (hit ? 1_000_000 : 0) + (probe.state.reachedGoal ? -1 : toGoal[probe.state.cell]!);
      if (score < bestScore) {
        bestScore = score;
        best = action;
      }
    }
    return best;
  }
);

/**
 * Planner bot: follows a joint A* plan (`findWitnessRouteWithChasers` from the live state: active Hunters, the
 * timeline, its own invulnerability) and replans after every slip, contact or eject. When no plan exists within
 * the bot cap it takes the static greedy step.
 */
const plannerPolicy = (bot: BotProfile, toGoal: Int32Array, rngSeed: number): HunterRunPolicy => {
  let plan: readonly HazardAction[] = [];
  let planTick = -1;
  let expectedCell = -1;
  return (state: HunterRunState, context: HunterRunContext): HazardAction => {
    const slipped = slip(bot, rngSeed, state);
    if (slipped !== null) {
      plan = [];
      return slipped;
    }
    const offset = state.tick - planTick;
    if (plan.length === 0 || offset >= plan.length || state.cell !== expectedCell) {
      const result = findWitnessRouteWithChasers(
        context.graph,
        context.timeline,
        state.hunters.filter((hunter) => !hunter.burnedOut).map((hunter) => hunter.engine),
        {
          start: state.cell, goal: context.goal, startTick: state.tick, invulnerableTurns: state.invulnerable,
          startHeading: state.heading, stateCap: BOT_PLAN_STATE_CAP
        }
      );
      if (result.status !== 'solvable' || result.witness.actions.length === 0) {
        plan = [];
        return greedyAction(context.graph, toGoal, state.cell);
      }
      plan = result.witness.actions as readonly HazardAction[];
      planTick = state.tick;
      const action = plan[0]!;
      expectedCell = action === 'wait' ? state.cell : context.graph.moveTarget(state.cell, action);
      return action;
    }
    const action = plan[offset]!;
    expectedCell = action === 'wait' ? state.cell : context.graph.moveTarget(state.cell, action);
    return action;
  };
};

const witnessPolicy = (actions: readonly HazardAction[]): HunterRunPolicy => (
  (state) => actions[state.tick] ?? 'wait'
);

export const runDistributions = (options: {
  levels: readonly number[]; seeds: number; boards: readonly (typeof LADDER_BOARDS[number])[];
}): LevelRow[] => {
  const rows: LevelRow[] = [];
  // Warm-up so JIT compilation is not billed to the first verdict.
  const warm = generateLadderMaze(40, LADDER_BOARDS[0], seedForIndex(0)) as LegacyMazeSnapshot;
  const warmOverlay = resolveLegacyHazardOverlay(warm, { enabled: true, level: 40 })!;
  const warmGraph = createLegacyMazeHazardGraph(warm);
  for (let i = 0; i < 3; i += 1) {
    computeHunterOverlay(warmGraph.graph, {
      start: warmGraph.start, goal: warmGraph.goal, hazardSeed: warmOverlay.seed, allocation: { hunters: 1, hunterTier: 0, sentries: 0 }, baseSpecs: warmOverlay.specs
    });
  }
  for (const level of options.levels) {
    for (const board of options.boards) {
      for (let seedIndex = 0; seedIndex < options.seeds; seedIndex += 1) {
        const maze = generateLadderMaze(level, board, seedForIndex(seedIndex)) as LegacyMazeSnapshot;
        const base = resolveLegacyHazardOverlay(maze, { enabled: true, level });
        if (base === null) { throw new Error('enabled overlay returned null'); }
        const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
        const begin = performance.now();
        const hunters = computeHunterOverlay(graph, {
          start, goal, hazardSeed: base.seed, allocation: base.allocation, baseSpecs: base.specs
        });
        const overlayMs = performance.now() - begin;
        let verdictMs: number | null = null;
        if (hunters.hunters.length > 0) {
          const t0 = performance.now();
          checkHunterJointVerdict(graph, base.specs, hunters.hunters, { start, goal });
          verdictMs = performance.now() - t0;
        }
        const witness = hunters.verdict?.witness ?? base.verdict?.witness ?? null;
        const context = createHunterRunContext({ graph, specs: base.specs, hunters: hunters.hunters, start, goal });
        const toGoal = staticDistancesFrom(graph, goal);
        const routeLength = toGoal[start]!;
        const maxTicks = 30 * Math.max(routeLength, witness?.ticks ?? 0) + 300;
        const runs: BotRunRow[] = [];
        for (const bot of BOTS) {
          if (bot.kind === 'witness' && witness === null) { continue; }
          const rngSeed = mix32(base.seed, level, seedIndex, BOTS.indexOf(bot));
          const policy = bot.kind === 'witness'
            ? witnessPolicy(witness!.actions as readonly HazardAction[])
            : bot.kind === 'planner' ? plannerPolicy(bot, toGoal, rngSeed) : probePolicy(bot, toGoal, rngSeed);
          const { result, log } = playHunterRun(context, policy, maxTicks);
          const replay = replayHunterRun(context, decodeHunterInputLog(encodeHunterInputLog(log)));
          runs.push({
            bot: bot.name,
            reachedGoal: result.reachedGoal,
            ticks: result.ticks,
            contacts: result.contacts,
            maxHunterContacts: Math.max(0, ...result.hunterContacts),
            burnouts: result.burnouts,
            clean: result.clean,
            replayMatches: replay.digest === result.digest && replay.ticks === result.ticks
          });
        }
        rows.push({
          level,
          board: board.name,
          seedIndex,
          width: maze.width,
          height: maze.height,
          gates: base.specs.filter((spec) => spec.kind === 'timedGate').length,
          sentries: base.specs.filter((spec) => spec.kind === 'patrol').length,
          huntersAllocated: base.allocation.hunters,
          huntersShipped: hunters.hunters.length,
          speedDivisor: hunters.speedDivisor,
          hunterStatus: hunters.status,
          hunterReasons: hunters.degradeReasons.map((reason) => reason.code),
          verdictRuns: hunters.verdictRuns,
          overlayMs: Math.round(overlayMs * 100) / 100,
          verdictMs: verdictMs === null ? null : Math.round(verdictMs * 100) / 100,
          witnessTicks: witness?.ticks ?? null,
          runs
        });
      }
    }
  }
  return rows;
};

const fmt = (values: readonly number[]): string => (
  values.length === 0 ? 'n/a' : `${quantile(values, 0.5)} / ${quantile(values, 0.9)} / ${Math.max(...values)}`
);

export const summarize = (rows: readonly LevelRow[]): string => {
  const lines: string[] = [];
  lines.push('| level | runs | hunters shipped/alloc | divisor | status (full/degraded/none) | verdict ms med / max | overlay ms med / max |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const level of [...new Set(rows.map((row) => row.level))]) {
    const subset = rows.filter((row) => row.level === level);
    const verdicts = subset.map((row) => row.verdictMs).filter((value): value is number => value !== null);
    const overlays = subset.map((row) => row.overlayMs);
    const count = (status: string): number => subset.filter((row) => row.hunterStatus === status).length;
    const divisors = [...new Set(subset.map((row) => row.speedDivisor).filter((value) => value !== null))].join(',') || '-';
    lines.push(`| ${level} | ${subset.length} | ${subset.reduce((n, row) => n + row.huntersShipped, 0)}/${subset.reduce((n, row) => n + row.huntersAllocated, 0)} | `
      + `${divisors} | ${count('full')}/${count('degraded')}/${count('none')} | `
      + `${verdicts.length ? `${quantile(verdicts, 0.5).toFixed(2)} / ${Math.max(...verdicts).toFixed(2)}` : 'n/a'} | `
      + `${quantile(overlays, 0.5).toFixed(2)} / ${Math.max(...overlays).toFixed(2)} |`);
  }
  lines.push('');
  lines.push('| level | bot | runs | cleared | stranded | clear ticks med/p90/max | ticks / witness med | contacts med/p90/max | clean | burnouts | max per Hunter |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const level of [...new Set(rows.map((row) => row.level))]) {
    for (const bot of BOTS) {
      const pairs = rows.filter((row) => row.level === level).flatMap((row) => row.runs.filter((run) => run.bot === bot.name).map((run) => ({ row, run })));
      if (pairs.length === 0) { continue; }
      const cleared = pairs.filter(({ run }) => run.reachedGoal);
      const ratios = cleared.filter(({ row }) => row.witnessTicks).map(({ row, run }) => Math.round((run.ticks / row.witnessTicks!) * 100) / 100);
      lines.push(`| ${level} | ${bot.name} | ${pairs.length} | ${cleared.length} | ${pairs.length - cleared.length} | `
        + `${fmt(cleared.map(({ run }) => run.ticks))} | ${ratios.length ? quantile(ratios, 0.5).toFixed(2) : 'n/a'} | `
        + `${fmt(pairs.map(({ run }) => run.contacts))} | ${pairs.filter(({ run }) => run.clean).length} | `
        + `${pairs.reduce((n, { run }) => n + run.burnouts, 0)} | ${Math.max(0, ...pairs.map(({ run }) => run.maxHunterContacts))} |`);
    }
  }
  const reasonCounts = new Map<string, number>();
  for (const row of rows) {
    for (const reason of new Set(row.hunterReasons)) { reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1); }
  }
  lines.push('');
  lines.push(`hunter degrade reasons (rows carrying each): ${[...reasonCounts.entries()].map(([code, n]) => `${code}=${n}`).join(', ') || 'none'}`);
  return lines.join('\n');
};

export const assertDistributions = (rows: readonly LevelRow[]): string[] => {
  const failures: string[] = [];
  const verdicts = rows.map((row) => row.verdictMs).filter((value): value is number => value !== null);
  if (verdicts.length === 0) {
    failures.push('no level shipped a Hunter, so the joint verdict was never measured');
  } else if (quantile(verdicts, 0.5) >= HUNTER_VERDICT_MEDIAN_BUDGET_MS) {
    failures.push(`joint verdict median ${quantile(verdicts, 0.5).toFixed(2)} ms >= ${HUNTER_VERDICT_MEDIAN_BUDGET_MS} ms`);
  }
  let fallible = 0;
  let stranded = 0;
  for (const row of rows) {
    const where = `L${row.level} ${row.board} seed ${row.seedIndex}`;
    for (const run of row.runs) {
      if (run.maxHunterContacts > HUNTER_BURNOUT_CONTACTS) {
        failures.push(`${where} ${run.bot}: a Hunter made ${run.maxHunterContacts} contacts (> ${HUNTER_BURNOUT_CONTACTS})`);
      }
      if (!run.replayMatches) {
        failures.push(`${where} ${run.bot}: replay digest differs from the live run`);
      }
      if (run.bot === 'exact' && row.huntersShipped > 0 && !(run.clean && run.ticks === row.witnessTicks)) {
        failures.push(`${where} exact: ${run.ticks} ticks, ${run.contacts} contacts (witness ${row.witnessTicks})`);
      }
      if (run.bot !== 'exact' && BOTS.find((bot) => bot.name === run.bot)?.asserted === true) {
        fallible += 1;
        stranded += run.reachedGoal ? 0 : 1;
      }
    }
    if (row.level === 35 && row.hunterStatus === 'full' && !(row.huntersShipped === 1 && row.speedDivisor === 3)) {
      failures.push(`${where}: L35 shipped ${row.huntersShipped} Hunter(s) at divisor ${row.speedDivisor} (want 1 at 3)`);
    }
  }
  if (fallible > 0 && stranded / fallible > STRANDED_RATE_MAX) {
    failures.push(`fallible bots stranded in ${stranded}/${fallible} runs (> ${STRANDED_RATE_MAX * 100}%)`);
  }
  return failures;
};

const isMain = process.argv.some((value) => value.endsWith('hunter-bot-distributions.ts'));
if (isMain) {
  const rows = runDistributions({
    levels: arg('levels', '35,60,150,300').split(',').map(Number),
    seeds: Number(arg('seeds', '4')),
    boards: arg('boards', 'phone,desktop').split(',').map((name) => {
      const board = LADDER_BOARDS.find((entry) => entry.name === name);
      if (!board) { throw new Error(`unknown board ${name}`); }
      return board;
    })
  });
  console.log(summarize(rows));
  const out = arg('out', '');
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`);
    console.log(`wrote ${rows.length} rows to ${out}`);
  }
  if (process.argv.includes('--assert')) {
    const failures = assertDistributions(rows);
    if (failures.length > 0) {
      console.error(`ASSERT FAILED (${failures.length}):\n${failures.slice(0, 40).map((line) => `- ${line}`).join('\n')}`);
      process.exit(1);
    }
    console.log('ASSERT PASS');
  }
}
