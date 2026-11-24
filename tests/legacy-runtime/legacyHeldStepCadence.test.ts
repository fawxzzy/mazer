import { describe, expect, it } from 'vitest';
import { resolveStickPullVector } from '../../src/input-human/touch';
import {
  LegacyDirectionalIntentResolver,
  type LegacyCardinalDirection
} from '../../src/legacy-runtime/legacyDirectionalIntent';
import {
  resolveHeldStepEarliestAtMs,
  resolveHeldStepFreshWaitMs,
  resolveHeldStepRetargetWaitMs,
  resolveKeyboardStepAnchorMs,
  resolveKeyboardStepFloorBaseMs
} from '../../src/legacy-runtime/legacyHeldStepCadence';
import type { LegacyMazeSnapshot, LegacyPoint } from '../../src/legacy-runtime/legacyMaze';
import {
  LEGACY_MOVEMENT_SPEED_DEFAULT,
  resolveLegacyMovementSpeedProfile,
  scaleLegacyMovementDelayMs
} from '../../src/legacy-runtime/legacyMovementSpeed';
import { resolveDriftCorrectedRepeatWaitMs } from '../../src/legacy-runtime/legacyRepeatCadence';

/**
 * Deterministic reproduction of "it feels like it got a speed boost when turning or going around corners".
 *
 * The simulation mirrors the MenuScene held-stick loop (handleLegacyPlayTouchControlMove ->
 * setLegacyPlayHeldTouchMoveCandidates with smoothRetarget -> scheduleLegacyPlayHeldTouchRepeat): a 60 Hz frame loop,
 * Phaser delayed calls that fire on the first frame at or past their due time, the drift-corrected chained repeat, the
 * real stick pull maths (resolveStickPullVector) and the real direction resolver (LegacyDirectionalIntentResolver) on a
 * zig-zag corridor. A scripted thumb points along the corridor, rotates into each corner a tile early (as a player
 * does), and optionally wobbles a few degrees like a real thumb.
 */

const FRAME_MS = 1000 / 60;
// Same numbers as MenuScene: LEGACY_PLAY_STICK_RETARGET_STEP_MS / _RESCHEDULE_GRACE_MS / _REPEAT_INTERVAL_MAX_MS.
const RETARGET_LEAD_MS = 32;
const RETARGET_GRACE_MS = 16;
const STICK_REPEAT_MS = Math.min(
  resolveLegacyMovementSpeedProfile(LEGACY_MOVEMENT_SPEED_DEFAULT).repeatIntervalMs,
  scaleLegacyMovementDelayMs(104)
);

const DELTAS: Record<LegacyCardinalDirection, LegacyPoint> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
const ANGLES: Record<LegacyCardinalDirection, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2
};

/** Zig-zag corridor: straight runs and both left and right turns. */
const RUNS: Array<[LegacyCardinalDirection, number]> = [
  ['right', 6], ['down', 4], ['right', 5], ['up', 3], ['right', 4], ['down', 6], ['left', 5], ['down', 3], ['right', 7]
];

const buildCorridor = (): { maze: LegacyMazeSnapshot; path: LegacyPoint[] } => {
  const size = 40;
  const path: LegacyPoint[] = [{ x: 3, y: 10 }];
  for (const [direction, length] of RUNS) {
    for (let i = 0; i < length; i += 1) {
      const last = path[path.length - 1]!;
      path.push({ x: last.x + DELTAS[direction].x, y: last.y + DELTAS[direction].y });
    }
  }
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  for (const point of path) {
    grid[point.y]![point.x] = true;
  }
  return {
    maze: {
      source: 'play-generated',
      size,
      grid,
      start: { ...path[0]! },
      goal: { ...path[path.length - 1]! },
      solutionPath: path.map((point) => ({ ...point })),
      seed: 17
    } as unknown as LegacyMazeSnapshot,
    path
  };
};

const directionBetween = (from: LegacyPoint, to: LegacyPoint): LegacyCardinalDirection => (
  to.x > from.x ? 'right' : to.x < from.x ? 'left' : to.y > from.y ? 'down' : 'up'
);

type Policy = 'pre-fix' | 'constant-speed';

interface SimStep { atMs: number; direction: LegacyCardinalDirection }

