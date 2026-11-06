import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildLegacyMazeRevealOrder } from '../../src/legacy-runtime/legacyAnimationCadence';
import { resolveLegacyBleedOffDockVisualEligibility } from '../../src/legacy-runtime/legacyMenuRender';
import {
  INTRO_DIGIT_OUT_START_MS,
  INTRO_DONE_MS,
  INTRO_EDGE_PATHS_ON_MS,
  INTRO_INPUT_UNLOCK_MS,
  INTRO_LASER_END_MS,
  INTRO_LASER_START_MS,
  INTRO_REDUCED_MOTION_MS,
  INTRO_REVEAL_END_MS,
  INTRO_REVEAL_START_MS,
  OUTRO_EDGE_PATHS_OFF_MS,
  OUTRO_TOTAL_MS,
  isEdgePathCellShown,
  resolveIntro,
  resolveIntroDeconstruct,
  resolveIntroDurationMs,
  resolveSpawnLaser,
  skipIntroElapsedMs
} from '../../src/render/introTimeline';

const FULL = { reducedMotion: false } as const;
const REDUCED = { reducedMotion: true } as const;

const firstMs = (predicate: (ms: number) => boolean, limitMs = 5000): number => {
  for (let ms = 0; ms <= limitMs; ms += 1) {
    if (predicate(ms)) {
      return ms;
    }
  }
  return Number.POSITIVE_INFINITY;
};

