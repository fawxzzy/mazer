/**
 * Tiny independent reference implementation of the junction-greedy rules, written
 * from the rule text in docs/architecture/MAZER-CHASER-ENGINE.md. It shares no
 * code with src/mazer-core/hazards: coordinates instead of cell ids, a
 * "previous cell" instead of a heading to forbid reversals, its own wrap rule,
 * its own distance, and its own turn schedule.
 */

export type RefDir = 'U' | 'L' | 'D' | 'R';
export type RefRule = 'chaser' | 'interceptor' | 'wall-follower';

const VEC: Record<RefDir, readonly [number, number]> = { U: [0, -1], L: [-1, 0], D: [0, 1], R: [1, 0] };
export const REF_ORDER: readonly RefDir[] = ['U', 'L', 'D', 'R'];
const OPPOSITE: Record<RefDir, RefDir> = { U: 'D', D: 'U', L: 'R', R: 'L' };
// Rotations in the screen frame (y down): turning left from facing U is L.
const LEFT_OF: Record<RefDir, RefDir> = { U: 'L', L: 'D', D: 'R', R: 'U' };
const RIGHT_OF: Record<RefDir, RefDir> = { U: 'R', R: 'D', D: 'L', L: 'U' };

export interface RefWorld {
  readonly grid: readonly (readonly boolean[])[];
  readonly width: number;
  readonly height: number;
  /** Cells enemies treat as walls on a given turn. */
  readonly blocked?: (x: number, y: number, turn: number) => boolean;
}

export interface RefPoint {
  readonly x: number;
  readonly y: number;
}

export interface RefSpec {
  readonly rule: RefRule;
  readonly spawn: RefPoint;
  readonly lookahead: number;
  readonly initialFacing: RefDir | null;
  readonly delay: number;
  readonly grace: number;
  readonly divisor: number;
}

export interface RefEnemy {
  readonly present: boolean;
  readonly x: number;
  readonly y: number;
  readonly prev: RefPoint | null;
  readonly facing: RefDir | null;
}

export interface RefPlayer extends RefPoint {
  readonly facing: RefDir | null;
}


