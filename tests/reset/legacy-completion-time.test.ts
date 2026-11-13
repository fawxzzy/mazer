import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_COMPLETION_TIME_CAP_SECONDS,
  LEGACY_COMPLETION_TIME_LABEL,
  LEGACY_COMPLETION_TIME_LINE_MAX_CHARS,
  captureLegacyCompletionTimeMs,
  formatLegacyCompletionTime,
  formatLegacyCompletionTimeLine,
  resolveLegacyCompletionTimeLine,
  resolveLegacyCompletionTimeLineLayout,
  shouldRetainLegacyCompletionTime
} from '../../src/legacy-runtime/legacyCompletionTime';
import { resolveLegacyFrozenElapsedMs } from '../../src/legacy-runtime/legacyPlayHud';
import {
  INITIAL_LEGACY_PAGE_VISIBILITY_STATE,
  consumeLegacyResumeFrame,
  reduceLegacyPageVisibilityOnLeave,
  reduceLegacyPageVisibilityOnReturn,
  resolveLegacyLifecycleHoldMs,
  type LegacyPageVisibilityState
} from '../../src/legacy-runtime/legacyLifecycleHold';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n?/g, '\n');

describe('formatting', () => {
  test('MM:SS with whole seconds rounded down', () => {
    expect(formatLegacyCompletionTime(0)).toBe('00:00');
    expect(formatLegacyCompletionTime(999)).toBe('00:00');
    expect(formatLegacyCompletionTime(1000)).toBe('00:01');
    expect(formatLegacyCompletionTime(59_999)).toBe('00:59');
    expect(formatLegacyCompletionTime(60_000)).toBe('01:00');
    expect(formatLegacyCompletionTime(83_400)).toBe('01:23');
    expect(formatLegacyCompletionTime(((59 * 60) + 59) * 1000)).toBe('59:59');
  });

  test('caps at 99:59 and never goes negative or non-numeric', () => {
    expect(LEGACY_COMPLETION_TIME_CAP_SECONDS).toBe(5999);
    expect(formatLegacyCompletionTime(5_999_000)).toBe('99:59');
    expect(formatLegacyCompletionTime(6_000_000)).toBe('99:59');
    expect(formatLegacyCompletionTime(Number.MAX_SAFE_INTEGER)).toBe('99:59');
    expect(formatLegacyCompletionTime(Number.POSITIVE_INFINITY)).toBe('00:00');
    expect(formatLegacyCompletionTime(-5000)).toBe('00:00');
    expect(formatLegacyCompletionTime(Number.NaN)).toBe('00:00');
  });

  test('the line reads "Completion Time: MM:SS" and has a fixed maximum width', () => {
    expect(LEGACY_COMPLETION_TIME_LABEL).toBe('Completion Time');
    expect(formatLegacyCompletionTimeLine(83_400)).toBe('Completion Time: 01:23');
    expect(formatLegacyCompletionTimeLine(0)).toBe('Completion Time: 00:00');
    expect(formatLegacyCompletionTimeLine(Number.MAX_SAFE_INTEGER).length).toBe(LEGACY_COMPLETION_TIME_LINE_MAX_CHARS);
    expect(formatLegacyCompletionTimeLine(1).length).toBe(LEGACY_COMPLETION_TIME_LINE_MAX_CHARS);
  });
});

