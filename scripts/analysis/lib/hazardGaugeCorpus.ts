// Slice H7: hazard gauge corpus over the shipped ladder, the band assertions of product contract 2.5,
// and the hazard-menu runway.
//
// The corpus generates each shipped maze, runs the REAL H2 overlay on it (resolveLegacyHazardOverlay for
// the shipped ladder; computeHazardOverlay with a raised saturation level only for the runway probe),
// converts what the overlay shipped into plain coordinates, and re-measures everything with
// lib/hazardGauges.ts, which shares no code with the allocator, the placement or the H2 verdict.
import { resolveLegacyHazardOverlay } from '../../../src/legacy-runtime/legacyHazardOverlay';
import { createLegacyMazeHazardGraph, maskLegacyBleedGatedCells } from '../../../src/legacy-runtime/legacyHazardGraphAdapter';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from '../../../src/legacy-runtime/legacyGeometryBudget';
import type { LegacyMazeSnapshot } from '../../../src/legacy-runtime/legacyMaze';
import { measureFelt } from '../../../src/legacy-runtime/legacyMazeFeltDifficulty';
import { computeHazardOverlay, type HazardOverlayResult } from '../../../src/mazer-core/hazards/overlay';
import { allocateHazardUnits, nextHazardTailUnit, HAZARD_TAIL, type HazardTailState, type HazardTailUnit } from '../../../src/mazer-core/hazards/schedule';
import { BOT_TIERS, measureHazardGauges, spearman, type BotTier, type GaugePoint, type HazardGaugeResult } from './hazardGauges';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from './progressionLadderSampling';

export type LadderBoard = typeof LADDER_BOARDS[number];

export interface HazardGaugeRow {
  readonly level: number;
  readonly board: string;
  readonly seedIndex: number;
  readonly status: string;
  readonly allocatedGates: number;
  readonly allocatedSentries: number;
  readonly gateTier: number;
  readonly sentryTier: number;
  readonly hunters: number;
  readonly shards: number;
  readonly placedGates: number;
  readonly placedSentries: number;
  /** Units the allocation asks for that the overlay places (gates + Sentries + tiers bought). */
  readonly unitKey: string;
  readonly gauges: HazardGaugeResult;
  /** H2's own numbers, for the agreement check. */
  readonly overlayWitnessTicks: number | null;
  readonly overlayEscapeSlack: number | null;
  readonly mazeUnchanged: boolean;
}

const toPoint = (width: number, cell: number): GaugePoint => ({ x: cell % width, y: Math.floor(cell / width) });

/**
 * Plain-coordinate copy of what an overlay shipped (no hazard-module code beyond reading the result). The grid is
 * the one the overlay placed on: each Switch-gated wrap's openings walled (first-time cards spec D8, slice 5).
 */
export const overlayToGaugeInput = (maze: Pick<LegacyMazeSnapshot, 'grid' | 'start' | 'goal' | 'bleedGates'>, overlay: HazardOverlayResult | null) => {
  const width = maze.grid[0]?.length ?? 0;
  const specs = overlay?.specs ?? [];
  return {
    input: {
      grid: maskLegacyBleedGatedCells(maze.grid, maze.bleedGates),
      start: maze.start,
      goal: maze.goal,
      gates: specs.flatMap((spec) => (spec.kind === 'timedGate'
        ? [{ cell: toPoint(width, spec.cell), period: spec.period, openFrom: spec.openFrom, openFor: spec.openFor }]
        : [])),
      sentries: specs.flatMap((spec) => (spec.kind === 'patrol'
        ? [{ route: spec.route.map((cell) => toPoint(width, cell)), phase: spec.phase ?? 0 }]
        : []))
    },
    witness: overlay?.verdict?.witness ? overlay.verdict.witness.cells.map((cell) => toPoint(width, cell)) : null
  };
};

export interface MeasureOptions {
  /** Re-measure the felt number before and after the overlay (slow). */
  readonly felt?: boolean;
  /** Override the geometry saturation level the allocator freezes at (runway probe only). */
  readonly saturationLevel?: number;
}

