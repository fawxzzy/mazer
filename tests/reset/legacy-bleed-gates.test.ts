// MAZER-L10: bleed gates (Gate D "Pulse ring"). Cadence, placement (minimum path distance, never adjacent,
// off every shortest route), pass-over activation, per-attempt reset, gated wrap pricing, the draw plan and
// the menu demo routing to the gate first.
import { describe, expect, test } from 'vitest';
import { generateLadderMaze, LADDER_BOARDS } from '../../scripts/analysis/lib/progressionLadderSampling';
import {
  BLEED_GATE_CHANCE_START,
  BLEED_GATE_CHANCE_TOP,
  BLEED_GATE_FIRST_LEVEL,
  BLEED_GATE_MIN_PATH_DISTANCE,
  BLEED_GATE_MIN_PATH_DISTANCE_SHARE,
  isBleedGateLevel,
  measureBleedGateDistanceField,
  measureLegacyGatedWrapSaving,
  placeLegacyBleedGate,
  resolveBleedGateChance,
  resolveLegacyBleedGateHiddenGrid,
  resolveLegacyBleedGateRoute,
  resolveLegacyBleedGatesForLevel
} from '../../src/legacy-runtime/legacyBleedGates';
import {
  BLEED_GATE_ACTIVATE_MS,
  BLEED_GATE_ANIMATION_MS,
  bleedGateKey,
  isLegacyBleedGateAnimating,
  isLegacyBleedGateCellHidden,
  isLegacyBleedGateTriggered,
  readLegacyBleedGateRevision,
  resetLegacyBleedGates,
  resolveLegacyBleedGateAnimationState,
  resolveLegacyBleedGateBorderCells,
  resolveLegacyBleedGateViewGrid,
  syncLegacyBleedGatePassOver,
  type LegacyBleedGate
} from '../../src/legacy-runtime/legacyBleedGateState';
import { listBleedPaths } from '../../src/legacy-runtime/legacyBleedPaths';
import { resolveLegacyNavigationTarget, type LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import {
  createLegacyMenuDemoEpisodeForMaze,
  isLegacyMenuDemoGateLeg,
  readLegacyMenuDemoTrailPrefix,
  resolveLegacyMenuDemoNextLeg
} from '../../src/legacy-runtime/legacyMenuDemoBleedGates';
import {
  advanceLegacyMenuDemoFrame,
  createLegacyMenuDemoBootstrap,
  resolveLegacyMenuDemoTrail
} from '../../src/legacy-runtime/legacyMenuDemoLifecycle';
import { resolveBleedGateDrawPlan, resolveBleedGateRevealPlan, BLEED_GATE_DULL, BLEED_GATE_LIT } from '../../src/render/bleedGateRenderer';
import { drawLegacyBleedGateLayer } from '../../src/render/bleedGateSceneLayer';

// Golden ladder seeds (seed 20261106 + level), the same the ladder fingerprints use.
const SEED = 20261106;
const ladderMaze = (level: number, board: typeof LADDER_BOARDS[number]) => generateLadderMaze(level, board, SEED + level) as LegacyMazeSnapshot;
const PHONE = LADDER_BOARDS[0];
const DESKTOP = LADDER_BOARDS[1];

const gatedLadderMazes = (() => {
  const found: { level: number; board: string; maze: LegacyMazeSnapshot; gate: LegacyBleedGate }[] = [];
  for (const board of LADDER_BOARDS) {
    for (let level = BLEED_GATE_FIRST_LEVEL; level <= 60 && found.filter((entry) => entry.board === board.name).length < 6; level += 1) {
      const maze = ladderMaze(level, board);
      const gate = maze.bleedGates?.[0];
      if (gate) {
        found.push({ level, board: board.name, maze, gate });
      }
    }
  }
  return found;
})();

describe('cadence: sometimes, rising with the level', () => {
  test('no gate before the first gate level, and the chance rises from start to top', () => {
    for (let level = 1; level < BLEED_GATE_FIRST_LEVEL; level += 1) {
      expect(resolveBleedGateChance(level)).toBe(0);
      expect(isBleedGateLevel(level)).toBe(false);
    }
    expect(resolveBleedGateChance(BLEED_GATE_FIRST_LEVEL)).toBeCloseTo(BLEED_GATE_CHANCE_START);
    expect(resolveBleedGateChance(500)).toBeCloseTo(BLEED_GATE_CHANCE_TOP);
    for (let level = BLEED_GATE_FIRST_LEVEL; level < 200; level += 1) {
      expect(resolveBleedGateChance(level + 1)).toBeGreaterThanOrEqual(resolveBleedGateChance(level));
    }
  });

  test('the ladder carries no gate before the first gate level, on either board', () => {
    for (const board of LADDER_BOARDS) {
      for (let level = 1; level < BLEED_GATE_FIRST_LEVEL; level += 1) {
        expect(ladderMaze(level, board).bleedGates, `${board.name} ${level}`).toBeUndefined();
      }
    }
  });

  test('some levels ask for a gate and some do not; asking is a pure function of the level', () => {
    const early = Array.from({ length: 40 }, (_, index) => BLEED_GATE_FIRST_LEVEL + index);
    const asking = early.filter(isBleedGateLevel);
    expect(asking.length).toBeGreaterThan(4);
    expect(asking.length).toBeLessThan(early.length);
    expect(early.filter(isBleedGateLevel)).toEqual(asking);
  });

  test('gated golden-ladder levels exist on both boards (each carries one gate, 1-2 bleed paths per axis stay)', () => {
    expect(gatedLadderMazes.filter((entry) => entry.board === 'phone').length).toBeGreaterThan(0);
    expect(gatedLadderMazes.filter((entry) => entry.board === 'desktop').length).toBeGreaterThan(0);
    for (const { maze } of gatedLadderMazes) {
      expect(maze.bleedGates).toHaveLength(1);
      const paths = listBleedPaths(maze.grid);
      expect(paths.filter((path) => path.axis === 'horizontal').length).toBeLessThanOrEqual(2);
      expect(paths.filter((path) => path.axis === 'vertical').length).toBeLessThanOrEqual(2);
    }
  });
});

describe('placement: far from its path, a puzzle, deterministic', () => {
  test('the gate sits at least the minimum walking distance from its path, never adjacent, off every shortest route', () => {
    for (const { level, board, maze, gate } of gatedLadderMazes) {
      const label = `${board} ${level}`;
      const hidden = resolveLegacyBleedGateHiddenGrid(maze.grid, [gate]);
      const borders = resolveLegacyBleedGateBorderCells(gate, maze.width, maze.height);
      // Never adjacent to an opening (and never one of them).
      for (const cell of borders) {
        expect(Math.abs(cell.x - gate.x) + Math.abs(cell.y - gate.y), label).toBeGreaterThan(1);
      }
      const hiddenSteps = measureBleedGateDistanceField(hidden, [maze.start])[(maze.goal.y * maze.width) + maze.goal.x]!;
      const minimum = Math.max(BLEED_GATE_MIN_PATH_DISTANCE, Math.ceil(BLEED_GATE_MIN_PATH_DISTANCE_SHARE * hiddenSteps));
      expect(gate.pathDistance, label).toBeGreaterThanOrEqual(minimum);
      // Off every shortest route, with the path hidden and with it open (the generator's solutionPath is the
      // in-board route without wraps, so it is not the reference here).
      const gateIndex = (gate.y * maze.width) + gate.x;
      const goalIndex = (maze.goal.y * maze.width) + maze.goal.x;
      const hiddenFromGoal = measureBleedGateDistanceField(hidden, [maze.goal]);
      const hiddenFromStart = measureBleedGateDistanceField(hidden, [maze.start]);
      expect(hiddenFromStart[gateIndex]! + hiddenFromGoal[gateIndex]!, label).toBeGreaterThan(hiddenSteps);
      const openFromStart = measureBleedGateDistanceField(maze.grid, [maze.start]);
      const openFromGoal = measureBleedGateDistanceField(maze.grid, [maze.goal]);
      expect(openFromStart[gateIndex]! + openFromGoal[gateIndex]!, label).toBeGreaterThan(openFromStart[goalIndex]!);
      expect(gate.x === maze.start.x && gate.y === maze.start.y, label).toBe(false);
      expect(gate.x === maze.goal.x && gate.y === maze.goal.y, label).toBe(false);
      // Walking to the gate first pays, but less than the path would if it were open from the start.
      expect(gate.gatedSaving, label).toBeGreaterThan(0);
      expect(gate.gatedSaving, label).toBeLessThan(gate.ungatedSaving);
    }
  });

  test('the same level and seed always place the same gate', () => {
    for (const { level, board, gate } of gatedLadderMazes.slice(0, 4)) {
      const again = ladderMaze(level, board === 'phone' ? PHONE : DESKTOP);
      expect(again.bleedGates?.[0]).toEqual(gate);
    }
  });

  test('a maze with no bleed path gets no gate, and a non-gate level gets none even when placeable', () => {
    const grid = [
      [false, false, false, false, false],
      [false, true, true, true, false],
      [false, false, false, true, false],
      [false, false, false, false, false]
    ];
    const maze = { width: 5, height: 4, grid, start: { x: 1, y: 1 }, goal: { x: 3, y: 2 } };
    expect(placeLegacyBleedGate(maze)).toBeNull();
    const { maze: gated } = gatedLadderMazes[0]!;
    const quiet = Array.from({ length: 30 }, (_, index) => BLEED_GATE_FIRST_LEVEL + index).find((level) => !isBleedGateLevel(level))!;
    expect(resolveLegacyBleedGatesForLevel(quiet, gated)).toEqual([]);
  });
});

describe('activation, reset and navigation', () => {
  test('the gated path is wall and closed until the player passes over the gate, then open, and hidden again after a reset', () => {
    const { maze, gate } = gatedLadderMazes[0]!;
    const run = { ...maze, bleedGates: maze.bleedGates!.map((entry) => ({ ...entry })) };
    const live = run.bleedGates[0]!;
    const [a, b] = resolveLegacyBleedGateBorderCells(live, run.width, run.height);
    expect(isLegacyBleedGateCellHidden(run, a.x, a.y)).toBe(true);
    expect(isLegacyBleedGateCellHidden(run, b.x, b.y)).toBe(true);
    expect(resolveLegacyBleedGateViewGrid(run)[a.y]![a.x]).toBe(false);
    // Stepping from the opening's in-board neighbour onto it is refused.
    const inward = gate.axis === 'horizontal' ? { x: a.x + 1, y: a.y } : { x: a.x, y: a.y + 1 };
    const dx = a.x - inward.x;
    const dy = a.y - inward.y;
    expect(resolveLegacyNavigationTarget(run, inward, dx, dy)).toBeNull();
    // Walking near the gate does nothing; passing over it lights it (trail lookback catches a fast run).
    expect(syncLegacyBleedGatePassOver(run, run.start, [], 0)).toEqual([]);
    expect(syncLegacyBleedGatePassOver(run, { x: -5, y: -5 }, [{ x: live.x, y: live.y }, run.start], 100)).toEqual([live]);
    expect(isLegacyBleedGateTriggered(run, live)).toBe(true);
    expect(syncLegacyBleedGatePassOver(run, { x: live.x, y: live.y }, [], 200)).toEqual([]);
    expect(resolveLegacyNavigationTarget(run, inward, dx, dy)).toEqual(a);
    expect(resolveLegacyBleedGateViewGrid(run)[a.y]![a.x]).toBe(true);
    const revision = readLegacyBleedGateRevision(run);
    resetLegacyBleedGates(run);
    expect(readLegacyBleedGateRevision(run)).toBe(revision + 1);
    expect(isLegacyBleedGateTriggered(run, live)).toBe(false);
    expect(resolveLegacyNavigationTarget(run, inward, dx, dy)).toBeNull();
    // The generated maze's own state was never touched (a different gates array).
    expect(isLegacyBleedGateTriggered(maze, gate)).toBe(false);
  });

  test('a fresh maze object (new gates array) starts unlit; a spread copy shares the state', () => {
    const { maze } = gatedLadderMazes[0]!;
    const first = { ...maze, bleedGates: [...maze.bleedGates!] };
    syncLegacyBleedGatePassOver(first, first.bleedGates[0]!, [], 0);
    expect(isLegacyBleedGateTriggered({ ...first }, first.bleedGates[0]!)).toBe(true);
    expect(isLegacyBleedGateTriggered({ ...first, bleedGates: [...first.bleedGates] }, first.bleedGates[0]!)).toBe(false);
  });

  test('animation: the ring wakes over the activation, then the path draws in; reduce motion is instant', () => {
    expect(resolveLegacyBleedGateAnimationState(null, 500)).toEqual({ activation: 0, reveal: 0 });
    expect(resolveLegacyBleedGateAnimationState(0, BLEED_GATE_ACTIVATE_MS / 2)).toEqual({ activation: 0.5, reveal: 0 });
    const mid = resolveLegacyBleedGateAnimationState(0, BLEED_GATE_ACTIVATE_MS + 800);
    expect(mid.activation).toBe(1);
    expect(mid.reveal).toBeCloseTo(0.5);
    expect(resolveLegacyBleedGateAnimationState(0, BLEED_GATE_ANIMATION_MS + 1)).toEqual({ activation: 1, reveal: 1 });
    expect(resolveLegacyBleedGateAnimationState(0, 1, true)).toEqual({ activation: 1, reveal: 1 });
    const { maze } = gatedLadderMazes[0]!;
    const run = { ...maze, bleedGates: [...maze.bleedGates!] };
    expect(isLegacyBleedGateAnimating(run, 0)).toBe(false);
    syncLegacyBleedGatePassOver(run, run.bleedGates[0]!, [], 1000);
    expect(isLegacyBleedGateAnimating(run, 1500)).toBe(true);
    expect(isLegacyBleedGateAnimating(run, 1500, true)).toBe(false);
    expect(isLegacyBleedGateAnimating(run, 1000 + BLEED_GATE_ANIMATION_MS + 100)).toBe(false);
  });
});

describe('gated wrap pricing', () => {
  test('an unlit gated path is priced as unavailable until walked to; lit, it prices as an open wrap', () => {
    for (const { level, board, maze, gate } of gatedLadderMazes) {
      const label = `${board} ${level}`;
      const unlit = measureLegacyGatedWrapSaving(maze)!;
      const lit = measureLegacyGatedWrapSaving(maze, new Set([bleedGateKey(gate)]))!;
      expect(lit.saved, label).toBeGreaterThan(unlit.saved);
      expect(unlit.playableSteps, label).toBeGreaterThan(lit.playableSteps);
      // The cheapest unlit route goes through the gate.
      expect(resolveLegacyBleedGateRoute(maze)!.via, label).toEqual({ x: gate.x, y: gate.y });
    }
  });
});

describe('Pulse ring draw plan', () => {
  test('asleep: dull, still, no pulse; lit: bright, spinning, two pulse rings; reduced motion: lit but still', () => {
    const asleep = resolveBleedGateDrawPlan({ axis: 'horizontal', centerX: 50, centerY: 60, tileSize: 39, activation: 0, timeSec: 3 });
    expect(asleep.color).toBe(BLEED_GATE_DULL);
    expect(asleep.pulseRings).toEqual([]);
    expect(asleep.dashes.length).toBeGreaterThanOrEqual(4);
    expect(asleep.dashes[0]!.start).toBe(0);
    const lit = resolveBleedGateDrawPlan({ axis: 'horizontal', centerX: 50, centerY: 60, tileSize: 39, activation: 1, timeSec: 3 });
    expect(lit.color).toBe(BLEED_GATE_LIT);
    expect(lit.pulseRings).toHaveLength(2);
    expect(lit.dashes[0]!.start).not.toBe(0);
    const still = resolveBleedGateDrawPlan({ axis: 'horizontal', centerX: 50, centerY: 60, tileSize: 39, activation: 1, timeSec: 3, reducedMotion: true });
    expect(still.pulseRings).toEqual([]);
    expect(still.dashes[0]!.start).toBe(0);
  });

  test('the chevrons point along the path axis', () => {
    const row = resolveBleedGateDrawPlan({ axis: 'horizontal', centerX: 0, centerY: 0, tileSize: 39, activation: 0, timeSec: 0 });
    for (const chevron of row.chevrons) {
      expect(chevron.points[1]!.y).toBe(0);
      expect(Math.abs(chevron.points[1]!.x)).toBeGreaterThan(0);
    }
    const column = resolveBleedGateDrawPlan({ axis: 'vertical', centerX: 0, centerY: 0, tileSize: 39, activation: 0, timeSec: 0 });
    for (const chevron of column.chevrons) {
      expect(chevron.points[1]!.x).toBe(0);
    }
  });

  test('the reveal fades the cover out under a growing ring', () => {
    expect(resolveBleedGateRevealPlan(0, 39)).toEqual({ coverAlpha: 1, ring: null });
    const half = resolveBleedGateRevealPlan(0.5, 39);
    expect(half.coverAlpha).toBe(0.5);
    expect(half.ring!.radius).toBeGreaterThan(resolveBleedGateRevealPlan(0.1, 39).ring!.radius);
    expect(resolveBleedGateRevealPlan(1, 39)).toEqual({ coverAlpha: 0, ring: null });
  });

  test('the scene layer draws the gate, and covers the openings only while they draw in', () => {
    const calls: string[] = [];
    const graphics = new Proxy({}, { get: (_target, key) => (..._args: unknown[]) => { calls.push(String(key)); } }) as never;
    const { maze } = gatedLadderMazes[0]!;
    const run = { ...maze, bleedGates: [...maze.bleedGates!] };
    const input = { maze: run, mazeLeft: 0, mazeTop: 0, tileSize: 20, nowMs: 0, reducedMotion: false, fieldColor: 0 };
    expect(drawLegacyBleedGateLayer(graphics, input)).toBe(true);
    expect(calls).not.toContain('fillRect');
    syncLegacyBleedGatePassOver(run, run.bleedGates[0]!, [], 0);
    calls.length = 0;
    drawLegacyBleedGateLayer(graphics, { ...input, nowMs: BLEED_GATE_ACTIVATE_MS + 400 });
    expect(calls.filter((call) => call === 'fillRect')).toHaveLength(2);
    calls.length = 0;
    drawLegacyBleedGateLayer(graphics, { ...input, nowMs: BLEED_GATE_ANIMATION_MS + 10 });
    expect(calls).not.toContain('fillRect');
    expect(drawLegacyBleedGateLayer(graphics, { ...input, maze: { ...run, bleedGates: [] } })).toBe(false);
  });
});

describe('menu demo: the AI routes to the gate first', () => {
  test('leg 1 walks the hidden maze to the gate; leg 2 starts at the gate with the path open and carries the trail', () => {
    const { maze, gate } = gatedLadderMazes[0]!;
    const first = createLegacyMenuDemoEpisodeForMaze(maze);
    expect(isLegacyMenuDemoGateLeg(first)).toBe(true);
    const gateIndex = (gate.y * maze.width) + gate.x;
    expect(first.raster.endIndex).toBe(gateIndex);
    const firstPath = Array.from(first.raster.pathIndices);
    expect(firstPath[0]).toBe(first.raster.startIndex);
    expect(firstPath[firstPath.length - 1]).toBe(gateIndex);
    expect(resolveLegacyMenuDemoNextLeg(first, { reachedGoal: false }, [])).toBeNull();
    const walked = firstPath.map((index) => ({ x: index % maze.width, y: Math.floor(index / maze.width) }));
    const second = resolveLegacyMenuDemoNextLeg(first, { reachedGoal: true }, walked)!;
    expect(second).not.toBeNull();
    expect(isLegacyMenuDemoGateLeg(second)).toBe(false);
    expect(second.raster.startIndex).toBe(gateIndex);
    expect(second.raster.endIndex).toBe((maze.goal.y * maze.width) + maze.goal.x);
    // Leg 2 takes the opened path: one of its steps is an opening of the gated path.
    const openings = resolveLegacyBleedGateBorderCells(gate, maze.width, maze.height).map((cell) => (cell.y * maze.width) + cell.x);
    expect(Array.from(second.raster.pathIndices).some((index) => openings.includes(index))).toBe(true);
    expect(readLegacyMenuDemoTrailPrefix(second)).toEqual(walked.slice(0, -1));
  });

  test('driven frame by frame, the demo AI reaches the gate before the goal and then takes the wrap', () => {
    const { maze, gate } = gatedLadderMazes[0]!;
    const boot = createLegacyMenuDemoBootstrap(maze, false, 0);
    let { episode, state } = boot;
    let visitedGateAt = -1;
    let switchedAt = -1;
    let frame = 0;
    for (; frame < 20000 && !state.reachedGoal; frame += 1) {
      const next = advanceLegacyMenuDemoFrame(episode, state, boot.config, false, 0);
      if (next.episode) {
        episode = next.episode;
        switchedAt = frame;
      }
      state = next.state;
      if (visitedGateAt < 0 && next.player.x === gate.x && next.player.y === gate.y) {
        visitedGateAt = frame;
      }
      if (next.shouldRegenerateMaze) {
        break;
      }
    }
    expect(switchedAt).toBeGreaterThanOrEqual(0);
    expect(visitedGateAt).toBeGreaterThanOrEqual(0);
    expect(visitedGateAt).toBeLessThanOrEqual(switchedAt + 1);
    expect(episode.raster.startIndex).toBe((gate.y * maze.width) + gate.x);
    // The leg-2 trail starts with the leg-1 walk.
    const trail = resolveLegacyMenuDemoTrail(state, maze.width, false, 0, episode);
    expect(trail[0]).toEqual(maze.start);
  });

  test('a maze without a gate keeps the one-leg episode', () => {
    const maze = ladderMaze(5, PHONE);
    expect(isLegacyMenuDemoGateLeg(createLegacyMenuDemoEpisodeForMaze(maze))).toBe(false);
  });
});
