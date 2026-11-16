// World clock (roadmap slice H1; signed amendment A1 in docs/architecture/MAZER-HAZARD-GRAPH-CONTRACT.md,
// product contract section 2.1).
//
// One world tick lasts one player repeat interval (`repeatIntervalMs`). The clock:
//  - starts on the player's FIRST input of the level (never before: nobody is hit while reading the board);
//  - stops on pause, overlay, lifecycle hold, `visibilitychange` (hidden) and window blur;
//  - after a stop, restarts only on the NEXT input, with NO catch-up: the time spent stopped is never
//    counted, and one frame gap longer than `WORLD_CLOCK_MAX_FRAME_GAP_MS` is clamped (a stalled frame
//    cannot fast-forward the world).
//
// H1 ships the clock and the flag plumbing only. The hazard schedule is EMPTY: no hazard exists and
// nothing is drawn. The clock is created only when the hazard layer flag is on (legacyHazardLayerFlag.ts),
// so with the flag off nothing here runs and play is byte-identical.
//
// Pure and allocation-free per frame: `frame()` is a few integer operations (budget 0.05 ms per frame,
// measured in tests/legacy-runtime/legacy-world-clock.test.ts). No Phaser, no DOM globals (event targets
// are injected).

/** A single frame gap above this (ms) is treated as a stall and clamped, never caught up. */
export const WORLD_CLOCK_MAX_FRAME_GAP_MS = 250;

export type WorldClockPhase = 'idle' | 'running' | 'stopped';

export interface WorldClockSnapshot {
  readonly phase: WorldClockPhase;
  /** Whole ticks elapsed since the first input of this level. */
  readonly ticks: number;
  /** Running milliseconds toward the next tick. */
  readonly remainderMs: number;
  /** Times the clock started or restarted from an input. */
  readonly starts: number;
  /** Times the clock stopped (pause, overlay, blur, hidden, lifecycle hold). */
  readonly stops: number;
}

export interface WorldClock {
  /** A player input (key down, pointer down, move attempt). Starts or restarts the clock; no catch-up. */
  noteInput(nowMs: number): void;
  /**
   * Once per rendered frame. `active` is false while paused, in an overlay, in a lifecycle hold, hidden
   * or blurred. `tickMs` is the current repeat interval. Returns the whole ticks that elapsed this frame.
   */
  frame(nowMs: number, active: boolean, tickMs: number): number;
  /** External stop (blur, hidden). A running clock stops; an idle clock stays idle. */
  stop(): void;
  /** A new level: back to idle, zero ticks. */
  reset(): void;
  readonly ticks: number;
  readonly phase: WorldClockPhase;
  snapshot(): WorldClockSnapshot;
}

export const createWorldClock = (): WorldClock => {
  let phase: WorldClockPhase = 'idle';
  let ticks = 0;
  let remainderMs = 0;
  let lastMs = 0;
  let starts = 0;
  let stops = 0;

  const stopNow = (): void => {
    if (phase === 'running') {
      phase = 'stopped';
      stops += 1;
    }
  };

  return {
    noteInput(nowMs: number): void {
      if (phase === 'running') {
        return;
      }
      phase = 'running';
      lastMs = nowMs;
      starts += 1;
    },
    frame(nowMs: number, active: boolean, tickMs: number): number {
      if (phase !== 'running') {
        return 0;
      }
      if (!active) {
        stopNow();
        return 0;
      }
      let gap = nowMs - lastMs;
      lastMs = nowMs;
      if (!(gap > 0) || !(tickMs > 0)) {
        return 0;
      }
      if (gap > WORLD_CLOCK_MAX_FRAME_GAP_MS) {
        gap = WORLD_CLOCK_MAX_FRAME_GAP_MS;
      }
      remainderMs += gap;
      if (remainderMs < tickMs) {
        return 0;
      }
      const whole = Math.floor(remainderMs / tickMs);
      remainderMs -= whole * tickMs;
      ticks += whole;
      return whole;
    },
    stop: stopNow,
    reset(): void {
      phase = 'idle';
      ticks = 0;
      remainderMs = 0;
      lastMs = 0;
    },
    get ticks(): number {
      return ticks;
    },
    get phase(): WorldClockPhase {
      return phase;
    },
    snapshot(): WorldClockSnapshot {
      return { phase, ticks, remainderMs, starts, stops };
    }
  };
};

// The hazard schedule with the layer on in H1: nothing. Frozen so a consumer cannot grow it.
export interface EmptyHazardSchedule {
  readonly version: 1;
  readonly hazards: readonly never[];
  readonly gates: readonly never[];
  readonly sentries: readonly never[];
  readonly hunters: readonly never[];
  readonly shards: readonly never[];
}

const NONE: readonly never[] = Object.freeze([]);

export const EMPTY_HAZARD_SCHEDULE: EmptyHazardSchedule = Object.freeze({
  version: 1,
  hazards: NONE,
  gates: NONE,
  sentries: NONE,
  hunters: NONE,
  shards: NONE
});

export const resolveHazardSchedule = (_level: number | string): EmptyHazardSchedule => EMPTY_HAZARD_SCHEDULE;

interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface HazardWorldRuntimeOptions {
  /** Window-like target for `blur`. */
  readonly windowTarget?: EventTargetLike | null;
  /** Document-like target for `visibilitychange`. */
  readonly documentTarget?: EventTargetLike | null;
  /** True when the page is hidden (`document.hidden`). */
  readonly isHidden?: () => boolean;
}

export interface HazardWorldRuntime {
  readonly clock: WorldClock;
  readonly schedule: EmptyHazardSchedule;
  /** Player input (first one starts the clock). */
  noteInput(nowMs: number): void;
  /** Per frame. `playActive` is false in any overlay, hold or non-play mode. */
  frame(nowMs: number, playActive: boolean, tickMs: number): number;
  /** A new level started. */
  resetLevel(): void;
  dispose(): void;
}

/**
 * The runtime the scene owns while the layer is on: the clock, the empty schedule, and the blur and
 * visibility listeners that stop the clock on their own (so a stop never depends on the scene having
 * opened a pause overlay first).
 */
export const createHazardWorldRuntime = (options: HazardWorldRuntimeOptions = {}): HazardWorldRuntime => {
  const clock = createWorldClock();
  const onBlur = (): void => clock.stop();
  const onVisibility = (): void => {
    if (options.isHidden?.() === true) {
      clock.stop();
    }
  };
  options.windowTarget?.addEventListener('blur', onBlur);
  options.documentTarget?.addEventListener('visibilitychange', onVisibility);
  return {
    clock,
    schedule: EMPTY_HAZARD_SCHEDULE,
    noteInput: (nowMs) => clock.noteInput(nowMs),
    frame: (nowMs, playActive, tickMs) => clock.frame(nowMs, playActive, tickMs),
    resetLevel: () => clock.reset(),
    dispose(): void {
      options.windowTarget?.removeEventListener('blur', onBlur);
      options.documentTarget?.removeEventListener('visibilitychange', onVisibility);
    }
  };
};
