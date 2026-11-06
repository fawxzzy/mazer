import {
  createHazardGraph,
  createHazardTimeline,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec
} from '../../../src/mazer-core/hazards';

export interface AsciiFixture {
  readonly graph: HazardGraph;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly grid: boolean[][];
  /** Static blockers marked `X` in the picture. */
  readonly blockers: HazardSpec[];
  at(x: number, y: number): HazardCellId;
}

/**
 * `#` wall, `.` floor, `S` start, `G` goal, `X` floor holding a static blocker.
 * Edge cells that are floor wrap exactly like production, so fixtures frame
 * corridors with walls unless a wrap is intended.
 */
export const asciiFixture = (rows: readonly string[]): AsciiFixture => {
  const height = rows.length;
  const width = rows[0]!.length;
  const grid = rows.map((row) => Array.from(row, (char) => char !== '#'));
  const graph = createHazardGraph({ width, height, grid });
  let start = -1;
  let goal = -1;
  const blockers: HazardSpec[] = [];
  rows.forEach((row, y) => {
    Array.from(row).forEach((char, x) => {
      if (char === 'S') {
        start = y * width + x;
      } else if (char === 'G') {
        goal = y * width + x;
      } else if (char === 'X') {
        blockers.push({ kind: 'blocker', cell: y * width + x });
      }
    });
  });
  return { graph, start, goal, grid, blockers, at: (x, y) => graph.cellId(x, y) };
};

export const timelineFor = (fixture: AsciiFixture, extra: readonly HazardSpec[] = []) => (
  createHazardTimeline(fixture.graph, [...fixture.blockers, ...extra])
);

/** Deterministic PRNG for tests only (mulberry32). */
export const createTestRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
