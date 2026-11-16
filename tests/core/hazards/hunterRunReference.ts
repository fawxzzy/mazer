/**
 * Independent reference of the H5 Hunter run rules (contract 2.3, graph contract
 * A2/A4), written from the rule text. It shares no code with
 * src/mazer-core/hazards: coordinates instead of cell ids, the `chaserReference`
 * enemy rules instead of `chaserEngine`, its own junction test, its own trail and
 * its own burnout counter. Scope: Hunters on a static grid (no gates, no Sentries)
 * and the plain rewind (last junction strictly behind the contact cell, else the
 * start); the runtime safety search is not modelled, so callers compare only runs
 * whose production rewinds all resolved to that plain junction.
 */

import { refExits, refInitialEnemy, refStep, refStepEnemy, type RefDir, type RefEnemy, type RefPoint, type RefSpec, type RefWorld } from './chaserReference';

export type RefAction = RefDir | 'W';

export interface RefRunState {
  readonly tick: number;
  readonly player: RefPoint;
  readonly facing: RefDir | null;
  readonly trail: readonly RefPoint[];
  readonly invulnerable: number;
  readonly enemies: readonly RefEnemy[];
  readonly hits: readonly number[];
  readonly burned: readonly boolean[];
  readonly contacts: number;
  readonly done: boolean;
}

export const REF_BURNOUT = 3;
export const REF_PLAY_INVULNERABLE = 4;

const same = (a: RefPoint, b: RefPoint): boolean => a.x === b.x && a.y === b.y;
const isJunction = (world: RefWorld, p: RefPoint): boolean => refExits(world, p.x, p.y).length >= 3;

export const refRunStart = (world: RefWorld, specs: readonly RefSpec[], start: RefPoint): RefRunState => ({
  tick: 0,
  player: start,
  facing: null,
  trail: [start],
  invulnerable: 0,
  enemies: specs.map((spec) => refInitialEnemy(world, spec)),
  hits: specs.map(() => 0),
  burned: specs.map(() => false),
  contacts: 0,
  done: false
});

export const refRunStep = (
  world: RefWorld,
  specs: readonly RefSpec[],
  goal: RefPoint,
  state: RefRunState,
  action: RefAction
): RefRunState => {
  if (state.done) {
    return state;
  }
  const origin = state.player;
  const moved = action === 'W' ? null : refStep(world, origin.x, origin.y, action);
  const dest = moved ?? origin;
  const facing = moved ? (action as RefDir) : state.facing;
  const trail = moved ? [...state.trail, dest] : state.trail;
  const turn = state.tick + 1;
  const enemies = state.enemies.map((enemy, i) => (
    state.burned[i] ? enemy : refStepEnemy(world, specs[i]!, enemy, { ...dest, facing }, turn)
  ));
  const hitBy: number[] = [];
  let invulnerable = state.invulnerable;
  if (invulnerable > 0) {
    invulnerable -= 1;
  } else {
    enemies.forEach((enemy, i) => {
      if (state.burned[i] || !enemy.present) {
        return;
      }
      const before = state.enemies[i]!;
      const occupied = same(enemy, dest);
      const swapped = !same(dest, origin) && before.present && same(before, dest) && same(enemy, origin);
      if (occupied || swapped) {
        hitBy.push(i);
      }
    });
  }
  if (hitBy.length > 0) {
    const hits = state.hits.map((n, i) => (hitBy.includes(i) ? n + 1 : n));
    const burned = state.burned.map((b, i) => b || hits[i]! >= REF_BURNOUT);
    let back = 0;
    for (let i = trail.length - 2; i >= 0; i -= 1) {
      if (isJunction(world, trail[i]!)) {
        back = i;
        break;
      }
    }
    return {
      tick: turn,
      player: trail[back]!,
      facing,
      trail: trail.slice(0, back + 1),
      invulnerable: REF_PLAY_INVULNERABLE,
      enemies,
      hits,
      burned,
      contacts: state.contacts + 1,
      done: false
    };
  }
  return {
    ...state,
    tick: turn,
    player: dest,
    facing,
    trail,
    invulnerable,
    enemies,
    done: same(dest, goal)
  };
};

/** Cell the reference Hunter occupies, as a cell id on a `width`-wide grid, or -1. */
export const refHunterCell = (state: RefRunState, index: number, width: number): number => {
  const enemy = state.enemies[index]!;
  return state.burned[index] || !enemy.present ? -1 : enemy.y * width + enemy.x;
};
