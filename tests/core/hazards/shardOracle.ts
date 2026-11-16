import { resolveLegacyWalkableGridNeighbors } from '../../../src/legacy-runtime/legacyMaze';
import type { OracleHazards, OraclePoint, OracleResult } from './oracle';

/**
 * Brute-force shard reference solver (slice H8), written independently of
 * src/mazer-core/hazards: coordinates, production movement
 * (resolveLegacyWalkableGridNeighbors), explicit absolute-time layers whose
 * states carry the next-shard index, and its own gate/patrol formulas. A shard
 * counts only when it is the next one; the star ends the level only once every
 * shard is collected (before that it is plain floor).
 */
const same = (left: OraclePoint, right: OraclePoint): boolean => left.x === right.x && left.y === right.y;
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const patrolSequence = (route: OraclePoint[]): OraclePoint[] => (
  route.length <= 1 ? route.slice() : [...route, ...route.slice(1, -1).reverse()]
);

export const oracleShardSolve = (
  grid: boolean[][],
  start: OraclePoint,
  goal: OraclePoint,
  shards: readonly OraclePoint[],
  hazards: OracleHazards,
  options: { startTick?: number; invulnerableTurns?: number; startNext?: number } = {}
): OracleResult => {
  const startTick = options.startTick ?? 0;
  const invulnerableTurns = options.invulnerableTurns ?? 0;
  const sequences = hazards.patrols.map((patrol) => patrolSequence(patrol.route));
  let period = 1;
  for (const gate of hazards.gates) period = (period / gcd(period, gate.period)) * gate.period;
  for (const sequence of sequences) period = (period / gcd(period, sequence.length)) * sequence.length;

  const blockedAt = (point: OraclePoint, tick: number): boolean => (
    hazards.blockers.some((blocker) => same(blocker, point))
    || hazards.gates.some((gate) => {
      if (!same(gate.cell, point)) return false;
      const q = (((tick - gate.openFrom) % gate.period) + gate.period) % gate.period;
      return q >= gate.openFor;
    })
  );
  const enemiesAt = (tick: number): OraclePoint[] => (
    sequences.map((sequence, index) => sequence[(tick + hazards.patrols[index]!.phase) % sequence.length]!)
  );
  const collect = (point: OraclePoint, next: number): number => (next < shards.length && same(shards[next]!, point) ? next + 1 : next);

  if (blockedAt(start, startTick) || (invulnerableTurns === 0 && enemiesAt(startTick).some((enemy) => same(enemy, start)))) {
    return { solvable: false, ticks: null };
  }
  const firstNext = collect(start, options.startNext ?? 0);
  if (firstNext === shards.length && same(start, goal)) return { solvable: true, ticks: 0 };

  type State = { point: OraclePoint; invulnerable: number; next: number };
  const key = (state: State): string => `${state.point.x},${state.point.y},${state.invulnerable},${state.next}`;
  let layer = new Map<string, State>();
  const first: State = { point: start, invulnerable: invulnerableTurns, next: firstNext };
  layer.set(key(first), first);
  const seenLayers = new Set<string>();
  for (let elapsed = 0; ; elapsed += 1) {
    const tick = startTick + elapsed;
    const signature = `${tick % period}|${[...layer.keys()].sort().join(';')}`;
    if (seenLayers.has(signature)) return { solvable: false, ticks: null };
    seenLayers.add(signature);
    const before = enemiesAt(tick);
    const after = enemiesAt(tick + 1);
    const nextLayer = new Map<string, State>();
    for (const { point, invulnerable, next } of layer.values()) {
      for (const dest of [...resolveLegacyWalkableGridNeighbors(grid, point), point]) {
        if (blockedAt(dest, tick + 1)) continue;
        if (invulnerable === 0) {
          if (after.some((enemy) => same(enemy, dest))) continue;
          if (!same(dest, point) && before.some((enemy, e) => same(enemy, dest) && same(after[e]!, point))) continue;
        }
        const progress = collect(dest, next);
        if (progress === shards.length && same(dest, goal)) return { solvable: true, ticks: elapsed + 1 };
        const state: State = { point: dest, invulnerable: invulnerable > 0 ? invulnerable - 1 : 0, next: progress };
        nextLayer.set(key(state), state);
      }
    }
    layer = nextLayer;
    if (layer.size === 0) return { solvable: false, ticks: null };
  }
};
