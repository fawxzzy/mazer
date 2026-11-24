/**
 * Constant-speed floor for held moves (MAZER-CTRL-003 speed bug, 2026-11-19).
 *
 * Zac: "it feels like it got a speed boost when turning or going around corners". Root cause (measured in
 * tests/legacy-runtime/legacyHeldStepCadence.test.ts): every time the touch stick's ranked direction pair changed (a
 * turn, a corner, and also a thumb wobbling across the horizontal or the 45 degree line) the scene pulled the pending
 * step in to `now + 32 ms` whenever it was more than 48 ms away. The step after the change therefore landed as little as
 * 32 ms after the previous one instead of one repeat interval (122 ms at the default speed): a turn ran up to ~3.5x
 * faster for one tile, and a wobbly thumb on a straight could chain several short steps. The keyboard had the same shape:
 * a fresh key press (a turn while the other key is still held) stepped 50 ms after the press, however recently the last
 * step landed.
 *
 * The fix is one rule for every fresh (not chained) step: it may not land earlier than one repeat interval after the
 * previous accepted step. A player who has been standing still (or pushing into a wall) for a full interval still gets
 * the fast first step; a player who is already moving keeps the exact same rhythm through a turn. Chained repeats are
 * untouched (legacyRepeatCadence.ts keeps their average exact at any refresh rate).
 *
 * Pure: no Phaser, no clock of its own.
 */

const isFiniteNumber = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

/**
 * The earliest time a fresh step may land: never sooner than `minLeadMs` from now, and never sooner than one repeat
 * interval after the last accepted step. With no previous step (or an unusable clock) only the lead applies.
 */
export const resolveHeldStepEarliestAtMs = (
  nowMs: number,
  lastStepAtMs: number | null,
  repeatIntervalMs: number,
  minLeadMs = 0
): number => {
  const lead = nowMs + Math.max(0, minLeadMs);
  if (!isFiniteNumber(lastStepAtMs) || !isFiniteNumber(repeatIntervalMs) || repeatIntervalMs <= 0) {
    return lead;
  }
  return Math.max(lead, lastStepAtMs + repeatIntervalMs);
};

/**
 * Wait for a fresh step that would otherwise wait `delayMs`: the same delay, stretched only as far as the
 * constant-speed floor needs. Rounded to whole ms like every Phaser delayed call the scene arms.
 */
export const resolveHeldStepFreshWaitMs = (
  nowMs: number,
  delayMs: number,
  lastStepAtMs: number | null,
  repeatIntervalMs: number
): number => {
  const delay = Math.max(0, Math.round(isFiniteNumber(delayMs) ? delayMs : 0));
  if (!isFiniteNumber(nowMs)) {
    return delay;
  }
  return Math.max(delay, Math.ceil(resolveHeldStepEarliestAtMs(nowMs, lastStepAtMs, repeatIntervalMs) - nowMs));
};

export interface HeldStepRetargetInput {
  nowMs: number;
  /** When the step that is armed now is due, or null when nothing is armed. */
  currentDueAtMs: number | null;
  /** When the last accepted step landed, or null when there was none. */
  lastStepAtMs: number | null;
  /** The live repeat interval (the stick-capped one while the stick is held). */
  repeatIntervalMs: number;
  /** Quickest response to a new direction (the stick's 32 ms). */
  retargetLeadMs: number;
  /** An armed step this close to the target time is left alone (no pointless re-arm). */
  graceMs: number;
}

/**
 * The stick's direction pair changed. Returns the wait to re-arm the step with, or null to keep the armed one.
 * Pulls the step in only as far as the constant-speed floor allows, so a turn can answer quickly from rest but never
 * shortens a running cadence. With no recent step this is exactly the old rule (re-arm at the lead when the armed step
 * is more than lead + grace away).
 */
export const resolveHeldStepRetargetWaitMs = (input: HeldStepRetargetInput): number | null => {
  const { nowMs, currentDueAtMs, lastStepAtMs, repeatIntervalMs, retargetLeadMs, graceMs } = input;
  if (!isFiniteNumber(nowMs)) {
    return null;
  }
  const earliestAtMs = resolveHeldStepEarliestAtMs(nowMs, lastStepAtMs, repeatIntervalMs, retargetLeadMs);
  if (!isFiniteNumber(currentDueAtMs) || currentDueAtMs - earliestAtMs > Math.max(0, graceMs)) {
    return Math.max(0, Math.ceil(earliestAtMs - nowMs));
  }
  return null;
};

/**
 * MAZER-CTRL-005 (2026-11-23): the keyboard's step floor, chained off the previous step's IDEAL time instead of the
 * time it actually landed, exactly like the held-touch repeat (legacyRepeatCadence.ts). A step lands on a frame
 * boundary, so measuring the next interval from the late landing compounded the lateness into the period: a 151 ms
 * interval really stepped every 166.7 ms at 60 Hz (6.0 cells/s against the 6.6 the setting says), while the stick
 * stepped every 151. One pace for both inputs needs one rule.
 *
 * `anchorAtMs` is the ideal time of the last keyboard step (null when there is none). It only counts while the last
 * accepted step of ANY input landed within `maxLateMs` of it; otherwise the real landing time wins (a stick step, a
 * hitch, a stall or a long rest re-anchors the cadence, never bursts to catch up).
 */
export const resolveKeyboardStepFloorBaseMs = (
  lastStepAtMs: number | null,
  anchorAtMs: number | null,
  maxLateMs: number
): number | null => {
  if (!isFiniteNumber(lastStepAtMs)) {
    return null;
  }
  if (isFiniteNumber(anchorAtMs) && lastStepAtMs >= anchorAtMs && lastStepAtMs - anchorAtMs <= maxLateMs) {
    return anchorAtMs;
  }
  return lastStepAtMs;
};

/**
 * The anchor to remember after a keyboard step lands at `nowMs`: the time the step was first allowed (its ideal time)
 * when it landed within `maxLateMs` of that, otherwise `nowMs` itself.
 */
export const resolveKeyboardStepAnchorMs = (
  nowMs: number,
  lastStepAtMs: number | null,
  anchorAtMs: number | null,
  repeatIntervalMs: number,
  maxLateMs: number
): number => {
  const base = resolveKeyboardStepFloorBaseMs(lastStepAtMs, anchorAtMs, maxLateMs);
  if (base === null || !isFiniteNumber(repeatIntervalMs) || repeatIntervalMs <= 0) {
    return nowMs;
  }
  const idealAtMs = base + repeatIntervalMs;
  const lateMs = nowMs - idealAtMs;
  return lateMs >= 0 && lateMs <= maxLateMs ? idealAtMs : nowMs;
};
