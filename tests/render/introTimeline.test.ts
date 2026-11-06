import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildLegacyMazeRevealOrder } from '../../src/legacy-runtime/legacyAnimationCadence';
import { resolveLegacyBleedOffDockVisualEligibility } from '../../src/legacy-runtime/legacyMenuRender';
import {
  INTRO_DIGIT_OUT_MS,
  INTRO_GOAL_PULSE_MS,
  INTRO_BUILD_START_MS,
  INTRO_LASER_MS,
  INTRO_POP_MS,
  INTRO_REDUCED_MOTION_MS,
  INTRO_REVEAL_MAX_MS,
  INTRO_REVEAL_MIN_MS,
  INTRO_REVEAL_TILES_PER_S,
  OUTRO_EDGE_PATHS_OFF_MS,
  OUTRO_HANDOFF_MS,
  OUTRO_LASER_MS,
  OUTRO_REMOVE_MAX_MS,
  OUTRO_REMOVE_MIN_MS,
  OUTRO_TILES_START_MS,
  isEdgePathCellShown,
  resolveIntro,
  resolveIntroDeconstruct,
  resolveIntroDoneMs,
  resolveIntroDurationMs,
  resolveIntroEdgePathsOnMs,
  resolveIntroInputUnlockMs,
  resolveIntroLaserEndMs,
  resolveIntroLaserStartMs,
  resolveIntroRevealEndMs,
  resolveIntroRevealMs,
  resolveOutroRemoveMs,
  resolveOutroTilesEndMs,
  resolveOutroTotalMs,
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
      for (let frame = 0; frame * frameMs <= 4300; frame += 1) {
        // 200 ms boundaries are shared by all three frame rates.
        const elapsed = Math.round(frame * frameMs * 1e3) / 1e3;
        if (Math.abs((elapsed / 200) - Math.round(elapsed / 200)) < 1e-4) {
          states.set(Math.round(elapsed), resolveIntro(Math.round(elapsed), options));
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
    // The nominal duration is the same number whatever the frame rate: nothing counts frames.
    expect(resolveIntroDoneMs(300)).toBe(resolveIntroLaserEndMs(300) + Math.max(INTRO_POP_MS, INTRO_GOAL_PULSE_MS));
  });

  test('a slow frame catches up: the first frame after a long stall already shows the full reveal', () => {
    const afterStall = resolveIntro(resolveIntroDoneMs(2000), { ...FULL, tileCount: 2000 });
    expect(afterStall.tilesVisible).toBe(2000);
    expect(afterStall.inputUnlocked).toBe(true);
  });

  test('reveal length is clamp(N / 70 tiles/s, 2000, 3200) ms (the audit duration model)', () => {
    expect(INTRO_REVEAL_TILES_PER_S).toBe(70);
    expect([INTRO_REVEAL_MIN_MS, INTRO_REVEAL_MAX_MS]).toEqual([2000, 3200]);
    expect([OUTRO_REMOVE_MIN_MS, OUTRO_REMOVE_MAX_MS]).toEqual([1800, 3000]);
    expect(resolveIntroRevealMs(0)).toBe(2000);
    expect(resolveIntroRevealMs(49)).toBe(2000); // Level 1: 24.5 tiles/s
    expect(resolveIntroRevealMs(166)).toBeCloseTo(2371.43, 1); // Level 5: 70 tiles/s
    expect(resolveIntroRevealMs(224)).toBeCloseTo(3200, 6);
    expect(resolveIntroRevealMs(788)).toBe(3200); // Level 20: 246 tiles/s
    expect(resolveIntroRevealMs(100000)).toBe(3200);
    expect(resolveOutroRemoveMs(49)).toBe(1800);
    expect(resolveOutroRemoveMs(166)).toBeCloseTo(2371.43, 1);
    expect(resolveOutroRemoveMs(788)).toBe(3000);
    // Monotonic in N.
    let previous = 0;
    for (let n = 0; n <= 1000; n += 7) {
      expect(resolveIntroRevealMs(n)).toBeGreaterThanOrEqual(previous);
      previous = resolveIntroRevealMs(n);
    }
  });

  test.each([49, 166, 788])('N = %i: the last tile appears exactly at the build end, linearly (not front-loaded)', (tileCount) => {
    const revealMs = resolveIntroRevealMs(tileCount);
    const revealEnd = resolveIntroRevealEndMs(tileCount);
    expect(revealEnd).toBe(INTRO_BUILD_START_MS + revealMs);
    const full = firstMs((ms) => resolveIntro(ms, { ...FULL, tileCount }).tilesVisible === tileCount, 6000);
    // The last tile shows up within one tile-interval (R / N) of the reveal end, never before.
    expect(full).toBeGreaterThanOrEqual(revealEnd - (revealMs / tileCount) - 1);
    expect(full).toBeLessThanOrEqual(Math.ceil(revealEnd));
    // Linear: tiles revealed at each quarter of the window are the matching fraction of N.
    for (const fraction of [0.25, 0.5, 0.75]) {
      const state = resolveIntro(INTRO_BUILD_START_MS + (revealMs * fraction), { ...FULL, tileCount });
      expect(Math.abs(state.tilesVisible - (tileCount * fraction))).toBeLessThanOrEqual(1.5);
    }
    // easeOutCubic would already show ~58% at 25% of the window: linear must not.
    expect(resolveIntro(INTRO_BUILD_START_MS + (revealMs * 0.1), { ...FULL, tileCount }).tilesVisible).toBeLessThanOrEqual(Math.ceil(tileCount * 0.1) + 1);
  });

  test('measured durations at the harness levels vs the audit old numbers (L1 / L5 / L20)', () => {
    const rows = [
      { level: 1, tiles: 49, oldRevealS: 2.08 },
      { level: 5, tiles: 166, oldRevealS: 2.66 },
      { level: 20, tiles: 788, oldRevealS: 3.14 }
    ];
    for (const { tiles, oldRevealS } of rows) {
      const revealS = resolveIntroRevealMs(tiles) / 1000;
      // Within ~0.4 s of the old per-tick pacing the audit measured.
      expect(Math.abs(revealS - oldRevealS)).toBeLessThan(0.4);
      expect(resolveOutroRemoveMs(tiles) / 1000).toBeGreaterThanOrEqual(1.8);
    }
  });

  test('done flips exactly once, one pop after the beams land (build end + beam flight)', () => {
    for (const tileCount of [49, 166, 788]) {
      const done = resolveIntroDoneMs(tileCount);
      expect(resolveIntro(done - 1, { ...FULL, tileCount }).done).toBe(false);
      expect(resolveIntro(done, { ...FULL, tileCount }).done).toBe(true);
      expect(resolveIntroDurationMs(false, tileCount)).toBe(done);
      expect(done).toBeLessThanOrEqual(INTRO_BUILD_START_MS + INTRO_REVEAL_MAX_MS + INTRO_LASER_MS + INTRO_POP_MS);
    }
  });

  test('tilesVisible is monotonic, bounded, starts at 0 and ends at N', () => {
    for (const tileCount of [0, 1, 45, 300, 2000]) {
      let previous = -1;
      for (let ms = 0; ms <= 4200; ms += 1) {
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

  test('the maze builds FIRST; the beams fire only after the build is complete, the player lands, and input unlocks at the landing (one clock)', () => {
    const options = { ...FULL, tileCount: 120 };
    const buildEnd = resolveIntroRevealEndMs(120);
    const laserStart = resolveIntroLaserStartMs(120);
    const laserEnd = resolveIntroLaserEndMs(120);
    expect(laserStart).toBe(buildEnd);
    expect(laserEnd).toBe(buildEnd + INTRO_LASER_MS);
    const firstTile = firstMs((ms) => resolveIntro(ms, options).tilesVisible > 0);
    const allTiles = firstMs((ms) => resolveIntro(ms, options).tilesVisible >= 120);
    const firstBeam = firstMs((ms) => resolveIntro(ms, options).laserProgress > 0);
    const laserLanded = firstMs((ms) => resolveIntro(ms, options).laserProgress >= 1);
    const unlocked = firstMs((ms) => resolveIntro(ms, options).inputUnlocked);
    // The first (spawn) tile appears when the build starts, then the maze grows to completion.
    expect(firstTile).toBe(INTRO_BUILD_START_MS);
    expect(allTiles).toBeLessThanOrEqual(Math.ceil(buildEnd));
    // No beam is in flight (and no landing pop) until the build is COMPLETE.
    expect(firstBeam).toBeGreaterThan(buildEnd);
    expect(firstBeam).toBeLessThanOrEqual(Math.ceil(buildEnd) + 20);
    expect(allTiles).toBeLessThanOrEqual(firstBeam);
    for (let ms = 0; ms <= buildEnd; ms += 1) {
      const state = resolveIntro(ms, options);
      expect(state.laserProgress, `t=${ms}`).toBe(0);
      expect(state.spawnPop, `t=${ms}`).toBe(0);
      expect(state.inputUnlocked, `t=${ms}`).toBe(false);
    }
    // The beams land after the fixed 400 ms flight; the player appears (pop starts) and input unlocks right there.
    expect(laserLanded).toBe(Math.ceil(laserEnd));
    expect(unlocked).toBe(Math.ceil(laserEnd));
    expect(resolveIntroInputUnlockMs(false, 120)).toBe(laserEnd);
    expect(resolveIntro(laserEnd - 1, options).spawnPop).toBe(0);
    expect(resolveIntro(laserEnd + 100, options).spawnPop).toBeGreaterThan(0);
    expect(resolveIntro(laserEnd - 1, options).inputUnlocked).toBe(false);
    // Total time to input unlock = build start + build + beam flight (500 + B).
    expect(unlocked).toBe(INTRO_BUILD_START_MS + resolveIntroRevealMs(120) + INTRO_LASER_MS);
    // The scene spawn-laser clock (time since the beams left) agrees on the landing.
    expect(resolveSpawnLaser(INTRO_LASER_MS - 1).markerRevealed).toBe(false);
    expect(resolveSpawnLaser(INTRO_LASER_MS).markerRevealed).toBe(true);
    // The goal pulse plays on the landing/unlock.
    expect(resolveIntro(laserEnd + 100, options).goalPulse).toBeGreaterThan(0);
    expect(resolveIntro(laserEnd - 1, options).goalPulse).toBe(0);
    // Phases run in order: digit-in -> reveal (build) -> laser -> pop -> done.
    expect(resolveIntro(0, options).phase).toBe('digit-in');
    expect(resolveIntro(INTRO_BUILD_START_MS + 1, options).phase).toBe('reveal');
    expect(resolveIntro(buildEnd + 1, options).phase).toBe('laser');
    expect(resolveIntro(laserEnd + 1, options).phase).toBe('pop');
    expect(resolveIntro(resolveIntroDoneMs(120), options).phase).toBe('done');
  });

  test.each([49, 166, 788])('N = %i: unlock = 500 + build ms (2.5-3.7 s), identical to the pre-reorder total', (tileCount) => {
    expect(resolveIntroInputUnlockMs(false, tileCount)).toBe(500 + resolveIntroRevealMs(tileCount));
    expect(resolveIntroInputUnlockMs(false, tileCount)).toBeGreaterThanOrEqual(2500);
    expect(resolveIntroInputUnlockMs(false, tileCount)).toBeLessThanOrEqual(3700);
  });

  test('laser progress is monotonic 0..1 and the digit is gone when the beam lands', () => {
    const options = { ...FULL, tileCount: 80 };
    let previous = 0;
    for (let ms = 0; ms <= resolveIntroDoneMs(80); ms += 1) {
      const { laserProgress } = resolveIntro(ms, options);
      expect(laserProgress).toBeGreaterThanOrEqual(previous);
      previous = laserProgress;
    }
    expect(previous).toBe(1);
    const revealEnd = resolveIntroRevealEndMs(80);
    // The digit holds until the last INTRO_DIGIT_OUT_MS of the reveal, then fades out by the reveal end.
    expect(resolveIntro(revealEnd - INTRO_DIGIT_OUT_MS - 1, options).digitAlpha).toBeGreaterThan(0.99);
    expect(resolveIntro(revealEnd - (INTRO_DIGIT_OUT_MS / 2), options).digitAlpha).toBeLessThan(0.99);
    expect(resolveIntro(revealEnd, options).digitAlpha).toBe(0);
    expect(resolveIntro(0, { ...options, digitAlreadyVisible: true }).digitAlpha).toBe(1);
    expect(resolveIntro(0, options).digitAlpha).toBe(0);
  });

  test('skip jumps to the final state and never moves time backwards', () => {
    const options = { ...FULL, tileCount: 500 };
    const skipped = skipIntroElapsedMs(250, { ...FULL, tileCount: 500 });
    expect(skipped).toBe(resolveIntroDoneMs(500));
    const state = resolveIntro(skipped, options);
    expect(state.done).toBe(true);
    expect(state.inputUnlocked).toBe(true);
    expect(state.tilesVisible).toBe(500);
    expect(skipIntroElapsedMs(9000, { ...FULL, tileCount: 500 })).toBe(9000);
    expect(skipIntroElapsedMs(100, { ...REDUCED, tileCount: 500 })).toBe(INTRO_REDUCED_MOTION_MS);
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
    // Reduced motion keeps the 250 ms crossfade whatever the tile count, deconstruct 150 ms.
    expect(resolveIntroInputUnlockMs(true, 5)).toBe(250);
    expect(resolveIntroInputUnlockMs(true, 5000)).toBe(250);
    expect(resolveIntroDurationMs(true, 5000)).toBe(250);
    expect(resolveIntroDeconstruct(150, { ...REDUCED, tileCount: 900 }).done).toBe(true);
    expect(resolveIntroDeconstruct(149, { ...REDUCED, tileCount: 900 }).done).toBe(false);
  });
});

describe('introTimeline edge paths are atomic (no partial bleed state)', () => {
  test('intro: bleedProgress is strictly 0 or 1 and flips once, when the reveal completes', () => {
    expect(resolveIntroEdgePathsOnMs(100)).toBe(resolveIntroRevealEndMs(100));
    let previous = 0;
    let flips = 0;
    for (let ms = 0; ms <= resolveIntroDoneMs(100) + 500; ms += 1) {
      const { bleedProgress } = resolveIntro(ms, { ...FULL, tileCount: 100 });
      expect([0, 1]).toContain(bleedProgress);
      if (bleedProgress !== previous) {
        flips += 1;
        expect(ms).toBe(Math.ceil(resolveIntroEdgePathsOnMs(100)));
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
    const OUTRO_TOTAL_MS = resolveOutroTotalMs(100);
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
    expect(OUTRO_TOTAL_MS).toBe(OUTRO_TILES_START_MS + resolveOutroRemoveMs(100) + OUTRO_HANDOFF_MS);
    // Mirror of the arrival: the player's beams go OUT first (monotonic 0..1), the
    // edge paths vanish atomically when they have landed, and only then do tiles dissolve.
    let previousBeam = 0;
    for (let ms = 0; ms <= OUTRO_TOTAL_MS; ms += 1) {
      const { laserProgress } = resolveIntroDeconstruct(ms, options);
      expect(laserProgress).toBeGreaterThanOrEqual(previousBeam);
      previousBeam = laserProgress;
    }
    expect(previousBeam).toBe(1);
    expect(resolveIntroDeconstruct(OUTRO_LASER_MS, options).laserProgress).toBe(1);
    expect(OUTRO_EDGE_PATHS_OFF_MS).toBe(OUTRO_LASER_MS);
    expect(OUTRO_TILES_START_MS).toBeGreaterThanOrEqual(OUTRO_EDGE_PATHS_OFF_MS);
    expect(resolveIntroDeconstruct(OUTRO_EDGE_PATHS_OFF_MS - 1, options).tilesVisible).toBe(100);
    expect(resolveIntroDeconstruct(5000, { ...REDUCED, tileCount: 100 }).laserProgress).toBe(0);
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
    for (let ms = 0; ms <= resolveIntroDoneMs(order.length) + 200; ms += 1) {
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
    const outroTotal = resolveOutroTotalMs(order.length);
    for (let ms = 0; ms <= outroTotal + 200; ms += 1) {
      const state = resolveIntroDeconstruct(ms, options);
      const drawn = drawnDockCells(state.tilesVisible, state.bleedProgress === 1);
      if (state.bleedProgress === 0) {
        expect(drawn).toBe(0);
      }
    }
    const end = resolveIntroDeconstruct(outroTotal, options);
    expect(end.tilesVisible).toBe(0);
    expect(drawnDockCells(end.tilesVisible, end.bleedProgress === 1)).toBe(0);
  });

  test('MenuScene wires every edge-path element to the one atomic switch (no clamped sliver, no growth length)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    // Dock strips (Chip wiring: part of the baked board, shown by the reveal mask): the margin strips are
    // erased while the group is hidden, and dock-owner border cells are hidden by the same switch.
    expect(source).toContain('docksVisible: edgeShown,');
    expect(source).toContain('if (!edgeShown && owners !== null && owners[index] === 1) {');
    // Border cells: hidden/shown with the same switch in point visibility too.
    expect(source).toContain('private isLegacyEdgePathCellShown(point: LegacyPoint): boolean {');
    expect(source).toContain('if (!this.isLegacyEdgePathCellShown(point)) {');
    // The half-grown continuation (and the 1 px clamp it fed) is gone.
    expect(source).not.toContain('resolveLegacyBleedDockGrowthProgress');
    expect(source).not.toContain('target * growthProgress');
    // The Chip dock is a short fixed-length stub (dockDefaultLengthTiles), still all-or-nothing.
    expect(source).toContain('Math.min(availableGap, tileSize * BOARD_TILE_GEOMETRY.dockDefaultLengthTiles)');
    // Driven from the timelines, never from a scene-local clock.
    expect(source).toContain('this.syncLegacyEdgePathsVisible(intro.bleedProgress === 1);');
    expect(source).toContain('this.syncLegacyEdgePathsVisible(outro.bleedProgress === 1);');
  });

  test('the edge group switches on only once the gradual reveal is complete', () => {
    for (const tileCount of [49, 166, 788]) {
      expect(resolveIntroEdgePathsOnMs(tileCount)).toBe(resolveIntroRevealEndMs(tileCount));
      expect(resolveIntro(resolveIntroEdgePathsOnMs(tileCount) - 1, { ...FULL, tileCount }).bleedProgress).toBe(0);
      expect(resolveIntro(resolveIntroEdgePathsOnMs(tileCount), { ...FULL, tileCount }).bleedProgress).toBe(1);
    }
  });
});

describe('deconstruct pacing (tiles dissolve linearly over removeMs(N))', () => {
  test.each([49, 166, 788])('N = %i: tiles start at 400 ms, are linear, and are gone at 400 + removeMs(N)', (tileCount) => {
    const options = { ...FULL, tileCount };
    const removeMs = resolveOutroRemoveMs(tileCount);
    expect(OUTRO_TILES_START_MS).toBe(OUTRO_LASER_MS);
    expect(resolveOutroTilesEndMs(tileCount)).toBe(OUTRO_TILES_START_MS + removeMs);
    expect(resolveOutroTotalMs(tileCount)).toBe(OUTRO_TILES_START_MS + removeMs + OUTRO_HANDOFF_MS);
    expect(resolveIntroDeconstruct(OUTRO_TILES_START_MS, options).tilesVisible).toBe(tileCount);
    expect(resolveIntroDeconstruct(resolveOutroTilesEndMs(tileCount), options).tilesVisible).toBe(0);
    expect(resolveIntroDeconstruct(resolveOutroTilesEndMs(tileCount), options).tilesGone).toBe(true);
    expect(resolveIntroDeconstruct(resolveOutroTilesEndMs(tileCount) - 1, options).tilesGone).toBe(false);
    for (const fraction of [0.25, 0.5, 0.75]) {
      const visible = resolveIntroDeconstruct(OUTRO_TILES_START_MS + (removeMs * fraction), options).tilesVisible;
      expect(Math.abs(visible - (tileCount * (1 - fraction)))).toBeLessThanOrEqual(1.5);
    }
    expect(resolveIntroDeconstruct(resolveOutroTotalMs(tileCount) - 1, options).done).toBe(false);
    expect(resolveIntroDeconstruct(resolveOutroTotalMs(tileCount), options).done).toBe(true);
  });
});
