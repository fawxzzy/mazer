// Slice H2: the hazard generation overlay on real shipped ladder mazes.
//
// Every invariant here is re-measured with code that does not come from
// src/mazer-core/hazards: production movement (resolveLegacyWalkableGridNeighbors),
// the brute-force oracle in tests/core/hazards/oracle.ts (absolute-time layers,
// its own gate and patrol formulas), and a plain BFS for chokepoints.
import { describe, expect, test } from 'vitest';
import { maskLegacyBleedGatedCells } from '../../src/legacy-runtime/legacyHazardGraphAdapter';
import { resolveLegacyHazardOverlay } from '../../src/legacy-runtime/legacyHazardOverlay';
import {
  resolveLegacyWalkableGridNeighbors,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from '../../src/legacy-runtime/legacyMaze';
import { measureFelt } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import type { HazardSpec } from '../../src/mazer-core/hazards';
import { HAZARD_CAPS } from '../../src/mazer-core/hazards';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze, seedForIndex } from '../../scripts/analysis/lib/progressionLadderSampling';
import { oracleSolve, type OracleHazards } from '../core/hazards/oracle';

type Maze = ReturnType<typeof generateLadderMaze>;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
};

const openings = (maze: Maze): number => {
  let count = 0;
  maze.grid.forEach((row, y) => row.forEach((open, x) => {
    if (open && (x === 0 || y === 0 || x === maze.width - 1 || y === maze.height - 1)) count += 1;
  }));
  return count;
};

const pointOf = (maze: Maze, cell: number): LegacyPoint => ({ x: cell % maze.width, y: Math.floor(cell / maze.width) });
const same = (a: LegacyPoint, b: LegacyPoint): boolean => a.x === b.x && a.y === b.y;
// The grid every hazard is placed on: the openings of each Switch-gated wrap walled (first-time cards spec D8,
// slice 5; every Switch unlit). Production movement on it is the movement the hazard graph must match.
const playGrid = (maze: Maze): boolean[][] => maskLegacyBleedGatedCells(maze.grid as boolean[][], maze.bleedGates);
const neighbours = (maze: Maze, point: LegacyPoint): LegacyPoint[] => (
  resolveLegacyWalkableGridNeighbors(playGrid(maze), point)
);

const toOracle = (maze: Maze, specs: readonly HazardSpec[]): OracleHazards => ({
  blockers: specs.flatMap((spec) => (spec.kind === 'blocker' ? [pointOf(maze, spec.cell)] : [])),
  gates: specs.flatMap((spec) => (spec.kind === 'timedGate'
    ? [{ cell: pointOf(maze, spec.cell), period: spec.period, openFrom: spec.openFrom, openFor: spec.openFor }]
    : [])),
  patrols: specs.flatMap((spec) => (spec.kind === 'patrol'
    ? [{ route: spec.route.map((cell) => pointOf(maze, cell)), phase: spec.phase }]
    : []))
});

