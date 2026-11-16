import { describe, expect, test } from 'vitest';
import { createHazardWorldRuntime } from '../../src/legacy-runtime/legacyWorldClock';
import { createLegacyHazardGateController } from '../../src/legacy-runtime/legacyHazardGateController';
import { HazardGateCanvasView, resolveHazardGateRampStep } from '../../src/render/hazardGateLayer';
import { findGateFixture } from './legacy-hazard-gate-fixture';

// Slice H3 budgets (roadmap): hazard update < 0.3 ms per frame, gate draw < 1 ms per frame.
// Measured as the mean over many 60 Hz frames of the same work MenuScene does per frame
// (clock frame + eject check per elapsed tick; view.draw with the tick and ramp step), so a
// regression of an order of magnitude fails here long before a phone would notice.

const FRAME_MS = 1000 / 60;
const TICK_MS = 120;
const FRAMES = 6000;

const noopContext = () => {
  const noop = () => undefined;
  return {
    globalAlpha: 1, lineWidth: 1, lineCap: 'butt', strokeStyle: '',
    save: noop, restore: noop, clearRect: noop, setLineDash: noop, setTransform: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop
  } as unknown as CanvasRenderingContext2D;
};

describe('Pulse Gate per-frame budgets (slice H3)', () => {
  test('hazard update < 0.3 ms and draw < 1 ms per frame (mean over 6000 frames)', () => {
    const { maze, overlay, level } = findGateFixture(10, undefined, { needWait: true });
    const gates = createLegacyHazardGateController();
    gates.install(maze, { mode: 'play', level, playerLevel: level, workerOverlay: overlay });
    expect(gates.gateCount).toBeGreaterThan(0);
    const runtime = createHazardWorldRuntime();
    const player = { x: gates.gateX(0), y: gates.gateY(0) };
    const trail = [{ ...maze.start }, player];
    const view = new HazardGateCanvasView(
      { context: noopContext(), setSize: () => undefined, clear: () => undefined, refresh: () => undefined },
      { setPosition: () => undefined, setDisplaySize: () => undefined, setVisible: () => undefined }
    );
    const layout = { mazeLeft: 12, mazeTop: 80, tileSize: 14, resolution: 3 };

    const run = (frames: number) => {
      let now = 0;
      let updateMs = 0;
      let drawMs = 0;
      const redrawsBefore = view.redraws;
      runtime.resetLevel();
      runtime.noteInput(now);
      for (let frame = 0; frame < frames; frame += 1) {
        now += FRAME_MS;
        const a = performance.now();
        const elapsed = runtime.frame(now, true, TICK_MS);
        // Worst case: the player stands in a gate, so every elapsed tick runs the full eject check.
        for (let checked = runtime.clock.ticks - elapsed + 1; checked <= runtime.clock.ticks; checked += 1) {
          gates.resolveEjectStep(maze, player, trail, checked);
        }
        gates.isBlockedAt(player.x, player.y, runtime.clock.ticks + 1);
        const b = performance.now();
        view.draw(gates, layout, runtime.clock.ticks, resolveHazardGateRampStep(runtime.clock.remainderMs, TICK_MS), false, 1);
        drawMs += performance.now() - b;
        updateMs += b - a;
      }
      return { update: updateMs / frames, draw: drawMs / frames, redraws: view.redraws - redrawsBefore };
    };

    run(600); // warm-up (JIT)
    const result = run(FRAMES);
    expect(result.update).toBeLessThan(0.3);
    expect(result.draw).toBeLessThan(1);
    // The view redraws per tick or ramp step change, not every frame.
    expect(result.redraws).toBeLessThan(FRAMES * 0.6);
  });
});
