import { describe, expect, test } from 'vitest';
import {
  LEGACY_BOARD_SIZE_RULE2_CAP_LEVEL,
  LEGACY_BOARD_SIZE_RULE2_CAP_SCALE,
  LEGACY_BOARD_SIZE_RULE2_MIN_TILE_PX,
  LEGACY_BOARD_SIZE_RULE2_START_SCALE,
  LEGACY_BOARD_SIZE_RULE_LATEST,
  resolveLegacyBoardScaleForLevel,
  resolveLegacyBoardScaleForLevelRule2,
  resolveLegacyBoardScaleForRule,
  resolveLegacyBoardSizeRuleSpec
} from '../../src/legacy-runtime/legacyBoardScale';
import { planLegacyBoard } from '../../src/legacy-runtime/legacyBoardPlan';
import {
  createLegacyRuntimeMazeForMode,
  resolveLegacyAdaptiveUnderTargetScale
} from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  GEOMETRY_BUDGET_FELT_REFERENCE_SCALE,
  GEOMETRY_BUDGET_FELT_SATURATION_LEVEL,
  GEOMETRY_BUDGET_MIN_STEP,
  GEOMETRY_BUDGET_WINDOW,
  resolveGeometryBudgetBoardFeltPermille,
  resolveGeometryBudgetTarget,
  scaleGeometryBudgetFelt
} from '../../src/legacy-runtime/legacyGeometryBudget';
import { measurePricedFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import {
  LEGACY_MIN_GRID_AXIS,
  normalizeGridDimension,
  normalizeLegacyMazeGenerationProfile
} from '../../src/legacy-runtime/legacyMaze';
import {
  createEmptyLegacyProgressionState,
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  resolveLegacyBoardSizeRuleForSurface,
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyProgressionScaleDetail
} from '../../src/legacy-runtime/legacyProgression';

// MAZER-UI-098 phase 2 (Zac 2026-11-19): the play board starts zoomed in and grows slowly to the demo's
// scale-88 board, reached at level 250 and held there; the whole maze is always on screen.

const baselineTrack = createEmptyLegacyProgressionState().tracks.player;
// The same coherent track the ladder test uses (target complexity follows the level).
const trackForLevel = (level: number) => ({
  ...baselineTrack,
  level: String(level),
  targetComplexity: Math.min(400, LEGACY_PROGRESSION_MIN_COMPLEXITY + ((level - 1) * 4))
});

const PHONES = [
  { name: '320x568', width: 320, height: 568 },
  { name: '360x640', width: 360, height: 640 },
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '390x844 safe', width: 390, height: 844, safeArea: { top: 47, bottom: 34 } },
  { name: '412x915', width: 412, height: 915 },
  { name: '430x932', width: 430, height: 932 }
] as const;
const DESKTOPS = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x900', width: 1440, height: 900 }
] as const;
const VIEWPORTS = [...PHONES, ...DESKTOPS];
const SAMPLE_LEVELS = [1, 2, 5, 10, 16, 20, 30, 40, 60, 80, 100, 120, 150, 180, 200, 220, 249, 250, 300, 1000];