const simulate = (options: { policy: Policy; wobbleDeg: number; wobbleHz: number }): SimStep[] => {
  const { maze, path } = buildCorridor();
  // 390x844 floating stick: outer 94 px, dead zone 12 px (MenuScene.resolveLegacyPlayFloatingStickGeometry).
  const anchor = { x: 200, y: 600 };
  const outer = 94;
  const stick = {
    deadzoneRadius: 12,
    knobRadius: 10,
    travelRadius: 30,
    inner: { left: 0, top: 0, width: 34, height: 34, right: 34, bottom: 34, centerX: anchor.x, centerY: anchor.y },
    outer: {
      left: anchor.x - outer / 2,
      top: anchor.y - outer / 2,
      width: outer,
      height: outer,
      right: anchor.x + outer / 2,
      bottom: anchor.y + outer / 2,
      centerX: anchor.x,
      centerY: anchor.y
    }
  } as unknown as Parameters<typeof resolveStickPullVector>[0];
  const pullPx = 40;
  const turnRadPerMs = (Math.PI / 2) / 90; // a quarter turn of the thumb in 90 ms

  const intent = new LegacyDirectionalIntentResolver();
  let player = { ...path[0]! };
  let thumbAngle = ANGLES[directionBetween(path[0]!, path[1]!)];
  let candidatesKey: string | null = null;
  let dueAtMs: number | null = null;
  let lastStepAtMs: number | null = null;
  const steps: SimStep[] = [];

  const arm = (nowMs: number, waitMs: number): void => { dueAtMs = nowMs + waitMs; };
  const retarget = (nowMs: number, fresh: boolean): void => {
    if (options.policy === 'pre-fix') {
      // The rule MenuScene ran before this fix (copied verbatim in spirit).
      if (fresh) {
        if (dueAtMs === null) arm(nowMs, RETARGET_LEAD_MS);
        return;
      }
      if (dueAtMs === null || dueAtMs - nowMs > RETARGET_LEAD_MS + RETARGET_GRACE_MS) arm(nowMs, RETARGET_LEAD_MS);
      return;
    }
    if (fresh && dueAtMs !== null) return;
    const wait = resolveHeldStepRetargetWaitMs({
      nowMs,
      currentDueAtMs: dueAtMs,
      lastStepAtMs,
      repeatIntervalMs: STICK_REPEAT_MS,
      retargetLeadMs: RETARGET_LEAD_MS,
      graceMs: RETARGET_GRACE_MS
    });
    if (wait !== null) arm(nowMs, wait);
  };

  const goal = path[path.length - 1]!;
  for (let frame = 1; frame < 2400; frame += 1) {
    const nowMs = frame * FRAME_MS;
    if (player.x === goal.x && player.y === goal.y) break;

    // Thumb: aim at the next corridor tile; a tile before a corner, aim at the tile after the corner.
    const index = path.findIndex((point) => point.x === player.x && point.y === player.y);
    const next = path[index + 1]!;
    const afterNext = path[index + 2];
    const aim = afterNext !== undefined && directionBetween(next, afterNext) !== directionBetween(player, next)
      ? directionBetween(next, afterNext)
      : directionBetween(player, next);
    let delta = ANGLES[aim] - thumbAngle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    thumbAngle += Math.sign(delta) * Math.min(Math.abs(delta), turnRadPerMs * FRAME_MS);
    const wobble = (options.wobbleDeg * Math.PI / 180) * Math.sin(2 * Math.PI * options.wobbleHz * nowMs / 1000);
    const angle = thumbAngle + wobble;
    const pull = resolveStickPullVector(stick, anchor.x + Math.cos(angle) * pullPx, anchor.y + Math.sin(angle) * pullPx, {
      allowBeyondOuter: true
    });

    // Pointer move (MenuScene.handleLegacyPlayTouchControlMove).
    if (pull === null) {
      candidatesKey = null;
      dueAtMs = null;
      intent.reset();
    } else {
      intent.requestAnalog(pull.normalizedX, pull.normalizedY);
      const key = pull.movementCandidates.join(',');
      if (key === candidatesKey) {
        retarget(nowMs, true);
      } else {
        candidatesKey = key;
        retarget(nowMs, false);
      }
    }

    // Phaser clock: the armed delayed call fires on the first frame at or past its due time.
    if (dueAtMs !== null && nowMs >= dueAtMs - 1e-6) {
      const firedDueAtMs: number = dueAtMs;
      dueAtMs = null;
      const step = intent.step(maze, player, { assistedLaneShiftEnabled: true });
      if (step.moved && step.target !== null && step.direction !== null) {
        player = { ...step.target };
        lastStepAtMs = nowMs;
        steps.push({ atMs: nowMs, direction: step.direction });
      }
      arm(nowMs, resolveDriftCorrectedRepeatWaitMs(firedDueAtMs, nowMs, STICK_REPEAT_MS));
    }
  }
  expect(player).toEqual(goal);
  return steps;
};

