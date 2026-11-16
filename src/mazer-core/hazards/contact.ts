/**
 * Contact system, collision phase (slice H4, amendment A2). Pure: no scene, no
 * randomness, no clock. Not called by any scene yet (wired after slice H3).
 *
 * One world tick takes the world from tick `t` to `t + 1` (graph contract, Tick
 * semantics): 1. the player steps from `cell` to `dest` (`dest === cell` for a
 * WAIT, a bump or a closed gate); 2. every enemy moves to its tick `t + 1` cell;
 * 3. collision phase, this module. Contact occurs iff either
 *   (a) occupancy: `dest` is some enemy's cell at tick `t + 1`; or
 *   (b) head-on swap: some enemy was on `dest` at tick `t` and is on `cell` at
 *       tick `t + 1` (`dest !== cell`).
 * Cells are compared, never coordinates, so a swap across a wrap edge counts
 * exactly like an in-bounds swap. An enemy moving away in the same direction is
 * no contact. This is the same rule `findWitnessRoute` treats as illegal.
 *
 * Invulnerability: while the counter is above 0 the collision phase ignores
 * contact for the tick and decrements it (every tick, move or wait). Play grants
 * `PLAY_INVULNERABLE_TICKS` (4) after a rewind; the validator proves N = 2, and
 * more invulnerability is never worse. Obstacles are not handled here: gates
 * block in the movement phase and are never suspended.
 *
 * CLEAN: a level cleared with zero contacts. Gate ejects (A3) are not contacts.
 *
 * Hot path: `findContact*` and `stepCollision` allocate nothing. `stepCollision`
 * returns one event object owned by the tracker and overwritten on the next
 * contact; copy the fields if they must outlive the next call.
 */

import type { HazardCellId } from './graphContract';

export const HAZARD_CONTACT_CONTRACT = 'mazer-hazard-contact-v1' as const;

/** Invulnerable ticks granted after a rewind in play (amendment A2). */
export const PLAY_INVULNERABLE_TICKS = 4;

export type HazardContactKind = 'occupancy' | 'swap';

/** Enemy cells indexed by enemy, in stable order (`HazardTimeline.enemyCellsAt` or `SentryField.writeCellsAt`). */
export type EnemyCells = ArrayLike<HazardCellId>;

/** Index of the first enemy whose tick `t + 1` cell is `dest`, or -1. */
export const findOccupancyContact = (after: EnemyCells, count: number, dest: HazardCellId): number => {
  for (let e = 0; e < count; e += 1) {
    if (after[e] === dest) {
      return e;
    }
  }
  return -1;
};

/** Index of the first enemy that swapped with the player (`dest` at `t`, `cell` at `t + 1`), or -1. */
export const findSwapContact = (
  before: EnemyCells,
  after: EnemyCells,
  count: number,
  cell: HazardCellId,
  dest: HazardCellId
): number => {
  if (dest === cell) {
    return -1;
  }
  for (let e = 0; e < count; e += 1) {
    if (before[e] === dest && after[e] === cell) {
      return e;
    }
  }
  return -1;
};

export interface HazardContactEvent {
  /** Arrival tick `t + 1` of the tick that made contact. */
  tick: number;
  /** Player cell at tick `t`. */
  cell: HazardCellId;
  /** Player cell after the movement phase (equals `cell` for a wait). */
  dest: HazardCellId;
  enemyIndex: number;
  kind: HazardContactKind;
  /** 1-based contact count in this level, including this one. */
  ordinal: number;
}

export interface HazardContactSummary {
  readonly contract: typeof HAZARD_CONTACT_CONTRACT;
  readonly contacts: number;
  /** True when the level had no contact: the clear card shows "CLEAN". */
  readonly clean: boolean;
}

export interface HazardContactTracker {
  /** Ticks of invulnerability left. */
  readonly invulnerableTicks: number;
  /** Contacts so far in this level. */
  readonly contacts: number;
  /** No contact so far in this level. */
  readonly clean: boolean;
  /**
   * Collision phase of the tick from `tick` to `tick + 1`. `before` holds the
   * enemy cells at `tick`, `after` at `tick + 1`. Returns the (reused) event on a
   * contact, else null. While invulnerable, contact is ignored and the counter
   * decrements.
   */
  stepCollision(
    tick: number,
    cell: HazardCellId,
    dest: HazardCellId,
    before: EnemyCells,
    after: EnemyCells,
    enemyCount: number
  ): Readonly<HazardContactEvent> | null;
  /** Sets the invulnerability counter (never lowers it). Call with the rewind plan's ticks. */
  grantInvulnerability(ticks: number): void;
  /** New level: zero contacts, no invulnerability. */
  reset(): void;
  summary(): HazardContactSummary;
}

export const createContactTracker = (): HazardContactTracker => {
  let invulnerable = 0;
  let contacts = 0;
  const event: HazardContactEvent = { tick: 0, cell: -1, dest: -1, enemyIndex: -1, kind: 'occupancy', ordinal: 0 };

  return {
    get invulnerableTicks() {
      return invulnerable;
    },
    get contacts() {
      return contacts;
    },
    get clean() {
      return contacts === 0;
    },
    stepCollision(tick, cell, dest, before, after, enemyCount) {
      if (invulnerable > 0) {
        invulnerable -= 1;
        return null;
      }
      let enemyIndex = findOccupancyContact(after, enemyCount, dest);
      let kind: HazardContactKind = 'occupancy';
      if (enemyIndex < 0) {
        enemyIndex = findSwapContact(before, after, enemyCount, cell, dest);
        kind = 'swap';
      }
      if (enemyIndex < 0) {
        return null;
      }
      contacts += 1;
      event.tick = tick + 1;
      event.cell = cell;
      event.dest = dest;
      event.enemyIndex = enemyIndex;
      event.kind = kind;
      event.ordinal = contacts;
      return event;
    },
    grantInvulnerability(ticks) {
      if (!Number.isInteger(ticks) || ticks < 0) {
        throw new RangeError(`invulnerable ticks must be a non-negative integer, received ${String(ticks)}`);
      }
      if (ticks > invulnerable) {
        invulnerable = ticks;
      }
    },
    reset() {
      invulnerable = 0;
      contacts = 0;
    },
    summary() {
      return { contract: HAZARD_CONTACT_CONTRACT, contacts, clean: contacts === 0 };
    }
  };
};
