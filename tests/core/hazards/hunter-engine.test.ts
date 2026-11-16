import { describe, expect, it } from 'vitest';
import {
  HUNTER_BURNOUT_CONTACTS,
  HUNTER_DEN_MIN_SEPARATION,
  HUNTER_MIN_SPEED_DIVISOR,
  createHunterSpec,
  createHunterState,
  hunterCell,
  isHunterActive,
  lineOfSightCells,
  listHunterDenCandidates,
  registerHunterContact,
  resolveHunterDenSeed,
  resolveHunterSpeedDivisor,
  selectHunterDen,
  staticDistancesFrom,
  stepHunter
} from '../../../src/mazer-core/hazards';
import { chaserFixture, type ChaserAsciiFixture } from './chaserFixtures';
import { REF_ORDER, refStep, type RefPoint, type RefWorld } from './chaserReference';

// Long winding board: the start's sight lines cover the top row and the left column only.
const WINDING = [
  '#############',
  '#S..........#',
  '#.#########.#',
  '#.#.......#.#',
  '#.#.#####.#.#',
  '#...#...#...#',
  '###.#.#.#.###',
  '#.....#.....#',
  '#.###.#.###.#',
  '#...#...#..G#',
  '#############'
];

const WRAPS = [
  '#####.#####',
  '#S........#',
  '#.###.###.#',
  '...........',
  '#.###.###.#',
  '#.........#',
  '#####.###G#'
];

const worldOf = (f: ChaserAsciiFixture): RefWorld => ({ grid: f.grid, width: f.width, height: f.height });
const pointOf = (f: ChaserAsciiFixture, cell: number): RefPoint => ({ x: cell % f.width, y: Math.floor(cell / f.width) });
const cellOf = (f: ChaserAsciiFixture, p: RefPoint): number => p.y * f.width + p.x;

/** Oracle BFS over the reference move rule (coordinates, wrap included). */
const refDistances = (f: ChaserAsciiFixture, source: number): Map<number, number> => {
  const world = worldOf(f);
  const dist = new Map<number, number>([[source, 0]]);
  const queue: RefPoint[] = [pointOf(f, source)];
  while (queue.length > 0) {
    const p = queue.shift()!;
    const d = dist.get(cellOf(f, p))!;
    for (const dir of REF_ORDER) {
      const n = refStep(world, p.x, p.y, dir);
      if (n !== null && !dist.has(cellOf(f, n))) {
        dist.set(cellOf(f, n), d + 1);
        queue.push(n);
      }
    }
  }
  return dist;
};

/** Oracle sight: straight runs in each direction until a wall or the origin comes back. */
const refSight = (f: ChaserAsciiFixture, origin: number): Set<number> => {
  const world = worldOf(f);
  const seen = new Set<number>([origin]);
  for (const dir of REF_ORDER) {
    let p: RefPoint | null = pointOf(f, origin);
    for (let guard = 0; guard < f.width * f.height; guard += 1) {
      p = refStep(world, p.x, p.y, dir);
      if (p === null || cellOf(f, p) === origin) {
        break;
      }
      seen.add(cellOf(f, p));
    }
  }
  return seen;
};

/** Oracle den rule written from the contract text. */
const refDens = (f: ChaserAsciiFixture) => {
  const fromStart = refDistances(f, f.start);
  const fromGoal = refDistances(f, f.goal);
  const route = fromStart.get(f.goal)!;
  const sight = refSight(f, f.start);
  const min = Math.ceil(0.6 * route);
  const on: number[] = [];
  const off: number[] = [];
  for (const [cell, ds] of [...fromStart.entries()].sort((a, b) => a[0] - b[0])) {
    const dg = fromGoal.get(cell);
    if (dg === undefined || ds < min || dg < 2 || sight.has(cell)) {
      continue;
    }
    (ds + dg === route ? on : off).push(cell);
  }
  return { route, min, on, off };
};

describe('Hunter speed tiers and spec', () => {
  it('maps tier 0 to divisor 3, tier 1 to 2, and never goes below 2', () => {
    expect(resolveHunterSpeedDivisor(0)).toBe(3);
    expect(resolveHunterSpeedDivisor(1)).toBe(2);
    for (const tier of [-5, 2, 7, 99, Number.NaN, Number.POSITIVE_INFINITY, 1.9]) {
      expect(resolveHunterSpeedDivisor(tier)).toBeGreaterThanOrEqual(HUNTER_MIN_SPEED_DIVISOR);
    }
    expect(resolveHunterSpeedDivisor(99)).toBe(2);
    expect(resolveHunterSpeedDivisor(-1)).toBe(3);
  });

  it('builds a chaser spec at the den with optional grace and spawn delay', () => {
    expect(createHunterSpec(42)).toEqual({ rule: 'chaser', spawnCell: 42, speedDivisor: 3 });
    expect(createHunterSpec(7, { tier: 1, graceTurns: 2, spawnDelayTurns: 5 })).toEqual({
      rule: 'chaser', spawnCell: 7, speedDivisor: 2, graceTurns: 2, spawnDelayTurns: 5
    });
  });

  it('rejects a non-chaser rule and a divisor below 2', () => {
    const f = chaserFixture(WINDING);
    expect(() => createHunterState({ rule: 'interceptor', spawnCell: f.goal, speedDivisor: 3 }, 0, f.graph)).toThrow(RangeError);
    expect(() => createHunterState({ rule: 'chaser', spawnCell: f.goal, speedDivisor: 1 }, 0, f.graph)).toThrow(RangeError);
  });
});