describe('MAZER-UI-098 board size rule 2: level curve', () => {
  test('level 1 starts at scale 22, the curve rises strictly to 88 at level 250 and holds there', () => {
    expect(resolveLegacyBoardScaleForLevelRule2(1)).toBe(LEGACY_BOARD_SIZE_RULE2_START_SCALE);
    expect(LEGACY_BOARD_SIZE_RULE2_START_SCALE).toBe(22);
    let previous = 0;
    for (let level = 1; level <= LEGACY_BOARD_SIZE_RULE2_CAP_LEVEL; level += 1) {
      const scale = resolveLegacyBoardScaleForLevelRule2(level);
      expect(scale).toBeGreaterThan(previous);
      expect(scale).toBeLessThanOrEqual(LEGACY_BOARD_SIZE_RULE2_CAP_SCALE);
      previous = scale;
    }
    expect(resolveLegacyBoardScaleForLevelRule2(LEGACY_BOARD_SIZE_RULE2_CAP_LEVEL)).toBe(88);
    for (const level of [251, 400, 1000, 1e9]) {
      expect(resolveLegacyBoardScaleForLevelRule2(level)).toBe(88);
    }
    // Slow early growth: still close to the start well into the second ladder decade.
    expect(resolveLegacyBoardScaleForLevelRule2(40)).toBe(28);
    expect(resolveLegacyBoardScaleForLevelRule2(100)).toBeLessThan(34);
    expect(resolveLegacyBoardScaleForLevelRule2(200)).toBeLessThan(66);
  });

  test('garbage levels read as level 1', () => {
    for (const level of [Number.NaN, 0, -5, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
      expect(resolveLegacyBoardScaleForLevelRule2(level)).toBe(22);
    }
  });

  test('rule 1 is unchanged and stays selectable; play builds with the latest rule, the menu demo with rule 1', () => {
    for (const level of SAMPLE_LEVELS) {
      expect(resolveLegacyBoardScaleForRule(level, 1)).toBe(resolveLegacyBoardScaleForLevel(level));
      expect(resolveLegacyBoardScaleForRule(level, 2)).toBe(resolveLegacyBoardScaleForLevelRule2(level));
    }
    expect(LEGACY_BOARD_SIZE_RULE_LATEST).toBe(2);
    expect(resolveLegacyBoardSizeRuleForSurface('play')).toBe(2);
    expect(resolveLegacyBoardSizeRuleForSurface('menu')).toBe(1);
    expect(resolveLegacyBoardSizeRuleForSurface(undefined)).toBe(1);
    expect(resolveLegacyBoardSizeRuleSpec(1)).toMatchObject({ minTilePx: 10, minGridAxis: 25 });
    expect(resolveLegacyBoardSizeRuleSpec(2)).toMatchObject({
      maxScale: 88,
      minGridAxis: LEGACY_MIN_GRID_AXIS,
      minTilePx: LEGACY_BOARD_SIZE_RULE2_MIN_TILE_PX
    });
  });
});

describe('MAZER-UI-098 board size rule 2: generation', () => {
  test('only a rule-2 profile carries the 15-cell axis floor; every other board keeps 25', () => {
    expect(normalizeGridDimension(15)).toBe(25);
    expect(normalizeGridDimension(15, 15)).toBe(15);
    expect(normalizeGridDimension(18, 15)).toBe(17);
    expect(normalizeGridDimension(3, 15)).toBe(15);
    expect(normalizeGridDimension(15, 5)).toBe(15);
    const track = trackForLevel(20);
    expect(resolveLegacyMazeGenerationProfileForProgression(track).minGridAxis).toBeUndefined();
    expect(resolveLegacyMazeGenerationProfileForProgression(track, { fraction: 1, sizeRule: 1 }).minGridAxis).toBeUndefined();
    expect(resolveLegacyMazeGenerationProfileForProgression(track, { fraction: 1, sizeRule: 2 }).minGridAxis).toBe(15);
    expect(normalizeLegacyMazeGenerationProfile({ minGridAxis: 25 }).minGridAxis).toBeUndefined();
    expect(normalizeLegacyMazeGenerationProfile({ minGridAxis: 15 }).minGridAxis).toBe(15);
  });

  const buildPlayMaze = (level: number, viewport: typeof VIEWPORTS[number], seed: number) => {
    const track = trackForLevel(level);
    const detail = resolveLegacyProgressionScaleDetail(50, track, { surface: 'play', viewport });
    const plan = planLegacyBoard(viewport, detail.scale, 'play', 50, resolveLegacyBoardSizeRuleSpec(detail.sizeRule).minGridAxis);
    const maze = createLegacyRuntimeMazeForMode(
      'play',
      detail.scale,
      seed,
      resolveLegacyMazeGenerationProfileForProgression(track, { fraction: detail.fraction, sizeRule: detail.sizeRule }),
      {},
      plan.aspectRatio
    );
    return { detail, maze, plan };
  };

  test('level 1 is still the straight corridor, on a small zoomed-in 15-wide phone board', () => {
    const phone = PHONES.find((viewport) => viewport.name === '390x844')!;
    const { maze, plan } = buildPlayMaze(1, phone, 1234);
    expect(maze.width).toBe(15);
    expect(maze.width).toBe(plan.width);
    expect(maze.height).toBe(plan.height);
    expect(plan.tileSize).toBeGreaterThanOrEqual(22);
    // One straight line along the long axis, start and goal at its two ends.
    const floors = maze.grid.flat().filter(Boolean).length;
    expect(floors).toBe(maze.height - 2);
    expect(maze.start.x).toBe(maze.goal.x);
    expect(Math.abs(maze.goal.y - maze.start.y)).toBe(maze.height - 3);
  });

  test('the same level and seed build the same maze (levels 1, 50 and the cap)', () => {
    const phone = PHONES.find((viewport) => viewport.name === '390x844')!;
    for (const level of [1, 50, LEGACY_BOARD_SIZE_RULE2_CAP_LEVEL]) {
      const a = buildPlayMaze(level, phone, 9100 + level).maze;
      const b = buildPlayMaze(level, phone, 9100 + level).maze;
      expect(a.grid).toEqual(b.grid);
      expect(a.start).toEqual(b.start);
      expect(a.goal).toEqual(b.goal);
      expect(a.solutionPath).toEqual(b.solutionPath);
    }
  }, 120_000);

  test('the generator builds exactly the grid the layout planned, small early board through the cap', () => {
    const phone = PHONES.find((viewport) => viewport.name === '412x915')!;
    for (const level of [2, 30, 120, 250]) {
      const { maze, plan } = buildPlayMaze(level, phone, 4400 + level);
      expect({ width: maze.width, height: maze.height }).toEqual({ width: plan.width, height: plan.height });
    }
  }, 120_000);
});

describe('MAZER-UI-098 board size rule 2: every board fits its screen', () => {
  test('phones and desktops: tiles at least 5.5 px, board inside the viewport, never above the curve, never shrinking', () => {
    for (const viewport of VIEWPORTS) {
      let previousScale = 0;
      let smallestTile = Number.POSITIVE_INFINITY;
      for (let level = 1; level <= 300; level += 1) {
        const detail = resolveLegacyProgressionScaleDetail(50, trackForLevel(level), { surface: 'play', viewport });
        expect(detail.sizeRule).toBe(2);
        expect(detail.scale).toBeLessThanOrEqual(resolveLegacyBoardScaleForLevelRule2(level));
        expect(detail.scale).toBeGreaterThanOrEqual(previousScale);
        const plan = planLegacyBoard(viewport, detail.scale, 'play', 50, LEGACY_MIN_GRID_AXIS);
        expect(plan.tileSize).toBeGreaterThanOrEqual(LEGACY_BOARD_SIZE_RULE2_MIN_TILE_PX);
        // Whole maze on screen: the drawn board never exceeds the viewport on either axis.
        expect(plan.width * plan.tileSize).toBeLessThanOrEqual(viewport.width);
        expect(plan.height * plan.tileSize).toBeLessThanOrEqual(viewport.height);
        // Zoom goes out as the level rises. The board's aspect is read back from the layout of a rounded odd grid
        // (the same loop MenuScene runs), so one axis can trade two cells for the other between neighbouring
        // levels and the tile can step back up by one rounding (seen: 11.15 -> 11.78 px at 390x844 level 161, and
        // rule 1 does the same). Bounded here at 6%; a monotone pick of the dims belongs with the layout rework.
        expect(plan.tileSize).toBeLessThanOrEqual(smallestTile * 1.06);
        previousScale = detail.scale;
        smallestTile = Math.min(smallestTile, plan.tileSize);
      }
    }
  }, 120_000);

  // Narrower boxes that cannot hold scale 88 at 5.5 px (375x667 and below) hold their own ceiling and are
  // snapped onto the 0.25 floor lattice below it (legacyBoardPlan.ts): never above the curve, covered above.
  test('a 390 px phone, a 412 px phone and desktops get exactly the curve, including the scale-88 cap', () => {
    for (const viewport of VIEWPORTS.filter((entry) => entry.width >= 390)) {
      for (const level of SAMPLE_LEVELS) {
        const detail = resolveLegacyProgressionScaleDetail(50, trackForLevel(level), { surface: 'play', viewport });
        expect(detail.scale).toBe(resolveLegacyBoardScaleForLevelRule2(level));
      }
    }
  });
});

describe('MAZER-UI-098 board size rule 2: adaptive retry', () => {
  test('the +14% under-target retry never grows a board past the size cap', () => {
    expect(resolveLegacyAdaptiveUnderTargetScale(22)).toBe(26);
    expect(resolveLegacyAdaptiveUnderTargetScale(40)).toBe(46);
    expect(resolveLegacyAdaptiveUnderTargetScale(80)).toBe(88);
    expect(resolveLegacyAdaptiveUnderTargetScale(86)).toBe(88);
    expect(resolveLegacyAdaptiveUnderTargetScale(88)).toBe(88);
    for (let scale = 15; scale <= 88; scale += 0.5) {
      expect(resolveLegacyAdaptiveUnderTargetScale(scale)).toBeLessThanOrEqual(88);
      expect(resolveLegacyAdaptiveUnderTargetScale(scale)).toBeGreaterThanOrEqual(Math.floor(scale));
    }
  });
});

// MAZER-UI-098 board felt: the felt ladder was calibrated on scale-35-to-40 boards. Rule 2 grows the play board to
// scale 88, so past the reference scale a level's felt targets grow with the board's cells; without it floor share
// fell from 31-40 percent to 15 at level 250 (a small maze in an empty field).
describe('MAZER-UI-098 board size rule 2: board felt', () => {
  test('the felt factor is exactly 1000 up to the reference scale, then (scale / 38)^2 and nondecreasing', () => {
    expect(GEOMETRY_BUDGET_FELT_REFERENCE_SCALE).toBe(38);
    for (const scale of [0, 1, 22, 35, 37.9, 38, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveGeometryBudgetBoardFeltPermille(scale)).toBe(1000);
    }
    expect(resolveGeometryBudgetBoardFeltPermille(76)).toBe(4000);
    expect(resolveGeometryBudgetBoardFeltPermille(88)).toBe(5362);
    let previous = 1000;
    for (let level = 1; level <= 300; level += 1) {
      const permille = resolveGeometryBudgetBoardFeltPermille(resolveLegacyBoardScaleForLevelRule2(level));
      expect(permille).toBeGreaterThanOrEqual(previous);
      previous = permille;
    }
    expect(scaleGeometryBudgetFelt(901, 1000)).toBe(901);
    expect(scaleGeometryBudgetFelt(901, 999)).toBe(901);
    expect(scaleGeometryBudgetFelt(901, 5362)).toBe(4831);
  });

  test('scaled level targets still rise by at least the schedule step on every phone and desktop', () => {
    for (const viewport of VIEWPORTS) {
      let previous = 0;
      for (let level = 2; level <= GEOMETRY_BUDGET_FELT_SATURATION_LEVEL; level += 1) {
        const { scale } = resolveLegacyProgressionScaleDetail(50, trackForLevel(level), { surface: 'play', viewport });
        const target = scaleGeometryBudgetFelt(resolveGeometryBudgetTarget(level)!, resolveGeometryBudgetBoardFeltPermille(scale));
        expect(target - previous).toBeGreaterThanOrEqual(GEOMETRY_BUDGET_MIN_STEP);
        previous = target;
      }
    }
  });

  test('only a rule-2 profile scales its felt; rule 1 and the menu demo keep every target', () => {
    const track = trackForLevel(200);
    expect(resolveLegacyMazeGenerationProfileForProgression(track).feltScalesWithBoard).toBeUndefined();
    expect(resolveLegacyMazeGenerationProfileForProgression(track, { fraction: 1, sizeRule: 1 }).feltScalesWithBoard).toBeUndefined();
    expect(resolveLegacyMazeGenerationProfileForProgression(track, { fraction: 1, sizeRule: 2 }).feltScalesWithBoard).toBe(true);
    expect(normalizeLegacyMazeGenerationProfile({}).feltScalesWithBoard).toBeUndefined();
  });

  test('late boards stay filled: floor share at least 30 percent from level 160 to the cap, on the exact scaled target', () => {
    for (const viewport of VIEWPORTS.filter((entry) => ['390x844', '412x915', '1280x720'].includes(entry.name))) {
      for (const level of [160, 200, 250]) {
        const track = trackForLevel(level);
        const detail = resolveLegacyProgressionScaleDetail(50, track, { surface: 'play', viewport });
        const plan = planLegacyBoard(viewport, detail.scale, 'play', 50, resolveLegacyBoardSizeRuleSpec(detail.sizeRule).minGridAxis);
        const maze = createLegacyRuntimeMazeForMode(
          'play',
          detail.scale,
          777 + level,
          resolveLegacyMazeGenerationProfileForProgression(track, { fraction: detail.fraction, sizeRule: detail.sizeRule }),
          {},
          plan.aspectRatio
        );
        const floor = maze.grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
        expect(floor / (maze.width * maze.height)).toBeGreaterThanOrEqual(0.3);
        const target = scaleGeometryBudgetFelt(resolveGeometryBudgetTarget(level)!, resolveGeometryBudgetBoardFeltPermille(detail.scale));
        const felt = measurePricedFeltSteps(maze);
        expect(felt).toBeGreaterThanOrEqual(target);
        expect(felt).toBeLessThanOrEqual(target + GEOMETRY_BUDGET_WINDOW);
        expect(maze.generation?.selection?.selectedDistance).toBe(0);
      }
    }
  }, 120000);
});