const intervals = (steps: SimStep[]): Array<{ ms: number; turn: boolean }> => steps.slice(1).map((step, i) => ({
  ms: step.atMs - steps[i]!.atMs,
  turn: step.direction !== steps[i]!.direction
}));

describe('held-move constant speed (MAZER-CTRL-003 speed bug)', () => {
  it('REPRO: before the fix a turn on the stick landed far sooner than one repeat interval after the previous step', () => {
    const gaps = intervals(simulate({ policy: 'pre-fix', wobbleDeg: 0, wobbleHz: 0 }));
    const turnGaps = gaps.filter((gap) => gap.turn).map((gap) => gap.ms);
    expect(turnGaps.length).toBeGreaterThanOrEqual(8);
    // At least one turn stepped in about half the interval or less: the "speed boost going around corners".
    // Measured: every one of the 8 turns stepped 83.3 ms after the previous step (repeat 122 ms): about 46% faster.
    expect(Math.min(...turnGaps)).toBeLessThan(STICK_REPEAT_MS - (2 * FRAME_MS));
  });

  it('REPRO: before the fix a thumb wobbling a few degrees made even straight runs step early', () => {
    const gaps = intervals(simulate({ policy: 'pre-fix', wobbleDeg: 6, wobbleHz: 4 }));
    const straightGaps = gaps.filter((gap) => !gap.turn).map((gap) => gap.ms);
    // Measured: with a 6 degree wobble steps chained as close as 50 ms on straights and turns alike.
    expect(Math.min(...straightGaps)).toBeLessThan(STICK_REPEAT_MS - (2 * FRAME_MS));
  });

  for (const wobble of [{ deg: 0, hz: 0 }, { deg: 6, hz: 4 }, { deg: 12, hz: 7 }]) {
    it(`FIXED: every step, turn or straight, is one repeat interval apart (+- one frame), wobble ${wobble.deg} deg`, () => {
      const steps = simulate({ policy: 'constant-speed', wobbleDeg: wobble.deg, wobbleHz: wobble.hz });
      const gaps = intervals(steps);
      expect(gaps.filter((gap) => gap.turn).length).toBeGreaterThanOrEqual(8);
      for (const gap of gaps) {
        expect(gap.ms).toBeGreaterThanOrEqual(STICK_REPEAT_MS - FRAME_MS - 1e-6);
        expect(gap.ms).toBeLessThanOrEqual(STICK_REPEAT_MS + FRAME_MS + 1e-6);
      }
      const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
      const turnMean = mean(gaps.filter((gap) => gap.turn).map((gap) => gap.ms));
      const straightMean = mean(gaps.filter((gap) => !gap.turn).map((gap) => gap.ms));
      expect(Math.abs(turnMean - straightMean)).toBeLessThanOrEqual(FRAME_MS);
    });
  }
});

describe('held-step cadence rules', () => {
  it('a fresh step from rest keeps the quick lead; a step during a run waits out the interval', () => {
    expect(resolveHeldStepEarliestAtMs(1000, null, 122, 32)).toBe(1032);
    expect(resolveHeldStepEarliestAtMs(1000, 500, 122, 32)).toBe(1032);
    expect(resolveHeldStepEarliestAtMs(1000, 990, 122, 32)).toBe(1112);
    expect(resolveHeldStepEarliestAtMs(1000, Number.NaN, 122, 32)).toBe(1032);
  });

  it('retarget keeps a running cadence and answers quickly from rest (old rule when no recent step)', () => {
    const base = { repeatIntervalMs: 122, retargetLeadMs: 32, graceMs: 16 };
    // moving: last step 10 ms ago, next due in 112 ms -> keep it (the old rule re-armed at 32 ms: the boost)
    expect(resolveHeldStepRetargetWaitMs({ ...base, nowMs: 1010, currentDueAtMs: 1122, lastStepAtMs: 1000 })).toBeNull();
    // nothing armed during a run -> arm for the floor, not the lead
    expect(resolveHeldStepRetargetWaitMs({ ...base, nowMs: 1010, currentDueAtMs: null, lastStepAtMs: 1000 })).toBe(112);
    // at rest against a wall (blocked repeats, last real step long ago) -> old 32 ms answer
    expect(resolveHeldStepRetargetWaitMs({ ...base, nowMs: 5000, currentDueAtMs: 5100, lastStepAtMs: 1000 })).toBe(32);
    expect(resolveHeldStepRetargetWaitMs({ ...base, nowMs: 5000, currentDueAtMs: 5040, lastStepAtMs: 1000 })).toBeNull();
    // a long initial wait is still shortened, but only down to the floor
    expect(resolveHeldStepRetargetWaitMs({ ...base, nowMs: 1060, currentDueAtMs: 1300, lastStepAtMs: 1000 })).toBe(62);
  });

  it('keyboard: a turn press shortly after a step waits out the interval; a press from rest keeps its 50 ms buffer', () => {
    expect(resolveHeldStepFreshWaitMs(1020, 50, 1000, 151)).toBe(131);
    expect(resolveHeldStepFreshWaitMs(2000, 50, 1000, 151)).toBe(50);
    expect(resolveHeldStepFreshWaitMs(2000, 50, null, 151)).toBe(50);
    expect(resolveHeldStepFreshWaitMs(Number.NaN, 50, 1000, 151)).toBe(50);
  });
});

