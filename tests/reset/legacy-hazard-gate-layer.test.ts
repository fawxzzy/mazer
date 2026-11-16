import { describe, expect, test } from 'vitest';
import { boardMaterial, mixColor } from '../../src/render/boardTileStyle';
import { getContrastRatio } from '../../src/render/palette';
import {
  HAZARD_GATE_COLOR,
  HAZARD_GATE_KEYLINE_COLOR,
  HAZARD_GATE_OPEN_ALPHA,
  HAZARD_GATE_RAMP_STEPS,
  HazardGateCanvasView,
  drawHazardGatesToCanvasContext,
  resolveHazardGateAlpha,
  resolveHazardGateRampStep,
  type HazardGateCanvasSource
} from '../../src/render/hazardGateLayer';

// Slice H3: the Pulse Gate layer (own canvas). Presentation only; state comes from the source.

/** Records every canvas call as a compact string so a frame can be snapshotted. */
const createRecordingContext = () => {
  const calls: string[] = [];
  const round = (value: number) => Math.round(value * 100) / 100;
  const context = {
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    strokeStyle: '',
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    clearRect: (x: number, y: number, w: number, h: number) => calls.push(`clear ${round(x)},${round(y)},${round(w)},${round(h)}`),
    setLineDash: (pattern: number[]) => calls.push(`dash [${pattern.map(round).join(',')}]`),
    setTransform: (...args: number[]) => calls.push(`transform ${args.join(',')}`),
    beginPath: () => calls.push('begin'),
    moveTo: (x: number, y: number) => calls.push(`m ${round(x)},${round(y)}`),
    lineTo: (x: number, y: number) => calls.push(`l ${round(x)},${round(y)}`),
    stroke: () => calls.push(`stroke ${context.strokeStyle} w=${round(context.lineWidth)} a=${round(context.globalAlpha)}`)
  };
  return { calls, context: context as unknown as CanvasRenderingContext2D };
};

/** Two gates: index 0 horizontal corridor, period 4 open 2 (open at ticks 0,1); index 1 vertical, always open. */
const createSource = (): HazardGateCanvasSource & { version: number } => ({
  version: 1,
  boardWidth: 6,
  boardHeight: 5,
  gateCount: 2,
  gateX: (index) => (index === 0 ? 1 : 4),
  gateY: (index) => (index === 0 ? 2 : 3),
  gateAxis: (index) => (index === 0 ? 0 : 1),
  isOpenAt: (index, tick) => index === 1 || (((tick % 4) + 4) % 4) < 2
});