describe('what is worth showing', () => {
  test('captures only real, positive, finite values and clamps giant ones', () => {
    expect(captureLegacyCompletionTimeMs(12_345)).toBe(12_345);
    expect(captureLegacyCompletionTimeMs(0)).toBeNull();
    expect(captureLegacyCompletionTimeMs(-1)).toBeNull();
    expect(captureLegacyCompletionTimeMs(Number.NaN)).toBeNull();
    expect(captureLegacyCompletionTimeMs(Number.POSITIVE_INFINITY)).toBeNull();
    expect(captureLegacyCompletionTimeMs('12')).toBeNull();
    expect(captureLegacyCompletionTimeMs(undefined)).toBeNull();
    expect(captureLegacyCompletionTimeMs(1e12)).toBe(6_000_000 - 1);
  });

  test('only Play mode shows a line, and only when a run was timed (level 1 intro and menu show none)', () => {
    expect(resolveLegacyCompletionTimeLine({ completedMs: 83_400, mode: 'play' })).toBe('Completion Time: 01:23');
    expect(resolveLegacyCompletionTimeLine({ completedMs: null, mode: 'play' })).toBeNull();
    expect(resolveLegacyCompletionTimeLine({ completedMs: 0, mode: 'play' })).toBeNull();
    expect(resolveLegacyCompletionTimeLine({ completedMs: 83_400, mode: 'menu' })).toBeNull();
  });

  test('the remembered time is dropped on leaving Play or once the next run starts moving', () => {
    expect(shouldRetainLegacyCompletionTime({ mode: 'play', nextRunStarted: false })).toBe(true);
    expect(shouldRetainLegacyCompletionTime({ mode: 'play', nextRunStarted: true })).toBe(false);
    expect(shouldRetainLegacyCompletionTime({ mode: 'menu', nextRunStarted: false })).toBe(false);
  });
});

describe('layout', () => {
  test('sits above the number, whole pixels, and fits the phone and the desktop width', () => {
    const phone = resolveLegacyCompletionTimeLineLayout({ numberCenterY: 422, numberHeight: 49, viewportHeight: 844, viewportWidth: 390 });
    expect(phone.fontPx).toBe(14);
    expect(phone.bottomY).toBe(387);
    expect(phone.centerX).toBe(195);
    expect(Number.isInteger(phone.bottomY) && Number.isInteger(phone.fontPx) && Number.isInteger(phone.centerX)).toBe(true);
    // 22 monospace chars at ~0.62 em must stay inside the viewport.
    expect(phone.fontPx * LEGACY_COMPLETION_TIME_LINE_MAX_CHARS * 0.62).toBeLessThan(390);

    const desktop = resolveLegacyCompletionTimeLineLayout({ numberCenterY: 360, numberHeight: 91, viewportHeight: 720, viewportWidth: 1280 });
    expect(desktop.fontPx).toBe(26);
    expect(desktop.bottomY).toBeLessThan(360 - 91 / 2);
  });

  test('shrinks on a very narrow viewport instead of overflowing', () => {
    const narrow = resolveLegacyCompletionTimeLineLayout({ numberCenterY: 300, numberHeight: 40, viewportHeight: 600, viewportWidth: 240 });
    expect(narrow.fontPx * LEGACY_COMPLETION_TIME_LINE_MAX_CHARS * 0.62).toBeLessThanOrEqual(240);
    expect(narrow.fontPx).toBeGreaterThanOrEqual(10);
  });
});

/**
 * A fake of the scene's run timer: the SAME anchors, the SAME hold functions and the SAME elapsed
 * function MenuScene uses (`holdLegacyPlayMazeLifecycleDuringPause`, `resolveLegacyFrozenElapsedMs`).
 * The clock is a plain number the test advances, like Phaser's monotonic `time.now`.
 */
class FakeRun {
  nowMs = 100_000;
  startedAtMs = 100_000;
  completedAtMs: number | null = null;
  overlay = 'none';
  visibility: LegacyPageVisibilityState = INITIAL_LEGACY_PAGE_VISIBILITY_STATE;

  /** One engine frame: the clock advances, then the scene's hold moves the anchors. */
  frame(deltaMs: number): void {
    this.nowMs += deltaMs;
    const hold = resolveLegacyLifecycleHoldMs({
      frameDeltaMs: deltaMs,
      mode: 'play',
      overlay: this.overlay,
      pageVisibility: this.visibility
    });
    this.visibility = consumeLegacyResumeFrame(this.visibility);
    if (hold > 0) {
      this.startedAtMs += hold;
      if (this.completedAtMs !== null) {
        this.completedAtMs += hold;
      }
    }
  }

  advance(totalMs: number, stepMs = 16): void {
    for (let left = totalMs; left > 0; left -= stepMs) {
      this.frame(Math.min(stepMs, left));
    }
  }