describe('introTimeline (time-driven intro)', () => {
  test('is a pure function of elapsed time: sampling at 5, 30 and 120 fps gives identical state at the same instant', () => {
    const options = { ...FULL, tileCount: 300 };
    const sampleAt = (fps: number): Map<number, ReturnType<typeof resolveIntro>> => {
      const states = new Map<number, ReturnType<typeof resolveIntro>>();
      const frameMs = 1000 / fps;
      for (let frame = 0; frame * frameMs <= 2600; frame += 1) {
        // 200 ms boundaries are shared by all three frame rates.
        const elapsed = Math.round(frame * frameMs * 1e6) / 1e6;
        if (Math.abs((elapsed / 200) - Math.round(elapsed / 200)) < 1e-9) {
          states.set(Math.round(elapsed), resolveIntro(elapsed, options));
        }
      }
      return states;
    };
    const at5 = sampleAt(5);
    const at30 = sampleAt(30);
    const at120 = sampleAt(120);
    expect(at5.size).toBeGreaterThan(10);
    for (const [elapsed, state] of at5) {
      expect(at30.get(elapsed)).toEqual(state);
      expect(at120.get(elapsed)).toEqual(state);
    }
    // No hidden state: asking out of order cannot change an answer.
    const late = resolveIntro(1200, options);
    resolveIntro(50, options);
    expect(resolveIntro(1200, options)).toEqual(late);
  });

  test('a slow frame catches up: the first frame after a long stall already shows the full reveal', () => {
    const afterStall = resolveIntro(1500, { ...FULL, tileCount: 2000 });
    expect(afterStall.tilesVisible).toBe(2000);
    expect(afterStall.inputUnlocked).toBe(true);
  });

  test.each([45, 300, 2000])('reveal duration is constant for N = %i tiles', (tileCount) => {
    const full = firstMs((ms) => resolveIntro(ms, { ...FULL, tileCount }).tilesVisible === tileCount);
    expect(full).toBeGreaterThanOrEqual(INTRO_REVEAL_START_MS);
    expect(full).toBeLessThanOrEqual(INTRO_REVEAL_END_MS);
    const half = firstMs((ms) => resolveIntro(ms, { ...FULL, tileCount }).tilesVisible >= tileCount / 2);
    const reference = firstMs((ms) => resolveIntro(ms, { ...FULL, tileCount: 45 }).tilesVisible >= 45 / 2);
    expect(Math.abs(half - reference)).toBeLessThanOrEqual(6);
    expect(full).toBeGreaterThan(half);
  });

  test('total duration stays within the 2.5 s cap and done flips exactly once', () => {
    expect(INTRO_DONE_MS).toBeLessThanOrEqual(2500);
    expect(resolveIntro(INTRO_DONE_MS - 1, { ...FULL, tileCount: 100 }).done).toBe(false);
    expect(resolveIntro(INTRO_DONE_MS, { ...FULL, tileCount: 100 }).done).toBe(true);
    expect(resolveIntroDurationMs(false)).toBe(INTRO_DONE_MS);
  });

  test('tilesVisible is monotonic, bounded, starts at 0 and ends at N', () => {
    for (const tileCount of [0, 1, 45, 300, 2000]) {
      let previous = -1;
      for (let ms = 0; ms <= 2600; ms += 1) {
        const { tilesVisible } = resolveIntro(ms, { ...FULL, tileCount });
        expect(tilesVisible).toBeGreaterThanOrEqual(previous);
        expect(tilesVisible).toBeLessThanOrEqual(tileCount);
        previous = tilesVisible;
      }
      expect(resolveIntro(0, { ...FULL, tileCount }).tilesVisible).toBe(0);
      expect(previous).toBe(tileCount);
    }
  });

  test('negative or non-finite elapsed time is clamped to the opening state', () => {
    expect(resolveIntro(-500, { ...FULL, tileCount: 50 })).toEqual(resolveIntro(0, { ...FULL, tileCount: 50 }));
    expect(resolveIntro(Number.NaN, { ...FULL, tileCount: 50 }).tilesVisible).toBe(0);
  });

  test('input unlock is tied to the laser end: same instant, same clock', () => {
    const options = { ...FULL, tileCount: 120 };
    const laserLanded = firstMs((ms) => resolveIntro(ms, options).laserProgress >= 1);
    const unlocked = firstMs((ms) => resolveIntro(ms, options).inputUnlocked);
    expect(laserLanded).toBe(INTRO_LASER_END_MS);
    expect(unlocked).toBe(laserLanded);
    expect(INTRO_INPUT_UNLOCK_MS).toBe(INTRO_LASER_END_MS);
    // The scene's spawn-laser clock (time since the beam left) agrees.
    expect(resolveSpawnLaser(INTRO_LASER_END_MS - INTRO_LASER_START_MS - 1).markerRevealed).toBe(false);
    expect(resolveSpawnLaser(INTRO_LASER_END_MS - INTRO_LASER_START_MS).markerRevealed).toBe(true);
    // The laser never leaves before the reveal started and the pop follows the landing.
    expect(INTRO_LASER_START_MS).toBeGreaterThan(INTRO_REVEAL_START_MS);
    expect(resolveIntro(INTRO_LASER_END_MS - 1, options).spawnPop).toBe(0);
    expect(resolveIntro(INTRO_LASER_END_MS + 100, options).spawnPop).toBeGreaterThan(0);
    expect(resolveIntro(INTRO_LASER_END_MS + 100, options).goalPulse).toBeGreaterThan(0);
  });

  test('laser progress is monotonic 0..1 and the digit is gone when the beam lands', () => {
    const options = { ...FULL, tileCount: 80 };
    let previous = 0;
    for (let ms = 0; ms <= INTRO_DONE_MS; ms += 1) {
      const { laserProgress } = resolveIntro(ms, options);
      expect(laserProgress).toBeGreaterThanOrEqual(previous);
      previous = laserProgress;
    }
    expect(previous).toBe(1);
    expect(resolveIntro(INTRO_DIGIT_OUT_START_MS - 1, options).digitAlpha).toBeGreaterThan(0.99);
    expect(resolveIntro(INTRO_INPUT_UNLOCK_MS, options).digitAlpha).toBe(0);
    expect(resolveIntro(0, { ...options, digitAlreadyVisible: true }).digitAlpha).toBe(1);
    expect(resolveIntro(0, options).digitAlpha).toBe(0);
  });

  test('skip jumps to the final state and never moves time backwards', () => {
    const options = { ...FULL, tileCount: 500 };
    const skipped = skipIntroElapsedMs(250, FULL);
    expect(skipped).toBe(INTRO_DONE_MS);
    const state = resolveIntro(skipped, options);
    expect(state.done).toBe(true);
    expect(state.inputUnlocked).toBe(true);
    expect(state.tilesVisible).toBe(500);
    expect(skipIntroElapsedMs(9000, FULL)).toBe(9000);
    expect(skipIntroElapsedMs(100, REDUCED)).toBe(INTRO_REDUCED_MOTION_MS);
  });

  test('reduced motion: ~250 ms crossfade, no laser, no sparkles, unlock at 250', () => {
    const options = { ...REDUCED, tileCount: 200 };
    expect(INTRO_REDUCED_MOTION_MS).toBeLessThanOrEqual(300);
    let previousDigit = 1;
    let previousBoard = 0;
    for (let ms = 0; ms <= 600; ms += 1) {
      const state = resolveIntro(ms, options);
      expect(state.laserProgress).toBe(0);
      expect(state.spawnPop).toBe(0);
      expect(state.goalPulse).toBe(0);
      expect(state.digitAlpha).toBeLessThanOrEqual(previousDigit);
      expect(state.boardAlpha).toBeGreaterThanOrEqual(previousBoard);
      previousDigit = state.digitAlpha;
      previousBoard = state.boardAlpha;
      expect(state.inputUnlocked).toBe(ms >= INTRO_REDUCED_MOTION_MS);
      expect(state.done).toBe(ms >= INTRO_REDUCED_MOTION_MS);
      if (ms > 0) {
        expect(state.tilesVisible).toBe(200);
      }
    }
    expect(resolveIntro(INTRO_REDUCED_MOTION_MS, options).digitAlpha).toBe(0);
    expect(resolveIntro(INTRO_REDUCED_MOTION_MS, options).boardAlpha).toBe(1);
  });
});