describe('MAZER-CTRL-005 keyboard step anchor (held keys chain off the ideal step time)', () => {
  const MAX_LATE = 24;

  it('anchor: a step that fires a frame late is credited to its ideal time, so lateness does not compound', () => {
    // Last ideal step at 1000, interval 151 -> next ideal 1151; the key repeat lands at 1160 (9 ms late).
    expect(resolveKeyboardStepAnchorMs(1160, 1000, 1000, 151, MAX_LATE)).toBe(1151);
    // Exactly on time.
    expect(resolveKeyboardStepAnchorMs(1151, 1000, 1000, 151, MAX_LATE)).toBe(1151);
  });

  it('anchor: a step later than the max-late window, or earlier than ideal, or after a pause, anchors at now', () => {
    expect(resolveKeyboardStepAnchorMs(1151 + MAX_LATE + 1, 1000, 1000, 151, MAX_LATE)).toBe(1151 + MAX_LATE + 1);
    expect(resolveKeyboardStepAnchorMs(1100, 1000, 1000, 151, MAX_LATE)).toBe(1100);
    expect(resolveKeyboardStepAnchorMs(5000, 1000, 1000, 151, MAX_LATE)).toBe(5000);
  });

  it('anchor: the first step, a bad interval or no history anchor at now', () => {
    expect(resolveKeyboardStepAnchorMs(500, null, null, 151, MAX_LATE)).toBe(500);
    expect(resolveKeyboardStepAnchorMs(500, 400, 400, 0, MAX_LATE)).toBe(500);
    expect(resolveKeyboardStepAnchorMs(500, 400, 400, Number.NaN, MAX_LATE)).toBe(500);
  });

  it('floor base: the anchor replaces the real step time only when it is the same step and within the late window', () => {
    // Real step at 1009 (9 ms late of ideal 1000) -> floor counts from the ideal time.
    expect(resolveKeyboardStepFloorBaseMs(1009, 1000, MAX_LATE)).toBe(1000);
    // Anchor older than the real step (a different step took place since) -> real time.
    expect(resolveKeyboardStepFloorBaseMs(1009, 1010, MAX_LATE)).toBe(1009);
    // Real step far past its anchor (the anchor is stale) -> real time.
    expect(resolveKeyboardStepFloorBaseMs(1100, 1000, MAX_LATE)).toBe(1100);
    expect(resolveKeyboardStepFloorBaseMs(1009, null, MAX_LATE)).toBe(1009);
    expect(resolveKeyboardStepFloorBaseMs(null, 1000, MAX_LATE)).toBeNull();
  });

  it('a held key on a 60 Hz frame grid keeps the profile interval instead of rounding up to the next frame each step', () => {
    const interval = 151;
    const frame = 1000 / 60;
    let anchor: number | null = null;
    let last: number | null = null;
    const steps: number[] = [];
    // Each step is allowed on the first frame at or past (base + interval).
    let now = 0;
    for (let i = 0; i < 40; i += 1) {
      const base = last === null ? null : resolveKeyboardStepFloorBaseMs(last, anchor, MAX_LATE);
      const due = base === null ? now : base + interval;
      now = Math.ceil(due / frame - 1e-9) * frame;
      anchor = resolveKeyboardStepAnchorMs(now, last, anchor, interval, MAX_LATE);
      last = now;
      steps.push(now);
    }
    const period = (steps[steps.length - 1]! - steps[0]!) / (steps.length - 1);
    expect(Math.abs(period - interval)).toBeLessThan(1);
  });
});