describe('Hunter burnout (A4)', () => {
  it('burns out on the third contact, then vanishes, stops moving and refuses more contacts', () => {
    const f = chaserFixture(WINDING);
    let hunter = createHunterState(createHunterSpec(f.at(5, 7)), 0, f.graph);
    expect(isHunterActive(hunter)).toBe(true);
    for (let n = 1; n < HUNTER_BURNOUT_CONTACTS; n += 1) {
      hunter = registerHunterContact(hunter, 10 * n);
      expect(hunter).toMatchObject({ contacts: n, burnedOut: false, burnedOutAtTick: null });
      expect(hunterCell(hunter)).toBe(f.at(5, 7));
    }
    hunter = registerHunterContact(hunter, 99);
    expect(hunter).toMatchObject({ contacts: 3, burnedOut: true, burnedOutAtTick: 99 });
    expect(hunterCell(hunter)).toBe(-1);
    expect(isHunterActive(hunter)).toBe(false);
    expect(stepHunter(f.graph, hunter, { cell: f.start, heading: null }, 100)).toBe(hunter);
    expect(() => registerHunterContact(hunter, 101)).toThrow(RangeError);
  });

  it('an active Hunter steps like the chaser engine', () => {
    const f = chaserFixture(WINDING);
    let hunter = createHunterState({ ...createHunterSpec(f.at(5, 7)), speedDivisor: 2 }, 0, f.graph);
    const cells = [hunterCell(hunter)];
    for (let tick = 1; tick <= 8; tick += 1) {
      hunter = stepHunter(f.graph, hunter, { cell: f.start, heading: null }, tick);
      cells.push(hunterCell(hunter));
    }
    const moves = cells.slice(1).filter((cell, i) => cell !== cells[i]).length;
    expect(moves).toBe(4);
  });
});

describe('Hunter den rule against an independent oracle', () => {
  for (const [name, rows] of [['winding', WINDING], ['wrap edges', WRAPS]] as const) {
    it(`static distances, sight lines and candidates match (${name})`, () => {
      const f = chaserFixture(rows);
      const distances = staticDistancesFrom(f.graph, f.start);
      const oracle = refDistances(f, f.start);
      for (let cell = 0; cell < f.graph.cellCount; cell += 1) {
        expect(distances[cell]).toBe(oracle.get(cell) ?? -1);
      }
      expect([...lineOfSightCells(f.graph, f.start)].sort((a, b) => a - b)).toEqual([...refSight(f, f.start)].sort((a, b) => a - b));
      const ref = refDens(f);
      const candidates = listHunterDenCandidates(f.graph, { start: f.start, goal: f.goal });
      expect(candidates.routeLength).toBe(ref.route);
      expect(candidates.minStartDistance).toBe(ref.min);
      expect(candidates.offRoute).toEqual(ref.off);
      expect(candidates.onRoute).toEqual(ref.on);
      expect(ref.off.length + ref.on.length).toBeGreaterThan(0);
    });
  }

  it('every picked den satisfies the rule, prefers off-route cells and is deterministic', () => {
    const f = chaserFixture(WINDING);
    const ref = refDens(f);
    const seed = resolveHunterDenSeed(12345);
    const seen = new Set<number>();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const den = selectHunterDen(f.graph, { start: f.start, goal: f.goal, seed, index: 0, attempt });
      expect(den).not.toBeNull();
      expect(ref.off).toContain(den);
      expect(selectHunterDen(f.graph, { start: f.start, goal: f.goal, seed, index: 0, attempt })).toBe(den);
      seen.add(den!);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('keeps the separation from existing dens and honours exclusions', () => {
    const f = chaserFixture(WINDING);
    const ref = refDens(f);
    const seed = resolveHunterDenSeed(7);
    const first = selectHunterDen(f.graph, { start: f.start, goal: f.goal, seed, index: 0, attempt: 0 })!;
    const fromFirst = refDistances(f, first);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const second = selectHunterDen(f.graph, { start: f.start, goal: f.goal, seed, index: 1, attempt, existingDens: [first] });
      if (second !== null) {
        expect(fromFirst.get(second)!).toBeGreaterThanOrEqual(HUNTER_DEN_MIN_SEPARATION);
      }
    }
    const all = new Set([...ref.off, ...ref.on]);
    expect(selectHunterDen(f.graph, { start: f.start, goal: f.goal, seed, index: 0, attempt: 0, excludeCells: all })).toBeNull();
    const onlyOn = new Set(ref.off);
    const fallback = selectHunterDen(f.graph, { start: f.start, goal: f.goal, seed, index: 0, attempt: 0, excludeCells: onlyOn });
    if (ref.on.length > 0) {
      expect(ref.on).toContain(fallback);
    } else {
      expect(fallback).toBeNull();
    }
  });

  it('returns no candidates when the goal is unreachable', () => {
    const f = chaserFixture(['#######', '#S.#.G#', '#######']);
    expect(listHunterDenCandidates(f.graph, { start: f.start, goal: f.goal })).toEqual({ routeLength: -1, minStartDistance: 0, offRoute: [], onRoute: [] });
    expect(selectHunterDen(f.graph, { start: f.start, goal: f.goal, seed: 1, index: 0, attempt: 0 })).toBeNull();
  });
});
