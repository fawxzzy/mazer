/**
 * Sentry motion (slice H4). Pure: no scene, no randomness, no clock.
 *
 * A Sentry is the graph contract's `patrol`: a shuttle on a fixed straight rail,
 * one cell per world tick, forward then back with no dwell. Its cell is a pure
 * function of the tick and its spec; the spec (rail, phase) is a pure function of
 * the maze seed and level, chosen by placement (`placeLevelHazards`, hazard seed
 * stream). It never reads the player, so a Sentry is deterministic and provable.
 *
 * At most `HAZARD_CAPS.sentries` (4) per board (readability cap, product contract
 * 2.4); `createSentryField` throws past it. Positions use the same arithmetic as
 * `HazardTimeline.enemyCellsAt` (`patrolCellAt`), so render, collision and the
 * validator agree by construction.
 *
 * Hot path: `cellAt` and `writeCellsAt` allocate nothing.
 */

import {
  createHazardTimeline,
  patrolCellAt,
  type HazardCellId,
  type HazardGraph,
  type HazardSpec,
  type PatrolSpec
} from './graphContract';
import { HAZARD_CAPS } from './schedule';

export const SENTRY_FIELD_CONTRACT = 'mazer-sentry-field-v1' as const;

/** Readability cap: Sentries per board. */
export const MAX_SENTRIES = HAZARD_CAPS.sentries;

export interface SentryField {
  readonly contract: typeof SENTRY_FIELD_CONTRACT;
  /** Number of Sentries (0..MAX_SENTRIES), in patrol spec order. */
  readonly count: number;
  /** Combined period of the Sentries alone (lcm of their cycles; 1 when there are none). */
  readonly period: number;
  readonly specs: readonly PatrolSpec[];
  /** Cell of Sentry `index` at `tick` (any integer). */
  cellAt(index: number, tick: number): HazardCellId;
  /** Writes every Sentry cell at `tick` into `out[0..count)`; returns `count`. */
  writeCellsAt(tick: number, out: Int32Array | HazardCellId[]): number;
  /** The whole rail of Sentry `index` (telegraph: faint dots). The chevron is `cellAt(index, tick + 1)`. */
  rail(index: number): readonly HazardCellId[];
}

/**
 * Builds the Sentry field from a level's hazard specs (gates are ignored). Specs
 * are validated by `createHazardTimeline` (walkable, 4-connected rail, period ==
 * shuttle cycle), so an invalid rail throws `HazardSpecError` exactly as there.
 */
export const createSentryField = (graph: HazardGraph, specs: readonly HazardSpec[]): SentryField => {
  const patrols = specs.filter((spec): spec is PatrolSpec => spec.kind === 'patrol');
  if (patrols.length > MAX_SENTRIES) {
    throw new RangeError(`a board holds at most ${MAX_SENTRIES} Sentries, received ${patrols.length}`);
  }
  const period = createHazardTimeline(graph, patrols).period;
  const count = patrols.length;

  const assertIndex = (index: number): void => {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError(`sentry index ${String(index)} is outside 0..${count - 1}`);
    }
  };
  const assertTick = (tick: number): void => {
    if (!Number.isInteger(tick)) {
      throw new RangeError(`tick must be an integer, received ${String(tick)}`);
    }
  };

  return {
    contract: SENTRY_FIELD_CONTRACT,
    count,
    period,
    specs: patrols,
    cellAt(index, tick) {
      assertIndex(index);
      assertTick(tick);
      return patrolCellAt(patrols[index]!, tick);
    },
    writeCellsAt(tick, out) {
      assertTick(tick);
      for (let index = 0; index < count; index += 1) {
        out[index] = patrolCellAt(patrols[index]!, tick);
      }
      return count;
    },
    rail(index) {
      assertIndex(index);
      return patrols[index]!.route;
    }
  };
};