export const measureHazardLevel = (level: number, board: LadderBoard, seedIndex: number, options: MeasureOptions = {}): HazardGaugeRow => {
  const maze = generateLadderMaze(level, board, seedForIndex(seedIndex)) as LegacyMazeSnapshot;
  const hashBefore = hashLadderMaze(maze);
  const feltBefore = options.felt ? JSON.stringify(measureFelt(maze)) : '';
  let overlay: HazardOverlayResult | null;
  if (options.saturationLevel === undefined) {
    overlay = resolveLegacyHazardOverlay(maze, { enabled: true, level });
  } else {
    const { graph, start, goal } = createLegacyMazeHazardGraph(maze);
    overlay = computeHazardOverlay(graph, { start, goal, mazeSeed: maze.seed, level, saturationLevel: options.saturationLevel });
  }
  if (overlay === null) { throw new Error('enabled overlay returned null'); }
  const mazeUnchanged = hashLadderMaze(maze) === hashBefore && (!options.felt || JSON.stringify(measureFelt(maze)) === feltBefore);
  const { input, witness } = overlayToGaugeInput(maze, overlay);
  const gauges = measureHazardGauges(input, witness);
  const a = overlay.allocation;
  return {
    level,
    board: board.name,
    seedIndex,
    status: overlay.status,
    allocatedGates: a.gates,
    allocatedSentries: a.sentries,
    gateTier: a.gateTier,
    sentryTier: a.sentryTier,
    hunters: a.hunters,
    shards: a.shards,
    placedGates: input.gates.length,
    placedSentries: input.sentries.length,
    unitKey: `g${a.gates}t${a.gateTier}s${a.sentries}t${a.sentryTier}`,
    gauges,
    overlayWitnessTicks: overlay.verdict?.witness?.ticks ?? null,
    overlayEscapeSlack: overlay.escapeSlack?.ratio ?? null,
    mazeUnchanged
  };
};

export interface CorpusOptions extends MeasureOptions {
  readonly from: number;
  readonly to: number;
  readonly step?: number;
  readonly seeds: number;
  readonly boards?: readonly LadderBoard[];
  readonly onRow?: (row: HazardGaugeRow) => void;
}

export const runHazardGaugeCorpus = (options: CorpusOptions): HazardGaugeRow[] => {
  const rows: HazardGaugeRow[] = [];
  for (let level = options.from; level <= options.to; level += options.step ?? 1) {
    for (const board of options.boards ?? LADDER_BOARDS) {
      for (let seedIndex = 0; seedIndex < options.seeds; seedIndex += 1) {
        const row = measureHazardLevel(level, board, seedIndex, options);
        rows.push(row);
        options.onRow?.(row);
      }
    }
  }
  return rows;
};

// ---------------------------------------------------------------------------
// Band assertions (contract 2.5)
// ---------------------------------------------------------------------------

export const BAND_WIDTH = 25;
export const SPEARMAN_MIN = 0.9;
export const ESCAPE_SLACK_MIN = 0.9;

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

export interface UnitStep {
  readonly level: number;
  readonly board: string;
  readonly from: string;
  readonly to: string;
  /** Mean hazardDelay of the plateau before / after the step, per seed. */
  readonly beforeBySeed: readonly number[];
  readonly afterBySeed: readonly number[];
  /** Worst (lowest) seed after minus best (highest) seed before: the strict ladder-report gap. */
  readonly worstVsBestGap: number;
  /** Plateau mean after minus before, all seeds pooled. */
  readonly meanGap: number;
}

export interface BandSummary {
  readonly board: string;
  readonly band: string;
  readonly from: number;
  readonly to: number;
  readonly runs: number;
  readonly hazardDelay: number;
  readonly escapeSlackMin: number | null;
  readonly contacts: Readonly<Record<BotTier, number>>;
  readonly cleanRate: Readonly<Record<BotTier, number>>;
  readonly placedUnits: number;
}

export interface AssertionResult {
  readonly name: string;
  /** integrity = the overlay ships what H2 claims (must hold today); curve = the contract 2.5 difficulty curve. */
  readonly kind: 'integrity' | 'curve';
  readonly pass: boolean;
  readonly detail: string;
}

export interface BandReport {
  readonly bands: BandSummary[];
  readonly unitSteps: UnitStep[];
  readonly spearmanByBoard: Record<string, number>;
  readonly assertions: AssertionResult[];
}

/** Plateaus of identical allocation (unit key) per board; a unit step is where the key changes. */
const plateausOf = (rows: readonly HazardGaugeRow[]): { key: string; from: number; to: number; rows: HazardGaugeRow[] }[] => {
  const sorted = [...rows].sort((a, b) => a.level - b.level || a.seedIndex - b.seedIndex);
  const plateaus: { key: string; from: number; to: number; rows: HazardGaugeRow[] }[] = [];
  for (const row of sorted) {
    const last = plateaus[plateaus.length - 1];
    if (last && last.key === row.unitKey) { last.rows.push(row); last.to = row.level; } else { plateaus.push({ key: row.unitKey, from: row.level, to: row.level, rows: [row] }); }
  }
  return plateaus;
};

