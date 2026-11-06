import {
  createHazardGraph,
  createHazardTimeline,
  type BuiltHazardTimeline,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec
} from '../../../src/mazer-core/hazards/graphContract';
import type { JunctionGreedyEnemySpec } from '../../../src/mazer-core/hazards/chaserEngine';

export interface ChaserAsciiFixture {
  readonly graph: HazardGraph;
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly grid: boolean[][];
  readonly width: number;
  readonly height: number;
  /** Spawn cells keyed by marker: `C` chaser, `I` interceptor, `W` wall-follower, digits 1-9 extra spawns. */
  readonly spawns: Readonly<Record<string, HazardCellId>>;
  readonly blockers: HazardSpec[];
  at(x: number, y: number): HazardCellId;
  timeline(extra?: readonly HazardSpec[]): BuiltHazardTimeline;
}

/**
 * `#` wall, `.` floor, `S` start, `G` goal, `X` static blocker, `C`/`I`/`W`/`1`-`9`
 * enemy spawn markers (all floor). Edge floor cells wrap exactly like production,
 * so fixtures frame corridors with walls unless a wrap is intended.
 */
export const chaserFixture = (rows: readonly string[]): ChaserAsciiFixture => {
  const height = rows.length;
  const width = rows[0]!.length;
  const grid = rows.map((row) => Array.from(row, (char) => char !== '#'));
  const graph = createHazardGraph({ width, height, grid });
  let start = -1;
  let goal = -1;
  const blockers: HazardSpec[] = [];
  const spawns: Record<string, HazardCellId> = {};
  rows.forEach((row, y) => {
    Array.from(row).forEach((char, x) => {
      const cell = y * width + x;
      if (char === 'S') {
        start = cell;
      } else if (char === 'G') {
        goal = cell;
      } else if (char === 'X') {
        blockers.push({ kind: 'blocker', cell });
      } else if (/[CIW1-9]/.test(char)) {
        spawns[char] = cell;
      }
    });
  });
  return {
    graph, start, goal, grid, width, height, spawns, blockers,
    at: (x, y) => graph.cellId(x, y),
    timeline: (extra = []) => createHazardTimeline(graph, [...blockers, ...extra])
  };
};

export const chaserAt = (
  fixture: ChaserAsciiFixture,
  marker: string,
  rule: JunctionGreedyEnemySpec['rule'],
  extra: Partial<JunctionGreedyEnemySpec> = {}
): JunctionGreedyEnemySpec => ({ rule, spawnCell: fixture.spawns[marker]!, ...extra });