/** Own BFS with production movement: is `goal` reachable from `start` with `removed` taken out? */
const reachableWithout = (maze: Maze, removed: LegacyPoint): boolean => {
  const key = (p: LegacyPoint) => `${p.x},${p.y}`;
  const seen = new Set<string>([key(maze.start)]);
  const queue: LegacyPoint[] = [maze.start];
  for (let head = 0; head < queue.length; head += 1) {
    const point = queue[head]!;
    if (same(point, maze.goal)) return true;
    for (const next of neighbours(maze, point)) {
      if (!same(next, removed) && !seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return false;
};

/** Own oracle-time hazard lookups for the escape-slack re-measure. */
const gateClosedAt = (hazards: OracleHazards, point: LegacyPoint, tick: number): boolean => hazards.gates.some((gate) => (
  same(gate.cell, point) && ((((tick - gate.openFrom) % gate.period) + gate.period) % gate.period) >= gate.openFor
));
const enemyAt = (hazards: OracleHazards, point: LegacyPoint, tick: number): boolean => hazards.patrols.some((patrol) => {
  const sequence = patrol.route.length <= 1 ? patrol.route : [...patrol.route, ...patrol.route.slice(1, -1).reverse()];
  return same(sequence[(tick + patrol.phase) % sequence.length]!, point);
});

// Intro levels, first tail steps, mid ladder, the dry-menu step, saturation and beyond.
const SAMPLE_LEVELS = [10, 20, 35, 36, 60, 96, 150, 200, 276, 300, 520];

describe('hazard generation overlay (slice H2) on shipped ladder mazes', () => {
  test('switched off it returns null without reading the maze at all', () => {
    const untouchable = new Proxy({} as LegacyMazeSnapshot, {
      get: () => { throw new Error('the maze was read'); },
      has: () => { throw new Error('the maze was read'); }
    });
    expect(resolveLegacyHazardOverlay(untouchable, { enabled: false, level: 200 })).toBeNull();
  });

  test.each(SAMPLE_LEVELS)('L%i: never changes the maze, and the placement re-checks with independent code', (level) => {
    let placementsChecked = 0;
    let postContactChecks = 0;
    {
      for (const board of LADDER_BOARDS) {
        for (const seedIndex of [level % 3]) {
          const label = `L${level} ${board.name} seed${seedIndex}`;
          const maze = generateLadderMaze(level, board, seedForIndex(seedIndex));
          const hash = hashLadderMaze(maze);
          const open = openings(maze);
          const felt = level % 2 === 0 ? measureFelt(maze) : null;
          deepFreeze(maze);
          const overlay = resolveLegacyHazardOverlay(maze, { enabled: true, level });
          if (overlay === null) throw new Error('enabled overlay returned null');
          // Determinism: a second run is byte-identical.
          expect(JSON.stringify(resolveLegacyHazardOverlay(maze, { enabled: true, level })), label).toBe(JSON.stringify(overlay));
          // The maze is only read: fingerprint (cells, start, goal, solution path), openings, felt number.
          expect(hashLadderMaze(maze), label).toBe(hash);
          expect(openings(maze), label).toBe(open);
          if (felt !== null) expect(measureFelt(maze), label).toEqual(felt);

          const { specs, allocation } = overlay;
          expect(overlay.status === 'none' || overlay.status === 'full' || overlay.degradeReasons.length > 0, label).toBe(true);
          if (overlay.status === 'full') expect(overlay.degradeReasons, label).toEqual([]);
          const gates = specs.filter((spec) => spec.kind === 'timedGate');
          const sentries = specs.filter((spec) => spec.kind === 'patrol');
          expect(gates.length + sentries.length, label).toBe(specs.length); // no blockers (A5)
          expect(gates.length, label).toBeLessThanOrEqual(Math.min(allocation.gates, HAZARD_CAPS.gates));
          expect(sentries.length, label).toBeLessThanOrEqual(Math.min(allocation.sentries, HAZARD_CAPS.sentries));
          if (specs.length === 0) continue;
          placementsChecked += 1;

          // Cell legality with production movement.
          const near = [maze.start, ...neighbours(maze, maze.start), maze.goal, ...neighbours(maze, maze.goal)];
          for (const spec of specs) {
            const cells = spec.kind === 'patrol' ? spec.route : [spec.cell];
            for (const cell of cells) {
              const point = pointOf(maze, cell);
              expect(playGrid(maze)[point.y]![point.x], `${label} walkable`).toBe(true);
              expect(near.some((p) => same(p, point)), `${label} clear of start/goal`).toBe(false);
            }
            if (spec.kind === 'timedGate') {
              expect(neighbours(maze, pointOf(maze, spec.cell)).length, `${label} gate not on a junction`).toBeLessThan(3);
            } else {
              // A6: no Sentry cell is a chokepoint (removing it must keep the goal reachable).
              for (const cell of spec.route) {
                expect(reachableWithout(maze, pointOf(maze, cell)), `${label} sentry on chokepoint`).toBe(true);
              }
            }
          }

          // Contact-free solvability and witness length, by the brute-force oracle.
          const hazards = toOracle(maze, specs);
          const witness = overlay.verdict?.witness;
          if (!witness) throw new Error(`${label}: shipped placement without a witness`);
          const direct = oracleSolve(playGrid(maze), maze.start, maze.goal, hazards);
          expect(direct, label).toEqual({ solvable: true, ticks: witness.ticks });

          // Junction-rewind safety: from the nearest junction behind any witness step, with N = 4 (play)
          // and N = 2 (validator) invulnerable ticks, the goal is still reachable. Sampled steps.
          const route = witness.cells.map((cell) => pointOf(maze, cell));
          // N = 2 at every sampled step (a pass at 2 implies a pass at 4); N = 4, play's value, on every other one.
          let sample = 0;
          for (let index = 1; index < witness.ticks; index += index < 10 ? 1 : 13) {
            let pushback = route[0]!;
            for (let back = index - 1; back >= 0; back -= 1) {
              if (neighbours(maze, route[back]!).length >= 3) { pushback = route[back]!; break; }
            }
            sample += 1;
            for (const turns of sample % 2 === 0 ? [2, 4] : [2]) {
              const after = oracleSolve(playGrid(maze), pushback, maze.goal, hazards, { startTick: index, invulnerableTurns: turns });
              expect(after.solvable, `${label} rewind at step ${index} N=${turns}`).toBe(true);
              postContactChecks += 1;
            }
          }
        }
      }
    }
    expect(placementsChecked).toBe(LADDER_BOARDS.length);
    expect(postContactChecks).toBeGreaterThan(20);
  }, 60_000);

  test('escape slack re-measured with the oracle matches the overlay exactly', () => {
    for (const [level, board, seedIndex] of [[20, LADDER_BOARDS[0], 0], [60, LADDER_BOARDS[1], 1]] as const) {
      const maze = generateLadderMaze(level, board, seedForIndex(seedIndex));
      const overlay = resolveLegacyHazardOverlay(maze, { enabled: true, level });
      const witness = overlay?.verdict?.witness;
      if (!overlay || !witness || !overlay.escapeSlack) throw new Error(`L${level}: expected a placement`);
      const hazards = toOracle(maze, overlay.specs);
      const route = witness.cells.map((cell) => pointOf(maze, cell));
      let survivable = 0;
      let firstFragile: number | null = null;
      for (let index = 0; index < witness.ticks; index += 1) {
        const next = index + 1;
        let landing: LegacyPoint | null = route[index]!;
        if (gateClosedAt(hazards, landing, next)) {
          // Eject one cell back along the trail (product contract 2.3); it must be free.
          const previous = route.slice(0, index).reverse().find((p) => !same(p, route[index]!)) ?? null;
          landing = previous !== null && !gateClosedAt(hazards, previous, next) && !enemyAt(hazards, previous, next) ? previous : null;
        } else if (enemyAt(hazards, landing, next)) {
          landing = null;
        }
        const ok = landing !== null
          && oracleSolve(playGrid(maze), landing, maze.goal, hazards, { startTick: next }).solvable;
        if (ok) survivable += 1;
        else firstFragile ??= index;
      }
      expect(overlay.escapeSlack, `L${level}`).toMatchObject({
        tested: witness.ticks,
        survivable,
        firstFragileIndex: firstFragile
      });
    }
  }, 120_000);

  test('a player behind the schedule meets one skipped kind at a time', () => {
    const maze = generateLadderMaze(100, LADDER_BOARDS[0], seedForIndex(0));
    const fresh = resolveLegacyHazardOverlay(maze, { enabled: true, level: 100, exposureStage: 0 });
    expect(fresh?.allocation).toMatchObject({ exposureStage: 0, allocationLevel: 10, firstEncounter: 'pulseGate', gates: 1, sentries: 0 });
    expect(fresh?.specs.length).toBeLessThanOrEqual(1);
    const scheduled = resolveLegacyHazardOverlay(maze, { enabled: true, level: 100 });
    // Manifest v2: L100 has met three kinds (the shard is first met on its first lock level, 102).
    expect(scheduled?.allocation.exposureStage).toBe(3);
  });
});