const delayOf = (row: HazardGaugeRow): number => row.gauges.hazardDelay ?? Number.NaN;

export const evaluateHazardBands = (rows: readonly HazardGaugeRow[], options: { bandFrom?: number; bandTo?: number } = {}): BandReport => {
  const boards = [...new Set(rows.map((row) => row.board))];
  const levels = rows.map((row) => row.level);
  const bandFrom = options.bandFrom ?? Math.min(...levels);
  const bandTo = options.bandTo ?? Math.max(...levels);
  const bands: BandSummary[] = [];
  const unitSteps: UnitStep[] = [];
  const spearmanByBoard: Record<string, number> = {};
  for (const board of boards) {
    const subset = rows.filter((row) => row.board === board);
    const bandMeans: number[] = [];
    const bandIndex: number[] = [];
    for (let from = bandFrom, index = 0; from <= bandTo; from += BAND_WIDTH, index += 1) {
      const to = Math.min(bandTo, from + BAND_WIDTH - 1);
      const inBand = subset.filter((row) => row.level >= from && row.level <= to);
      if (inBand.length === 0) { continue; }
      const contacts = {} as Record<BotTier, number>;
      const cleanRate = {} as Record<BotTier, number>;
      for (const tier of BOT_TIERS) {
        contacts[tier] = mean(inBand.map((row) => row.gauges.bots[tier].contacts));
        cleanRate[tier] = inBand.filter((row) => row.gauges.bots[tier].cleared && row.gauges.bots[tier].contacts === 0).length / inBand.length;
      }
      const slack = inBand.map((row) => row.gauges.escapeSlack?.ratio).filter((value): value is number => typeof value === 'number');
      const summary: BandSummary = {
        board,
        band: `L${from}-${to}`,
        from,
        to,
        runs: inBand.length,
        hazardDelay: mean(inBand.map(delayOf)),
        escapeSlackMin: slack.length ? Math.min(...slack) : null,
        contacts,
        cleanRate,
        placedUnits: mean(inBand.map((row) => row.placedGates + row.placedSentries))
      };
      bands.push(summary);
      bandMeans.push(summary.hazardDelay);
      bandIndex.push(index);
    }
    spearmanByBoard[board] = spearman(bandIndex, bandMeans);
    const plateaus = plateausOf(subset);
    const seeds = [...new Set(subset.map((row) => row.seedIndex))].sort((a, b) => a - b);
    for (let i = 1; i < plateaus.length; i += 1) {
      const before = plateaus[i - 1]!;
      const after = plateaus[i]!;
      const bySeed = (plateau: typeof before): number[] => seeds.map((seed) => mean(plateau.rows.filter((row) => row.seedIndex === seed).map(delayOf)));
      const beforeBySeed = bySeed(before);
      const afterBySeed = bySeed(after);
      unitSteps.push({
        level: after.from,
        board,
        from: before.key,
        to: after.key,
        beforeBySeed,
        afterBySeed,
        worstVsBestGap: Math.min(...afterBySeed) - Math.max(...beforeBySeed),
        meanGap: mean(after.rows.map(delayOf)) - mean(before.rows.map(delayOf))
      });
    }
  }

  const assertions: AssertionResult[] = [];
  const failing = (name: string, bad: readonly string[], total: number, what: string, kind: AssertionResult['kind'] = 'integrity'): void => {
    assertions.push({ name, kind, pass: bad.length === 0, detail: bad.length === 0 ? `${total} ${what}, all pass` : `${bad.length}/${total} fail: ${bad.slice(0, 6).join('; ')}` });
  };
  const tag = (row: HazardGaugeRow): string => `${row.board} L${row.level} s${row.seedIndex}`;
  failing('geometry unchanged by the overlay', rows.filter((row) => !row.mazeUnchanged).map(tag), rows.length, 'mazes');
  failing('no hazard before L10', rows.filter((row) => row.level < 10 && row.placedGates + row.placedSentries > 0).map(tag), rows.length, 'mazes');
  failing('every level solvable contact-free (independent solver)', rows.filter((row) => row.gauges.witnessTicks === null).map(tag), rows.length, 'mazes');
  failing('independent witness length equals H2 witness length', rows.filter((row) => row.overlayWitnessTicks !== null && row.overlayWitnessTicks !== row.gauges.witnessTicks).map((row) => `${tag(row)} ${row.overlayWitnessTicks} vs ${row.gauges.witnessTicks}`), rows.length, 'mazes');
  failing('independent escape slack equals H2 escape slack', rows.filter((row) => (row.overlayEscapeSlack ?? null) !== (row.gauges.escapeSlack?.ratio ?? null)).map((row) => `${tag(row)} ${row.overlayEscapeSlack} vs ${row.gauges.escapeSlack?.ratio}`), rows.length, 'mazes');
  failing(`escape slack >= ${ESCAPE_SLACK_MIN} on every hazard level`, rows.filter((row) => row.gauges.escapeSlack !== null && (row.gauges.escapeSlack.ratio ?? 0) < ESCAPE_SLACK_MIN).map(tag), rows.length, 'mazes');
  failing('exact bot clears every level with no contact', rows.filter((row) => !row.gauges.bots.exact.cleared || row.gauges.bots.exact.contacts > 0).map(tag), rows.length, 'mazes');
  failing('hazardDelay >= 0 (hazards never shorten the route)', rows.filter((row) => (row.gauges.hazardDelay ?? 0) < 0).map(tag), rows.length, 'mazes');
  failing(`Spearman of 25-level band means >= ${SPEARMAN_MIN}`, Object.entries(spearmanByBoard).filter(([, rho]) => !(rho >= SPEARMAN_MIN)).map(([board, rho]) => `${board} rho ${rho.toFixed(3)}`), boards.length, 'boards', 'curve');
  failing('hazardDelay never falls across a unit step (worst seed after vs best seed before, the literal 2.5 wording)', unitSteps.filter((step) => step.worstVsBestGap < 0).map((step) => `${step.board} L${step.level} ${step.from}->${step.to} ${step.worstVsBestGap.toFixed(2)}`), unitSteps.length, 'unit steps', 'curve');
  failing('hazardDelay never falls across a unit step (plateau mean)', unitSteps.filter((step) => step.meanGap < 0).map((step) => `${step.board} L${step.level} ${step.from}->${step.to} ${step.meanGap.toFixed(2)}`), unitSteps.length, 'unit steps', 'curve');
  return { bands, unitSteps, spearmanByBoard, assertions };
};

