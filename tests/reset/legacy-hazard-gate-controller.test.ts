import { describe, expect, test } from 'vitest';
import {
  createLegacyHazardGateController,
  hasLegacyPlayerMetPulseGates,
  parseLegacyHazardLevel,
  resolveLegacyHazardStepDelta
} from '../../src/legacy-runtime/legacyHazardGateController';
import { resolveLegacyNavigationTarget } from '../../src/legacy-runtime/legacyMaze';
import type { TimedGateSpec } from '../../src/mazer-core/hazards/graphContract';
import { findGateFixture } from './legacy-hazard-gate-fixture';

// Slice H3 (HAZ-004): Pulse Gate rules on real ladder mazes with their real overlay.

const gateSpecs = (specs: readonly { kind: string }[]): TimedGateSpec[] => (
  specs.filter((spec) => spec.kind === 'timedGate') as TimedGateSpec[]
);

describe('Pulse Gate controller (slice H3)', () => {
  test('small helpers: level parse, "met gates" rule, one-cell step delta', () => {
    expect(parseLegacyHazardLevel('12')).toBe(12);
    expect(parseLegacyHazardLevel('nope')).toBe(1);
    expect(parseLegacyHazardLevel(0)).toBe(1);
    expect(parseLegacyHazardLevel(7.9)).toBe(7);
    expect(hasLegacyPlayerMetPulseGates(10)).toBe(false);
    expect(hasLegacyPlayerMetPulseGates(11)).toBe(true);
    expect(hasLegacyPlayerMetPulseGates(Number.NaN)).toBe(false);
    const { maze } = findGateFixture();
    const start = maze.start;
    const neighbour = [[0, -1], [-1, 0], [0, 1], [1, 0]]
      .map(([dx, dy]) => resolveLegacyNavigationTarget(maze, start, dx!, dy!))
      .find((cell) => cell !== null) ?? null;
    if (neighbour) {
      expect(resolveLegacyHazardStepDelta(maze, start, neighbour)).not.toBeNull();
    }
    expect(resolveLegacyHazardStepDelta(maze, start, start)).toBeNull();
  });

  test('play install loads every Pulse Gate with the open/closed rule of the graph contract', () => {
    const { maze, overlay, level } = findGateFixture();
    const controller = createLegacyHazardGateController();
    const result = controller.install(maze, { mode: 'play', level, playerLevel: level });
    const specs = gateSpecs(overlay.specs);
    expect(result.overlaySource).toBe('main-thread');
    expect(result.gateCount).toBe(specs.length);
    expect(controller.mode).toBe('play');
    expect(controller.boardWidth).toBe(maze.grid[0]!.length);
    expect(controller.boardHeight).toBe(maze.grid.length);
    const width = maze.grid[0]!.length;
    specs.forEach((spec, index) => {
      expect(controller.gateX(index)).toBe(spec.cell % width);
      expect(controller.gateY(index)).toBe(Math.floor(spec.cell / width));
      for (let tick = -3; tick < spec.period * 3; tick += 1) {
        const q = (((tick - spec.openFrom) % spec.period) + spec.period) % spec.period;
        expect(controller.isOpenAt(index, tick)).toBe(q < spec.openFor);
        expect(controller.isBlockedAt(controller.gateX(index), controller.gateY(index), tick)).toBe(q >= spec.openFor);
      }
    });
    // Off-board and non-gate cells are never blocked.
    expect(controller.isBlockedAt(-1, 0, 0)).toBe(false);
    expect(controller.isBlockedAt(maze.start.x, maze.start.y, 0)).toBe(false);
  });

  test('arrival-tick legality: a step at tick t is refused when the gate is closed at t + 1', () => {
    const { maze, level } = findGateFixture();
    const controller = createLegacyHazardGateController();
    controller.install(maze, { mode: 'play', level, playerLevel: level });
    const gate = { x: controller.gateX(0), y: controller.gateY(0) };
    let checked = 0;
    for (let tick = 0; tick < 40; tick += 1) {
      const closedNext = !controller.isOpenAt(0, tick + 1);
      expect(controller.isArrivalBlocked(gate, tick)).toBe(closedNext);
      checked += closedNext ? 1 : 0;
    }
    expect(checked).toBeGreaterThan(0);
    expect(controller.arrivalBlocks).toBe(checked);
  });

  test('the stored witness obeys the arrival rule under the controller and is never ejected', () => {
    const { maze, overlay, level } = findGateFixture(10, undefined, { needWait: true });
    const controller = createLegacyHazardGateController();
    controller.install(maze, { mode: 'play', level, playerLevel: level });
    const witness = overlay.verdict!.witness!;
    const width = maze.grid[0]!.length;
    const at = (cell: number) => ({ x: cell % width, y: Math.floor(cell / width) });
    for (let index = 0; index < witness.ticks; index += 1) {
      const tick = witness.startTick + index;
      const from = witness.cells[index]!;
      const to = witness.cells[index + 1]!;
      if (from !== to) {
        expect(controller.isArrivalBlocked(at(to), tick), `step ${index}`).toBe(false);
        expect(resolveLegacyHazardStepDelta(maze, at(from), at(to)), `step ${index}`).not.toBeNull();
      }
      expect(controller.resolveEjectStep(maze, at(to), [], tick + 1), `eject ${index}`).toBeNull();
    }
    expect(at(witness.cells[witness.ticks]!)).toEqual({ x: maze.goal.x, y: maze.goal.y });
    expect(controller.arrivalBlocks).toBe(0);
  });

  test('eject (A3) steps back along the trail, else to the first open neighbour', () => {
    const { maze, level } = findGateFixture();
    const controller = createLegacyHazardGateController();
    controller.install(maze, { mode: 'play', level, playerLevel: level });
    const gate = { x: controller.gateX(0), y: controller.gateY(0) };
    let closedTick = 0;
    while (controller.isOpenAt(0, closedTick)) { closedTick += 1; }
    let openTick = 0;
    while (!controller.isOpenAt(0, openTick)) { openTick += 1; }
    expect(controller.resolveEjectStep(maze, gate, [], openTick)).toBeNull();
    const neighbours = [[0, -1], [-1, 0], [0, 1], [1, 0]]
      .map(([dx, dy]) => ({ dx: dx!, dy: dy!, cell: resolveLegacyNavigationTarget(maze, gate, dx!, dy!) }))
      .filter((entry): entry is { dx: number; dy: number; cell: { x: number; y: number } } => entry.cell !== null);
    expect(neighbours.length).toBeGreaterThanOrEqual(2);
    // The trail's previous cell wins even when it is not first in move order.
    const back = neighbours[neighbours.length - 1]!;
    expect(controller.resolveEjectStep(maze, gate, [back.cell, gate], closedTick)).toEqual({ deltaX: back.dx, deltaY: back.dy });
    // The trail may also end at the previous cell (gate cell not yet appended).
    expect(controller.resolveEjectStep(maze, gate, [back.cell], closedTick)).toEqual({ deltaX: back.dx, deltaY: back.dy });
    // No usable trail: first open neighbour in up/left/down/right order.
    const first = neighbours[0]!;
    expect(controller.resolveEjectStep(maze, gate, [], closedTick)).toEqual({ deltaX: first.dx, deltaY: first.dy });
    expect(controller.ejects).toBe(3);
  });

  test('receipt fields exist in play only', () => {
    const { maze, overlay, level } = findGateFixture();
    const controller = createLegacyHazardGateController();
    controller.install(maze, { mode: 'play', level, playerLevel: level });
    expect(controller.receiptFields()).toEqual({
      hazardScheduleVersion: overlay.scheduleVersion,
      hazardDigest: overlay.digest,
      exposureStage: overlay.exposureStage
    });
    expect(controller.receiptFields()).toBe(controller.receiptFields());
    controller.install(maze, { mode: 'menu', level, playerLevel: 50 });
    expect(controller.receiptFields()).toBeNull();
    controller.clear();
    expect(controller.gateCount).toBe(0);
    expect(controller.receiptFields()).toBeNull();
    expect(controller.isBlockedAt(maze.start.x, maze.start.y, 0)).toBe(false);
  });

  test('a worker overlay is adopted as is (null = no gates); below the schedule nothing loads', () => {
    const { maze, overlay, level } = findGateFixture();
    const controller = createLegacyHazardGateController();
    expect(controller.install(maze, { mode: 'play', level, playerLevel: level, workerOverlay: overlay }).overlaySource).toBe('worker');
    expect(controller.gateCount).toBe(gateSpecs(overlay.specs).length);
    expect(controller.install(maze, { mode: 'play', level, playerLevel: level, workerOverlay: null })).toEqual({ gateCount: 0, overlaySource: 'none' });
    expect(controller.receiptFields()).toBeNull();
    const low = controller.install(maze, { mode: 'play', level: 3, playerLevel: 3 });
    expect(low.gateCount).toBe(0);
  });

  test('menu demo: gates only once the player has met them; the replay walks the witness to the goal', () => {
    const { maze, overlay, level } = findGateFixture(10, undefined, { needWait: true });
    const witness = overlay.verdict!.witness!;
    const controller = createLegacyHazardGateController();
    expect(controller.install(maze, { mode: 'menu', level, playerLevel: 10 }).gateCount).toBe(0);
    expect(controller.demoReplayActive).toBe(false);
    expect(controller.install({ ...maze, source: 'menu-snapshot' } as typeof maze, { mode: 'menu', level, playerLevel: 50 }).gateCount).toBe(0);
    const result = controller.install(maze, { mode: 'menu', level, playerLevel: 50 });
    expect(result.gateCount).toBeGreaterThan(0);
    expect(controller.demoReplayActive).toBe(true);
    expect(controller.demoLength).toBe(witness.cells.length);
    expect(controller.demoTick).toBe(witness.startTick);
    expect({ x: controller.demoX(0), y: controller.demoY(0) }).toEqual({ x: maze.start.x, y: maze.start.y });
    let steps = 0;
    while (controller.advanceDemo() !== -1) {
      steps += 1;
      const cursor = controller.demoCursor;
      // The demo is never standing inside a closed gate.
      expect(controller.isBlockedAt(controller.demoX(cursor), controller.demoY(cursor), controller.demoTick)).toBe(false);
    }
    expect(steps).toBe(witness.ticks);
    expect(controller.demoFinished).toBe(true);
    expect({ x: controller.demoX(controller.demoCursor), y: controller.demoY(controller.demoCursor) }).toEqual({ x: maze.goal.x, y: maze.goal.y });
    expect(controller.describe()).toMatchObject({ mode: 'menu', gateCount: result.gateCount, demo: { length: witness.cells.length } });
  });
});