/** One cardinal step with production-style wrap, or null. */
export const refStep = (world: RefWorld, x: number, y: number, dir: RefDir): RefPoint | null => {
  const [dx, dy] = VEC[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (nx >= 0 && nx < world.width && ny >= 0 && ny < world.height) {
    return world.grid[ny]![nx]! ? { x: nx, y: ny } : null;
  }
  const wx = nx < 0 ? world.width - 1 : nx >= world.width ? 0 : nx;
  const wy = ny < 0 ? world.height - 1 : ny >= world.height ? 0 : ny;
  if (world.grid[wy]![wx]! && !(wx === x && wy === y)) {
    return { x: wx, y: wy };
  }
  return null;
};

export const refExits = (world: RefWorld, x: number, y: number): Array<{ dir: RefDir } & RefPoint> => {
  const exits: Array<{ dir: RefDir } & RefPoint> = [];
  for (const dir of REF_ORDER) {
    const to = refStep(world, x, y, dir);
    if (to && !exits.some((e) => e.x === to.x && e.y === to.y)) {
      exits.push({ dir, ...to });
    }
  }
  return exits;
};

const wrapsHorizontally = (world: RefWorld): boolean => (
  world.width > 1 && world.grid.some((row) => row[0]! && row[world.width - 1]!)
);
const wrapsVertically = (world: RefWorld): boolean => (
  world.height > 1 && world.grid[0]!.some((open, x) => open && world.grid[world.height - 1]![x]!)
);

export const refDistance = (world: RefWorld, a: RefPoint, b: RefPoint): number => {
  let dx = Math.abs(a.x - b.x);
  let dy = Math.abs(a.y - b.y);
  if (wrapsHorizontally(world)) {
    dx = Math.min(dx, world.width - dx);
  }
  if (wrapsVertically(world)) {
    dy = Math.min(dy, world.height - dy);
  }
  return dx + dy;
};

export const refInitialEnemy = (world: RefWorld, spec: RefSpec): RefEnemy => {
  if (spec.delay > 0) {
    return { present: false, x: -1, y: -1, prev: null, facing: null };
  }
  return refSpawn(world, spec);
};

const refSpawn = (world: RefWorld, spec: RefSpec): RefEnemy => {
  const facing = spec.initialFacing ?? (spec.rule === 'wall-follower' ? 'U' : null);
  const prev = spec.initialFacing ? refStep(world, spec.spawn.x, spec.spawn.y, OPPOSITE[spec.initialFacing]) : null;
  return { present: true, x: spec.spawn.x, y: spec.spawn.y, prev, facing };
};

/** Enemy phase of world turn `turn` (>= 1) with the player AFTER its move. */
export const refStepEnemy = (
  world: RefWorld,
  spec: RefSpec,
  enemy: RefEnemy,
  player: RefPlayer,
  turn: number
): RefEnemy => {
  if (!enemy.present) {
    return turn >= spec.delay ? refSpawn(world, spec) : enemy;
  }
  const begins = spec.delay + spec.grace;
  if (!(turn > begins && (turn - begins) % spec.divisor === 0)) {
    return enemy;
  }
  const open = (to: RefPoint | null): to is RefPoint => (
    to !== null && !(world.blocked?.(to.x, to.y, turn) ?? false)
  );
  const moved = (to: RefPoint, dir: RefDir): RefEnemy => (
    { present: true, x: to.x, y: to.y, prev: { x: enemy.x, y: enemy.y }, facing: dir }
  );

  if (spec.rule === 'wall-follower') {
    const facing = enemy.facing ?? 'U';
    const tries: RefDir[] = [LEFT_OF[facing], facing, RIGHT_OF[facing], OPPOSITE[facing]];
    for (const dir of tries) {
      const to = refStep(world, enemy.x, enemy.y, dir);
      if (open(to)) {
        return moved(to, dir);
      }
    }
    return enemy;
  }

  const exits = refExits(world, enemy.x, enemy.y).filter((exit) => open(exit));
  const isPrev = (exit: RefPoint): boolean => enemy.prev !== null && exit.x === enemy.prev.x && exit.y === enemy.prev.y;
  const forward = exits.filter((exit) => !isPrev(exit));
  if (forward.length === 0) {
    const back = exits.find((exit) => isPrev(exit));
    return back ? moved(back, back.dir) : enemy;
  }
  if (forward.length === 1) {
    return moved(forward[0]!, forward[0]!.dir);
  }
  let target: RefPoint = { x: player.x, y: player.y };
  if (spec.rule === 'interceptor' && player.facing !== null) {
    for (let i = 0; i < spec.lookahead; i += 1) {
      const next = refStep(world, target.x, target.y, player.facing);
      if (!next) {
        break;
      }
      target = next;
    }
  }
  let best = forward[0]!;
  for (const exit of forward.slice(1)) {
    if (refDistance(world, exit, target) < refDistance(world, best, target)) {
      best = exit;
    }
  }
  return moved(best, best.dir);
};

// ---------------------------------------------------------------------------
// Brute-force solvability oracle over absolute-time layers (no folding)
// ---------------------------------------------------------------------------

export interface RefOracleOptions {
  readonly start: RefPoint;
  readonly goal: RefPoint;
  readonly maxTicks: number;
  /** Cells the player cannot enter (static blockers). */
  readonly impassable?: ReadonlySet<string>;
}

const keyOfEnemy = (enemy: RefEnemy): string => (
  enemy.present ? `${enemy.x},${enemy.y},${enemy.prev ? `${enemy.prev.x}.${enemy.prev.y}` : '-'},${enemy.facing ?? '-'}` : 'x'
);

/** Fewest actions of a contact-free route, or null when none exists within `maxTicks`. */
export const refShortestSolve = (
  world: RefWorld,
  specs: readonly RefSpec[],
  options: RefOracleOptions
): number | null => {
  const atEnemy = (enemy: RefEnemy, x: number, y: number): boolean => enemy.present && enemy.x === x && enemy.y === y;
  let enemies = specs.map((spec) => refInitialEnemy(world, spec));
  if (enemies.some((enemy) => atEnemy(enemy, options.start.x, options.start.y))) {
    return null;
  }
  if (options.start.x === options.goal.x && options.start.y === options.goal.y) {
    return 0;
  }
  interface Node { readonly player: RefPlayer; readonly enemies: readonly RefEnemy[] }
  let layer: Node[] = [{ player: { ...options.start, facing: null }, enemies }];
  for (let tick = 0; tick < options.maxTicks; tick += 1) {
    const seen = new Set<string>();
    const next: Node[] = [];
    for (const node of layer) {
      const moves: Array<{ dest: RefPoint; facing: RefDir | null }> = [];
      for (const exit of refExits(world, node.player.x, node.player.y)) {
        moves.push({ dest: { x: exit.x, y: exit.y }, facing: exit.dir });
      }
      moves.push({ dest: { x: node.player.x, y: node.player.y }, facing: null });
      for (const move of moves) {
        if (options.impassable?.has(`${move.dest.x},${move.dest.y}`)) {
          continue;
        }
        const player: RefPlayer = {
          x: move.dest.x, y: move.dest.y, facing: move.facing ?? node.player.facing
        };
        enemies = specs.map((spec, e) => refStepEnemy(world, spec, node.enemies[e]!, player, tick + 1));
        const occupied = enemies.some((enemy) => atEnemy(enemy, player.x, player.y));
        const swapped = (player.x !== node.player.x || player.y !== node.player.y)
          && enemies.some((enemy, e) => {
            const before = node.enemies[e]!;
            return atEnemy(before, player.x, player.y) && atEnemy(enemy, node.player.x, node.player.y);
          });
        if (occupied || swapped) {
          continue;
        }
        if (player.x === options.goal.x && player.y === options.goal.y) {
          return tick + 1;
        }
        const key = `${player.x},${player.y},${player.facing ?? '-'}|${enemies.map(keyOfEnemy).join('|')}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push({ player, enemies: enemies.slice() });
        }
      }
    }
    layer = next;
    if (layer.length === 0) {
      return null;
    }
  }
  return null;
};
