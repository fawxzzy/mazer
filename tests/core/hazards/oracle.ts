import { resolveLegacyWalkableGridNeighbors } from '../../../src/legacy-runtime/legacyMaze';

/**
 * Brute-force reference solver, written independently of src/mazer-core/hazards:
 * coordinates instead of cell ids, production movement (resolveLegacyWalkableGridNeighbors)
 * instead of the hazard graph, explicit absolute-time layers instead of
 * (cell, tick mod P) states, and its own gate/patrol formulas.
 */
export interface OraclePoint {
  x: number;
  y: number;
}

export interface OracleGate {
  cell: OraclePoint;
  period: number;
  openFrom: number;
  openFor: number;
}

export interface OraclePatrol {
  route: OraclePoint[];
  phase: number;
}

export interface OracleHazards {
  blockers: OraclePoint[];
  gates: OracleGate[];
  patrols: OraclePatrol[];
}

export interface OracleResult {
  solvable: boolean;
  ticks: number | null;
}

const same = (left: OraclePoint, right: OraclePoint): boolean => left.x === right.x && left.y === right.y;
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const patrolSequence = (route: OraclePoint[]): OraclePoint[] => (
  route.length <= 1 ? route.slice() : [...route, ...route.slice(1, -1).reverse()]
);

export const oracleSolve = (
  grid: boolean[][],
  start: OraclePoint,
  goal: OraclePoint,
  hazards: OracleHazards,
  options: { startTick?: number; invulnerableTurns?: number } = {}
): OracleResult => {
  const startTick = options.startTick ?? 0;
  const invulnerableTurns = options.invulnerableTurns ?? 0;
  const sequences = hazards.patrols.map((patrol) => patrolSequence(patrol.route));

  let period = 1;
  for (const gate of hazards.gates) {
    period = (period / gcd(period, gate.period)) * gate.period;
  }
  for (const sequence of sequences) {
    period = (period / gcd(period, sequence.length)) * sequence.length;
  }

  const blockedAt = (point: OraclePoint, tick: number): boolean => (
    hazards.blockers.some((blocker) => same(blocker, point))
    || hazards.gates.some((gate) => {
      if (!same(gate.cell, point)) {
        return false;
      }
      const q = (((tick - gate.openFrom) % gate.period) + gate.period) % gate.period;
      return q >= gate.openFor;
    })
  );
  const enemiesAt = (tick: number): OraclePoint[] => (
    sequences.map((sequence, index) => sequence[(tick + hazards.patrols[index]!.phase) % sequence.length]!)
  );

  const key = (point: OraclePoint, invulnerable: number): string => `${point.x},${point.y},${invulnerable}`;
  const startProblem = blockedAt(start, startTick)
    || (invulnerableTurns === 0 && enemiesAt(startTick).some((enemy) => same(enemy, start)));
  if (startProblem) {
    return { solvable: false, ticks: null };
  }

  let layer = new Map<string, { point: OraclePoint; invulnerable: number }>();
  layer.set(key(start, invulnerableTurns), { point: start, invulnerable: invulnerableTurns });
  if (same(start, goal)) {
    return { solvable: true, ticks: 0 };
  }

  const seenLayers = new Set<string>();
  for (let elapsed = 0; ; elapsed += 1) {
    const tick = startTick + elapsed;
    const signature = `${tick % period}|${[...layer.keys()].sort().join(';')}`;
    if (seenLayers.has(signature)) {
      return { solvable: false, ticks: null };
    }
    seenLayers.add(signature);

    const before = enemiesAt(tick);
    const after = enemiesAt(tick + 1);
    const next = new Map<string, { point: OraclePoint; invulnerable: number }>();
    for (const { point, invulnerable } of layer.values()) {
      const destinations = [...resolveLegacyWalkableGridNeighbors(grid, point), point];
      for (const dest of destinations) {
        if (blockedAt(dest, tick + 1)) {
          continue;
        }
        if (invulnerable === 0) {
          if (after.some((enemy) => same(enemy, dest))) {
            continue;
          }
          if (!same(dest, point) && before.some((enemy, e) => same(enemy, dest) && same(after[e]!, point))) {
            continue;
          }
        }
        if (same(dest, goal)) {
          return { solvable: true, ticks: elapsed + 1 };
        }
        const nextInvulnerable = invulnerable > 0 ? invulnerable - 1 : 0;
        next.set(key(dest, nextInvulnerable), { point: dest, invulnerable: nextInvulnerable });
      }
    }
    layer = next;
    if (layer.size === 0) {
      return { solvable: false, ticks: null };
    }
  }
};