// ---------------------------------------------------------------------------
// Runway: where the hazard menu runs dry.
// ---------------------------------------------------------------------------

export interface MenuTapeEntry { readonly level: number; readonly unit: HazardTailUnit }

/** The tail tape with no saturation freeze: one unit every 15 levels from L36 until the menu is empty. */
export const hazardMenuTape = (): { tape: MenuTapeEntry[]; dryLevel: number; lastPlacedUnitLevel: number; lastUnitLevel: number } => {
  const state: HazardTailState = { gates: 1, sentries: 1, hunters: 1, gateTier: 0, sentryTier: 0, hunterTier: 0 };
  const tape: MenuTapeEntry[] = [];
  let level = HAZARD_TAIL.fromLevel;
  for (; ; level += HAZARD_TAIL.everyLevels) {
    const unit = nextHazardTailUnit(state);
    tape.push({ level, unit });
    if (unit === 'none') { break; }
    switch (unit) {
      case 'gate': state.gates += 1; break;
      case 'gateTier': state.gateTier += 1; break;
      case 'sentry': state.sentries += 1; break;
      case 'sentryTier': state.sentryTier += 1; break;
      case 'hunter': state.hunters += 1; break;
      case 'hunterTier': state.hunterTier += 1; break;
    }
  }
  const real = tape.filter((entry) => entry.unit !== 'none');
  const placed = real.filter((entry) => entry.unit !== 'hunter' && entry.unit !== 'hunterTier');
  return { tape, dryLevel: level, lastUnitLevel: real[real.length - 1]?.level ?? 0, lastPlacedUnitLevel: placed[placed.length - 1]?.level ?? 0 };
};

/** Allocation-level checks the runway uses: the shipped allocator freezes at the geometry saturation level. */
export const shippedFreeze = (): { saturationLevel: number; frozenKey: string; unitsBoughtBySaturation: number } => {
  const a = allocateHazardUnits(GEOMETRY_BUDGET_SATURATION_LEVEL + 1000, { saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL });
  return {
    saturationLevel: GEOMETRY_BUDGET_SATURATION_LEVEL,
    frozenKey: `g${a.gates}t${a.gateTier}s${a.sentries}t${a.sentryTier}h${a.hunters}t${a.hunterTier}`,
    unitsBoughtBySaturation: a.tailUnits.filter((unit) => unit !== 'none').length
  };
};