  hide(): void {
    this.visibility = reduceLegacyPageVisibilityOnLeave(this.visibility, 'visibility-hidden');
  }

  show(): void {
    this.visibility = reduceLegacyPageVisibilityOnReturn(this.visibility, 'visibility-visible');
  }

  reachGoal(): number | null {
    this.completedAtMs ??= this.nowMs;
    return captureLegacyCompletionTimeMs(resolveLegacyFrozenElapsedMs({
      completedAtMs: this.completedAtMs,
      nowMs: this.nowMs,
      startedAtMs: this.startedAtMs
    }));
  }
}

describe('the run timer feeding the line (fake clock)', () => {
  test('counts from the start anchor to the goal tile', () => {
    const run = new FakeRun();
    run.advance(12_000);
    expect(run.reachGoal()).toBe(12_000);
  });

  test('time before the start anchor (the intro and build) is not counted', () => {
    const run = new FakeRun();
    run.nowMs = 90_000; // intro and build ran from here; the settle sets the anchor to now
    run.startedAtMs = 95_000;
    run.nowMs = 95_000;
    run.advance(7_000);
    expect(run.reachGoal()).toBe(7_000);
  });

  test('an open settings or pause sheet stops the clock', () => {
    const run = new FakeRun();
    run.advance(5_000);
    run.overlay = 'pause';
    run.advance(30_000);
    run.overlay = 'none';
    run.advance(4_000);
    expect(run.reachGoal()).toBe(9_000);
  });

  test('a backgrounded page (hidden gap delivered as one huge resume frame) does not count', () => {
    const run = new FakeRun();
    run.advance(6_000);
    run.hide();
    run.frame(16);
    run.show();
    run.frame(600_000); // ten minutes away, delivered as the resume frame's delta
    run.advance(3_000);
    expect(run.reachGoal()).toBe(9_000);
  });

  test('is never negative or giant across a long hold, and the value is stable after the goal', () => {
    const run = new FakeRun();
    run.advance(1_000);
    const first = run.reachGoal();
    run.overlay = 'confirm-quit';
    run.advance(120_000);
    run.overlay = 'none';
    run.advance(60_000);
    expect(first).toBe(1_000);
    const stored = first as number;
    expect(stored).toBeGreaterThan(0);
    expect(stored).toBeLessThan(6_000_000);
    // The recorded value does not change however long the announcer holds (it is captured once).
    expect(captureLegacyCompletionTimeMs(stored)).toBe(1_000);
  });

  test('a restart re-anchors the timer, so the time shown is the attempt that reached the goal', () => {
    const run = new FakeRun();
    run.advance(20_000);
    run.startedAtMs = run.nowMs; // applyLegacyPauseCommand restart: playStartedAtMs = time.now
    run.completedAtMs = null;
    run.advance(8_000);
    expect(run.reachGoal()).toBe(8_000);
  });

  test('a goal reached with the timer never running gives no line instead of 00:00', () => {
    const run = new FakeRun();
    expect(run.reachGoal()).toBeNull();
  });
});

describe('scene wiring (source contract; the scene is Wave 5C so the diff stays small)', () => {
  const scene = read('src/scenes/MenuScene.ts');

  test('the line is captured from the existing run timer at the goal move, once', () => {
    expect(scene).toContain('captureLegacyCompletionTimeMs(');
    expect(scene).toMatch(/const firstGoalArrival = this\.playCompletedAtMs === null;[\s\S]{0,400}this\.playCompletedAtMs \?\?= this\.time\.now;/);
  });

  test('the line is never persisted, sent or put in a receipt', () => {
    const module = read('src/legacy-runtime/legacyCompletionTime.ts');
    expect(module).not.toMatch(/localStorage|sessionStorage|fetch\(|supabase|navigator\.|recordMazeCycle|performance\.now|Date\.now/);
    const store = read('src/legacy-runtime/mazeCycleTelemetry.ts');
    expect(store).not.toMatch(/legacyCompletionTime|lastCompletedRunMs/);
  });
});