describe('introTimeline edge paths are atomic (no partial bleed state)', () => {
  test('intro: bleedProgress is strictly 0 or 1, flips once, before the laser leaves', () => {
    expect(INTRO_EDGE_PATHS_ON_MS).toBeLessThanOrEqual(INTRO_LASER_START_MS);
    let previous = 0;
    let flips = 0;
    for (let ms = 0; ms <= INTRO_DONE_MS + 500; ms += 1) {
      const { bleedProgress } = resolveIntro(ms, { ...FULL, tileCount: 100 });
      expect([0, 1]).toContain(bleedProgress);
      if (bleedProgress !== previous) {
        flips += 1;
        expect(ms).toBe(INTRO_EDGE_PATHS_ON_MS);
      }
      previous = bleedProgress;
    }
    expect(flips).toBe(1);
    expect(previous).toBe(1);
  });

  test('deconstruct: bleedProgress is strictly 1 then 0, flips once, and the end state is fully empty', () => {
    const options = { ...FULL, tileCount: 100 };
    let previous = 1;
    let flips = 0;
    let previousTiles = Number.POSITIVE_INFINITY;
    for (let ms = 0; ms <= OUTRO_TOTAL_MS + 400; ms += 1) {
      const state = resolveIntroDeconstruct(ms, options);
      expect([0, 1]).toContain(state.bleedProgress);
      if (state.bleedProgress !== previous) {
        flips += 1;
        expect(ms).toBe(OUTRO_EDGE_PATHS_OFF_MS);
      }
      previous = state.bleedProgress;
      expect(state.tilesVisible).toBeLessThanOrEqual(previousTiles);
      previousTiles = state.tilesVisible;
    }
    expect(flips).toBe(1);
    const end = resolveIntroDeconstruct(OUTRO_TOTAL_MS, options);
    expect(OUTRO_TOTAL_MS).toBeLessThanOrEqual(900);
    expect(end).toMatchObject({ bleedProgress: 0, done: true, playerAlpha: 0, tilesVisible: 0, trailAlpha: 0 });
    expect(resolveIntroDeconstruct(0, options).tilesVisible).toBe(100);
  });

  test('isEdgePathCellShown hides dock-owning cells exactly while the edge group is hidden', () => {
    expect(isEdgePathCellShown(false, true)).toBe(false);
    expect(isEdgePathCellShown(true, true)).toBe(true);
    expect(isEdgePathCellShown(false, false)).toBe(true);
    expect(isEdgePathCellShown(true, false)).toBe(true);
  });

  test('replaying the real reveal order: dock cells are drawn all together or not at all, and none remain after deconstruct', () => {
    // 9x9 open interior with two wrap pairs on the border.
    const size = 9;
    const grid = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => (
      (x >= 1 && x <= size - 2 && y >= 1 && y <= size - 2)
      || ((y === 4) && (x === 0 || x === size - 1))
      || ((x === 4) && (y === 0 || y === size - 1))
    )));
    const maze = {
      grid,
      height: size,
      start: { x: 4, y: 4 },
      width: size
    };
    const dockCells = [...resolveLegacyBleedOffDockVisualEligibility(maze)];
    expect(dockCells.sort()).toEqual(['0,4', '4,0', '4,8', '8,4']);
    const order = buildLegacyMazeRevealOrder(maze as never);
    const key = (point: { x: number; y: number }): string => `${point.x},${point.y}`;
    const drawnDockCells = (tilesVisible: number, edgeVisible: boolean): number => (
      order.slice(0, tilesVisible).filter((point) => (
        dockCells.includes(key(point)) && isEdgePathCellShown(edgeVisible, true)
      )).length
    );

    const options = { ...FULL, tileCount: order.length };
    for (let ms = 0; ms <= INTRO_DONE_MS + 200; ms += 1) {
      const state = resolveIntro(ms, options);
      const drawn = drawnDockCells(state.tilesVisible, state.bleedProgress === 1);
      // All four dock cells appear in the same millisecond, never one by one:
      // the group switches on only once the whole reveal is complete.
      expect([0, dockCells.length]).toContain(drawn);
      if (state.bleedProgress === 1) {
        expect(state.tilesVisible).toBe(order.length);
        expect(drawn).toBe(dockCells.length);
      } else {
        expect(drawn).toBe(0);
      }
    }
    for (let ms = 0; ms <= OUTRO_TOTAL_MS + 200; ms += 1) {
      const state = resolveIntroDeconstruct(ms, options);
      const drawn = drawnDockCells(state.tilesVisible, state.bleedProgress === 1);
      if (state.bleedProgress === 0) {
        expect(drawn).toBe(0);
      }
    }
    const end = resolveIntroDeconstruct(OUTRO_TOTAL_MS, options);
    expect(end.tilesVisible).toBe(0);
    expect(drawnDockCells(end.tilesVisible, end.bleedProgress === 1)).toBe(0);
  });

  test('MenuScene wires every edge-path element to the one atomic switch (no clamped sliver, no growth length)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    // Dock strips: not drawn at all while the group is hidden.
    expect(source).toContain('if (!this.legacyEdgePathsVisible) {');
    // Border cells: hidden/shown with the same switch, in both draw paths and in point visibility.
    expect(source).toContain('private isLegacyEdgePathCellShown(point: LegacyPoint): boolean {');
    expect(source).toContain('if (!this.isLegacyEdgePathCellShown(point)) {');
    // The half-grown continuation (and the 1 px clamp it fed) is gone.
    expect(source).not.toContain('resolveLegacyBleedDockGrowthProgress');
    expect(source).not.toContain('target * growthProgress');
    expect(source).toContain('const resolveContinuation = (availableGap: number): number => Math.max(2, availableGap);');
    // Driven from the timelines, never from a scene-local clock.
    expect(source).toContain('this.syncLegacyEdgePathsVisible(intro.bleedProgress === 1);');
    expect(source).toContain('this.syncLegacyEdgePathsVisible(outro.bleedProgress === 1);');
  });

  test('the edge group switches on only once the gradual reveal is complete', () => {
    expect(INTRO_EDGE_PATHS_ON_MS).toBe(INTRO_REVEAL_END_MS);
  });
});
