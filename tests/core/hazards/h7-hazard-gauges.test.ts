// Slice H7: the hazard gauges are a second, independent measurement of what the H2 overlay ships.
// These tests pin the independent solver against the brute-force oracle and a hand-worked level,
// then run a small slice of the shipped ladder through the band report and require full agreement
// with H2 plus the integrity assertions. The full L10..300 band job is
// `npx vite-node --script scripts/analysis/progression-gauges.ts hazards --assert` (too slow for unit CI).
import { describe, expect, test } from 'vitest';
import { createLegacyMaze, resolveLegacyWalkableGridNeighbors } from '../../../src/legacy-runtime/legacyMaze';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from '../../../src/legacy-runtime/legacyGeometryBudget';
import { measureHazardGauges, type GaugeGate, type GaugePoint, type GaugeSentry } from '../../../scripts/analysis/lib/hazardGauges';
import { evaluateHazardBands, hazardMenuTape, measureHazardLevel, shippedFreeze } from '../../../scripts/analysis/lib/hazardGaugeCorpus';
import { LADDER_BOARDS } from '../../../scripts/analysis/lib/progressionLadderSampling';
import { createTestRng } from './fixtures';
import { oracleSolve } from './oracle';

const neighbours4 = (grid: boolean[][], p: GaugePoint): GaugePoint[] => [
  { x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }
].filter((q) => grid[q.y]?.[q.x] === true);

/** BFS shortest static route over production movement, start to goal inclusive. */
const staticRoute = (grid: boolean[][], start: GaugePoint, goal: GaugePoint): GaugePoint[] => {
  const key = (p: GaugePoint): string => `${p.x},${p.y}`;
  const previous = new Map<string, GaugePoint | null>([[key(start), null]]);
  const queue = [start];
  while (queue.length > 0 && !previous.has(key(goal))) {
    const current = queue.shift()!;
    for (const next of resolveLegacyWalkableGridNeighbors(grid, current)) {
      if (!previous.has(key(next))) { previous.set(key(next), current); queue.push(next); }
    }
  }
  const route: GaugePoint[] = [];
  for (let cursor: GaugePoint | null = goal; cursor !== null; cursor = previous.get(key(cursor)) ?? null) { route.push(cursor); }
  return route.reverse();
};