describe('Pulse Gate layer (slice H3)', () => {
  test('telegraph state table: style = next tick, alpha = now (closed = full, open = dim)', () => {
    // closed now -> full alpha whatever comes next
    expect(resolveHazardGateAlpha(false, false, 2, false)).toBe(1);
    expect(resolveHazardGateAlpha(false, true, 2, false)).toBe(1);
    // open now and next -> dim
    expect(resolveHazardGateAlpha(true, true, 3, false)).toBe(HAZARD_GATE_OPEN_ALPHA);
    // open now, closing next -> ramps up across the tick; reduced motion stays static
    const ramp = Array.from({ length: HAZARD_GATE_RAMP_STEPS }, (_, step) => resolveHazardGateAlpha(true, false, step, false));
    expect([...ramp].sort((a, b) => a - b)).toEqual(ramp);
    expect(ramp[0]).toBeGreaterThan(HAZARD_GATE_OPEN_ALPHA);
    expect(ramp.at(-1)).toBe(1);
    for (let step = 0; step < HAZARD_GATE_RAMP_STEPS; step += 1) {
      expect(resolveHazardGateAlpha(true, false, step, true)).toBe(HAZARD_GATE_OPEN_ALPHA);
    }
  });

  test('ramp step is quantised and clamped', () => {
    expect(resolveHazardGateRampStep(0, 200)).toBe(0);
    expect(resolveHazardGateRampStep(49, 200)).toBe(0);
    expect(resolveHazardGateRampStep(50, 200)).toBe(1);
    expect(resolveHazardGateRampStep(199, 200)).toBe(HAZARD_GATE_RAMP_STEPS - 1);
    expect(resolveHazardGateRampStep(500, 200)).toBe(HAZARD_GATE_RAMP_STEPS - 1);
    expect(resolveHazardGateRampStep(10, 0)).toBe(0);
    expect(resolveHazardGateRampStep(Number.NaN, 200)).toBe(0);
  });

  test('reduced-motion snapshot: same frame at every ramp step, solid when closing, dashed when opening', () => {
    const source = createSource();
    const frame = (tick: number, rampStep: number, reducedMotion: boolean) => {
      const { calls, context } = createRecordingContext();
      drawHazardGatesToCanvasContext(context, source, { originX: 1, originY: 1, tileSize: 20, tick, rampStep, reducedMotion, alpha: 1 });
      return calls;
    };
    // Tick 1: gate 0 open now, closed next (closing) -> solid bars at the dim alpha.
    const reduced = frame(1, 0, true);
    for (let step = 1; step < HAZARD_GATE_RAMP_STEPS; step += 1) {
      expect(frame(1, step, true)).toEqual(reduced);
    }
    expect(frame(1, 3, false)).not.toEqual(reduced);
    expect(reduced).toMatchInlineSnapshot(`
      [
        "clear 20,40,22,22",
        "clear 80,60,22,22",
        "save",
        "dash []",
        "begin",
        "m 27,43",
        "l 27,59",
        "m 31,43",
        "l 31,59",
        "m 35,43",
        "l 35,59",
        "stroke rgba(3, 7, 11, 1) w=4.2 a=1",
        "stroke rgba(255, 79, 216, 1) w=2.6 a=0.72",
        "dash [2.29,1.78]",
        "begin",
        "m 83,67",
        "l 99,67",
        "m 83,71",
        "l 99,71",
        "m 83,75",
        "l 99,75",
        "stroke rgba(3, 7, 11, 1) w=4.2 a=1",
        "stroke rgba(255, 79, 216, 1) w=2.6 a=0.72",
        "restore",
      ]
    `);
    // Tick 3: gate 0 closed now, open next (opening) -> dashed at full alpha.
    const opening = frame(3, 0, true);
    expect(opening[3]).toBe('dash [2.29,1.78]');
    expect(opening[12]).toBe('stroke rgba(255, 79, 216, 1) w=2.6 a=1');
    // Tick 2: closed now and next -> solid at full alpha.
    const closed = frame(2, 0, true);
    expect(closed[3]).toBe('dash []');
    expect(closed[12]).toBe('stroke rgba(255, 79, 216, 1) w=2.6 a=1');
  });

  test('contrast >= 3:1 (graph contract): keyline against the chip floor, magenta against the keyline, also at the open alpha', () => {
    // Magenta straight on the mid-tone chip floor is too weak, which is why every bar has a keyline.
    expect(getContrastRatio(HAZARD_GATE_COLOR, boardMaterial.chip)).toBeLessThan(3);
    expect(HAZARD_GATE_KEYLINE_COLOR).toBe(boardMaterial.void);
    expect(getContrastRatio(HAZARD_GATE_KEYLINE_COLOR, boardMaterial.chip)).toBeGreaterThanOrEqual(3);
    expect(getContrastRatio(HAZARD_GATE_COLOR, HAZARD_GATE_KEYLINE_COLOR)).toBeGreaterThanOrEqual(3);
    const dimOnKeyline = mixColor(HAZARD_GATE_KEYLINE_COLOR, HAZARD_GATE_COLOR, HAZARD_GATE_OPEN_ALPHA);
    expect(getContrastRatio(dimOnKeyline, HAZARD_GATE_KEYLINE_COLOR)).toBeGreaterThanOrEqual(3);
  });

  test('the canvas view redraws only when something visible changed, at a whole-px position', () => {
    const { calls, context } = createRecordingContext();
    const sizes: string[] = [];
    const positions: string[] = [];
    const visibility: boolean[] = [];
    const texture = {
      context,
      setSize: (w: number, h: number) => sizes.push(`${w}x${h}`),
      clear: () => calls.push('texture-clear'),
      refresh: () => calls.push('refresh')
    };
    const image = {
      setPosition: (x: number, y: number) => positions.push(`${x},${y}`),
      setDisplaySize: () => undefined,
      setVisible: (visible: boolean) => visibility.push(visible)
    };
    const view = new HazardGateCanvasView(texture, image);
    const source = createSource();
    const layout = { mazeLeft: 10.4, mazeTop: 20.6, tileSize: 20, resolution: 3 };
    view.draw(source, layout, 0, 0, false, 1);
    expect(view.redraws).toBe(1);
    expect(sizes).toEqual([`${Math.ceil(122 * 3)}x${Math.ceil(102 * 3)}`]);
    expect(positions).toEqual(['9,20']);
    expect(visibility).toEqual([true]);
    for (let frame = 0; frame < 30; frame += 1) {
      view.draw(source, layout, 0, 0, false, 1);
    }
    expect(view.redraws).toBe(1);
    view.draw(source, layout, 1, 0, false, 1);
    view.draw(source, layout, 1, 2, false, 1);
    expect(view.redraws).toBe(3);
    // Reduced motion ignores the ramp step: no redraw for a ramp-only change.
    view.draw(source, layout, 1, 0, true, 1);
    view.draw(source, layout, 1, 3, true, 1);
    expect(view.redraws).toBe(4);
    // A new gate set fully clears first.
    source.version = 2;
    view.draw(source, layout, 1, 0, true, 1);
    expect(calls).toContain('texture-clear');
    // Nothing to draw hides the image.
    view.draw({ ...source, gateCount: 0 }, layout, 1, 0, true, 1);
    expect(visibility.at(-1)).toBe(false);
  });
});