describe('H7 independent gauge solver', () => {
  test('a hand-worked gate corridor: two waits, delay 2, every bot clears with no contact', () => {
    const rows = ['#######', '#S...G#', '#######'];
    const grid = rows.map((row) => Array.from(row, (char) => char !== '#'));
    // Open at ticks 0, 1, 4, 5, ...: closed at tick 2, so the player reaches it at tick 4 instead of 2.
    const gate: GaugeGate = { cell: { x: 3, y: 1 }, period: 4, openFrom: 0, openFor: 2 };
    const result = measureHazardGauges({ grid, start: { x: 1, y: 1 }, goal: { x: 5, y: 1 }, gates: [gate], sentries: [] }, null);
    expect(result.staticShortest).toBe(4);
    expect(result.witnessTicks).toBe(6);
    expect(result.hazardDelay).toBe(2);
    expect(result.period).toBe(4);
    for (const tier of ['exact', 'horizon', 'myopic'] as const) {
      expect({ tier, cleared: result.bots[tier].cleared, contacts: result.bots[tier].contacts }).toEqual({ tier, cleared: true, contacts: 0 });
    }
  });

  test('a Sentry shuttling the only corridor with no pocket makes the level unsolvable', () => {
    const rows = ['#########', '#S.....G#', '#########'];
    const grid = rows.map((row) => Array.from(row, (char) => char !== '#'));
    const sentry: GaugeSentry = { route: [2, 3, 4, 5, 6].map((x) => ({ x, y: 1 })), phase: 0 };
    const result = measureHazardGauges({ grid, start: { x: 1, y: 1 }, goal: { x: 7, y: 1 }, gates: [], sentries: [sentry] }, null);
    expect(result.witnessTicks).toBeNull();
    expect(result.bots.exact.cleared).toBe(false);
  });

  test('fastest contact-free route agrees with the brute-force oracle on production mazes', () => {
    let solvable = 0;
    let cases = 0;
    for (const seed of [7, 41, 303, 2026, 9001]) {
      const maze = createLegacyMaze(21, 21, seed);
      const floor: GaugePoint[] = [];
      maze.grid.forEach((row, y) => row.forEach((open, x) => { if (open) { floor.push({ x, y }); } }));
      const rng = createTestRng(seed * 13);
      const pick = (): GaugePoint => floor[Math.floor(rng() * floor.length)]!;
      const route = staticRoute(maze.grid, maze.start, maze.goal).slice(1, -1);
      const pickOnRoute = (): GaugePoint => route[Math.floor(rng() * route.length)]!;
      for (let trial = 0; trial < 4; trial += 1) {
        const gates: GaugeGate[] = [];
        for (let i = 0; i < 1 + Math.floor(rng() * 3); i += 1) {
          const period = [2, 3, 4, 6][Math.floor(rng() * 4)]!;
          gates.push({ cell: i === 0 ? pickOnRoute() : pick(), period, openFrom: Math.floor(rng() * period), openFor: 1 + Math.floor(rng() * period) });
        }
        const sentries: GaugeSentry[] = [];
        for (let i = 0; i < Math.floor(rng() * 3); i += 1) {
          const route = [pick()];
          const length = 2 + Math.floor(rng() * 5);
          while (route.length < length) {
            const options = neighbours4(maze.grid, route[route.length - 1]!).filter((q) => !route.some((r) => r.x === q.x && r.y === q.y));
            if (options.length === 0) { break; }
            route.push(options[Math.floor(rng() * options.length)]!);
          }
          sentries.push({ route, phase: Math.floor(rng() * 5) });
        }
        const clash = (p: GaugePoint): boolean => gates.some((g) => g.cell.x === p.x && g.cell.y === p.y)
          || sentries.some((s) => s.route.some((r) => r.x === p.x && r.y === p.y));
        if (clash(maze.start) || clash(maze.goal)) { continue; }
        const mine = measureHazardGauges({ grid: maze.grid, start: maze.start, goal: maze.goal, gates, sentries }, null);
        const expected = oracleSolve(maze.grid, maze.start, maze.goal, { blockers: [], gates, patrols: sentries.map((s) => ({ route: [...s.route], phase: s.phase })) });
        cases += 1;
        expect({ seed, trial, ticks: mine.witnessTicks }).toEqual({ seed, trial, ticks: expected.ticks });
        if (expected.solvable) { solvable += 1; }
      }
    }
    expect(cases).toBeGreaterThanOrEqual(12);
    expect(solvable).toBeGreaterThanOrEqual(4);
  });
});

describe('H7 shipped-ladder slice agrees with H2', () => {
  test('integrity assertions pass on a slice spanning every unit kind both boards', () => {
    const levels = [9, 10, 20, 36, 66, 126, 201, GEOMETRY_BUDGET_SATURATION_LEVEL];
    const rows = levels.flatMap((level) => LADDER_BOARDS.map((board) => measureHazardLevel(level, board, 0)));
    expect(rows.find((row) => row.level === 9)!.placedGates).toBe(0);
    expect(rows.filter((row) => row.level >= 20).every((row) => row.placedSentries > 0)).toBe(true);
    const report = evaluateHazardBands(rows, { bandFrom: 10, bandTo: GEOMETRY_BUDGET_SATURATION_LEVEL });
    const byName = new Map(report.assertions.map((result) => [result.name, result]));
    for (const name of [
      'geometry unchanged by the overlay',
      'no hazard before L10',
      'every level solvable contact-free (independent solver)',
      'independent witness length equals H2 witness length',
      'independent escape slack equals H2 escape slack',
      'exact bot clears every level with no contact',
      'hazardDelay >= 0 (hazards never shorten the route)'
    ]) {
      expect({ name, result: byName.get(name)?.pass }).toEqual({ name, result: true });
    }
    for (const row of rows.filter((candidate) => candidate.level >= 10)) {
      expect(row.overlayWitnessTicks).not.toBeNull();
      expect({ level: row.level, board: row.board, ticks: row.gauges.witnessTicks }).toEqual({ level: row.level, board: row.board, ticks: row.overlayWitnessTicks });
    }
  }, 60_000);

  test('runway tape is consistent with the shipped saturation freeze', () => {
    const menu = hazardMenuTape();
    const freeze = shippedFreeze();
    const boughtByFreeze = menu.tape.filter((entry) => entry.unit !== 'none' && entry.level <= freeze.saturationLevel).length;
    expect(freeze.unitsBoughtBySaturation).toBe(boughtByFreeze);
    expect(menu.lastUnitLevel).toBeLessThan(menu.dryLevel);
    expect(menu.tape[menu.tape.length - 1]!.unit).toBe('none');
  });
});
