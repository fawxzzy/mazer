import { describe, expect, test } from 'vitest';
import { BOARD_CHIP_FILL, CHIP_CORNER_RATIO, boardMaterial } from '../../src/render/boardTileStyle';
import { getContrastRatio } from '../../src/render/palette';
import {
  PLAYER_LOCATOR,
  PLAYER_LOCATOR_PING_TOTAL_MS,
  PlayerLocatorState,
  drawPlayerLocator,
  resolveLocatorCornerRadius,
  resolvePingRingProgress,
  resolvePlayerLocatorMetrics,
  type LocatorGraphics,
  type PlayerLocatorDrawInput
} from '../../src/render/playerLocator';

type Call = { fn: string; args: number[] };

const recorder = (): { g: LocatorGraphics; calls: Call[] } => {
  const calls: Call[] = [];
  const rec = (fn: string) => (...args: number[]) => { calls.push({ fn, args }); };
  return {
    calls,
    g: {
      fillStyle: rec('fillStyle'),
      fillRoundedRect: rec('fillRoundedRect'),
      lineStyle: rec('lineStyle'),
      strokeRoundedRect: rec('strokeRoundedRect')
    }
  };
};

const baseInput = (over: Partial<PlayerLocatorDrawInput> = {}): PlayerLocatorDrawInput => ({
  centerX: 100,
  centerY: 80,
  tileSize: 20,
  coreHalfWidth: 6,
  coreHalfHeight: 6,
  coreCornerRadius: 1.5,
  alpha: 1,
  timeMs: 0,
  pingStartMs: -1,
  reducedMotion: false,
  ...over
});

/** Ring strokes (ring keyline, ring, then 2 per live ping ring): every strokeRoundedRect except the final core keyline. */
const circles = (calls: Call[]): number => calls.filter((c) => c.fn === 'strokeRoundedRect').length - 1;
const ringSquares = (calls: Call[]): Call[] => calls.filter((c) => c.fn === 'strokeRoundedRect').slice(0, -1);

describe('player locator geometry', () => {
  test('ring radius scales with the tile but is floored and capped in css px', () => {
    const tiny = resolvePlayerLocatorMetrics(5);
    const phone = resolvePlayerLocatorMetrics(29);
    const huge = resolvePlayerLocatorMetrics(200);
    expect(tiny.ringRadiusCss).toBe(PLAYER_LOCATOR.minRingRadiusCss);
    expect(phone.ringRadiusCss).toBeCloseTo(29 * PLAYER_LOCATOR.ringRadiusTileRatio, 6);
    expect(huge.ringRadiusCss).toBe(PLAYER_LOCATOR.maxRingRadiusCss);
    expect(resolvePlayerLocatorMetrics(Number.NaN).ringRadiusCss).toBe(PLAYER_LOCATOR.minRingRadiusCss);
  });

  test('on dense boards (5..8 css px tiles) the ring is larger than the tile, not a dot', () => {
    for (const tile of [5, 6, 7, 8]) {
      const m = resolvePlayerLocatorMetrics(tile);
      expect(m.ringRadiusCss * 2).toBeGreaterThan(tile * 2);
      expect(m.glowRadiusCss).toBeGreaterThan(m.ringRadiusCss);
      expect(m.pingTravelRadiusCss).toBeGreaterThan(m.ringRadiusCss + 20);
    }
  });

  test('reuses the caller record (no allocation) and is a pure function of the tile', () => {
    const out = { ringRadiusCss: 0, glowRadiusCss: 0, pingTravelRadiusCss: 0 };
    expect(resolvePlayerLocatorMetrics(12, out)).toBe(out);
    expect(resolvePlayerLocatorMetrics(12)).toEqual(out);
  });
});

describe('player locator draw', () => {
  test('static treatment: glow squares, dark-keylined ring, core keyline, and no ping', () => {
    const { g, calls } = recorder();
    drawPlayerLocator(g, baseInput());
    expect(calls.filter((c) => c.fn === 'fillRoundedRect')).toHaveLength(PLAYER_LOCATOR.glowSteps);
    expect(circles(calls)).toBe(2);
    expect(calls.filter((c) => c.fn === 'strokeRoundedRect')).toHaveLength(3);
    const widths = calls.filter((c) => c.fn === 'lineStyle').map((c) => c.args[0]!);
    expect(widths[0]).toBeGreaterThan(widths[1]!);
  });

  test('the core keyline sits just outside the core and is drawn last (the caller then fills the core on top)', () => {
    const { g, calls } = recorder();
    drawPlayerLocator(g, baseInput());
    const last = calls[calls.length - 1];
    expect(last?.fn).toBe('strokeRoundedRect');
    const [x, y, w, h] = last!.args;
    expect(x).toBeLessThan(100 - 6);
    expect(y).toBeLessThan(80 - 6);
    expect(w).toBeGreaterThan(12);
    expect(h).toBeGreaterThan(12);
  });

  test('a running ping adds staggered rings that fade and expand; reduced motion draws none', () => {
    const live = recorder();
    drawPlayerLocator(live.g, baseInput({ pingStartMs: 1000, timeMs: 1400 }));
    expect(circles(live.calls)).toBe(2 + 4);

    const early = recorder();
    drawPlayerLocator(early.g, baseInput({ pingStartMs: 1000, timeMs: 1100 }));
    expect(circles(early.calls)).toBe(2 + 2);

    const done = recorder();
    drawPlayerLocator(done.g, baseInput({ pingStartMs: 1000, timeMs: 1000 + PLAYER_LOCATOR_PING_TOTAL_MS + 1 }));
    expect(circles(done.calls)).toBe(2);

    const reduced = recorder();
    drawPlayerLocator(reduced.g, baseInput({ pingStartMs: 1000, timeMs: 1400, reducedMotion: true }));
    expect(circles(reduced.calls)).toBe(2);
  });

  test('ping radius grows monotonically from the ring to the travel radius', () => {
    const m = resolvePlayerLocatorMetrics(20);
    const radii: number[] = [];
    for (const t of [50, 300, 600, 900, 1050]) {
      const { g, calls } = recorder();
      drawPlayerLocator(g, baseInput({ pingStartMs: 0, timeMs: t }));
      // strokeRoundedRect args: x, y, width, height, radius; the half-extent is width / 2
      radii.push(ringSquares(calls)[2]!.args[2]! / 2);
    }
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]!);
    }
    expect(radii[0]).toBeGreaterThanOrEqual(m.ringRadiusCss);
    expect(radii[radii.length - 1]).toBeLessThanOrEqual(m.pingTravelRadiusCss);
  });

  test('the ring, glow and ping are chip-family rounded squares: concentric with the player, corner = chip proportion', () => {
    const { g, calls } = recorder();
    drawPlayerLocator(g, baseInput({ pingStartMs: 1000, timeMs: 1400 }));
    const squares = [
      ...calls.filter((c) => c.fn === 'fillRoundedRect'),
      ...ringSquares(calls)
    ];
    expect(squares.length).toBeGreaterThan(PLAYER_LOCATOR.glowSteps + 4);
    for (const call of squares) {
      const [x, y, w, h, r] = call.args as [number, number, number, number, number];
      expect(w, call.fn).toBeCloseTo(h, 9);
      expect(x + (w / 2), call.fn).toBeCloseTo(100, 9);
      expect(y + (h / 2), call.fn).toBeCloseTo(80, 9);
      // radius / width equals the chip tile's corner ratio (the same constant the tile and the player use)
      expect(r / w, call.fn).toBeCloseTo(CHIP_CORNER_RATIO, 9);
    }
    expect(resolveLocatorCornerRadius(10)).toBeCloseTo(10 * 2 * CHIP_CORNER_RATIO, 9);
  });

  test('no circle is drawn any more (the interface has no circle methods)', () => {
    const { g } = recorder();
    expect(Object.keys(g)).not.toContain('fillCircle');
    expect(Object.keys(g)).not.toContain('strokeCircle');
  });

  test('draws nothing at zero alpha and respects the lifecycle fade', () => {
    const none = recorder();
    drawPlayerLocator(none.g, baseInput({ alpha: 0 }));
    expect(none.calls).toHaveLength(0);
    const half = recorder();
    drawPlayerLocator(half.g, baseInput({ alpha: 0.5 }));
    const full = recorder();
    drawPlayerLocator(full.g, baseInput({ alpha: 1 }));
    const ringAlpha = (c: Call[]): number => c.filter((x) => x.fn === 'lineStyle')[1]!.args[2]!;
    expect(ringAlpha(half.calls)).toBeCloseTo(ringAlpha(full.calls) / 2, 6);
  });

  test('ping ring progress helper: staggered, bounded', () => {
    expect(resolvePingRingProgress(-1, 0)).toBe(-1);
    expect(resolvePingRingProgress(0, 0)).toBe(0);
    expect(resolvePingRingProgress(PLAYER_LOCATOR.pingStaggerMs - 1, 1)).toBe(-1);
    expect(resolvePingRingProgress(PLAYER_LOCATOR.pingDurationMs, 0)).toBe(-1);
    expect(PLAYER_LOCATOR_PING_TOTAL_MS).toBe(PLAYER_LOCATOR.pingDurationMs + PLAYER_LOCATOR.pingStaggerMs);
  });
});

describe('player locator contrast (non-text, WCAG 3:1 against the real Chip floor)', () => {
  test('ring and ping colours each clear 3:1 against the shipped chip fill', () => {
    for (const [name, color] of [['ring', boardMaterial.player], ['ping', boardMaterial.playerEdge]] as const) {
      expect(getContrastRatio(color, BOARD_CHIP_FILL), name).toBeGreaterThanOrEqual(3);
    }
  });

  test('the dark keyline separates the ring from chips and the lit rim by a wide margin', () => {
    expect(getContrastRatio(boardMaterial.void, BOARD_CHIP_FILL)).toBeGreaterThanOrEqual(3);
    expect(getContrastRatio(boardMaterial.void, boardMaterial.player)).toBeGreaterThanOrEqual(7);
    expect(getContrastRatio(boardMaterial.void, boardMaterial.rim)).toBeGreaterThanOrEqual(7);
  });
});

describe('PlayerLocatorState (find-me ping scheduler)', () => {
  test('a rising edge of live (spawn, unpause, next level) starts a ping', () => {
    const s = new PlayerLocatorState();
    s.update(0, false, 1, 1, false);
    expect(s.activePingStartMs).toBe(-1);
    s.update(100, true, 1, 1, false);
    expect(s.activePingStartMs).toBe(100);
    expect(s.needsRedraw()).toBe(true);
  });

  test('the ping ends after its total duration and exactly one more redraw clears it', () => {
    const s = new PlayerLocatorState();
    s.update(0, true, 0, 0, false);
    s.update(PLAYER_LOCATOR_PING_TOTAL_MS - 1, true, 0, 0, false);
    expect(s.activePingStartMs).toBe(0);
    s.update(PLAYER_LOCATOR_PING_TOTAL_MS + 1, true, 0, 0, false);
    expect(s.activePingStartMs).toBe(-1);
    expect(s.needsRedraw()).toBe(true);
    expect(s.needsRedraw()).toBe(false);
  });

  test('standing still for idleMs pings again, then every idleRepeatMs; no pings in between', () => {
    const s = new PlayerLocatorState();
    s.update(0, true, 3, 3, false);
    s.update(2000, true, 3, 3, false);
    expect(s.activePingStartMs).toBe(-1);
    s.update(PLAYER_LOCATOR.idleMs, true, 3, 3, false);
    expect(s.activePingStartMs).toBe(PLAYER_LOCATOR.idleMs);
    const second = PLAYER_LOCATOR.idleMs + PLAYER_LOCATOR.idleRepeatMs;
    s.update(second - 10, true, 3, 3, false);
    expect(s.activePingStartMs).toBe(-1);
    s.update(second, true, 3, 3, false);
    expect(s.activePingStartMs).toBe(second);
  });

  test('moving resets the idle clock and cancels a running ping', () => {
    const s = new PlayerLocatorState();
    s.update(0, true, 3, 3, false);
    s.update(300, true, 4, 3, false);
    expect(s.activePingStartMs).toBe(-1);
    s.update(PLAYER_LOCATOR.idleMs + 200, true, 4, 3, false);
    expect(s.activePingStartMs).toBe(-1);
    s.update(300 + PLAYER_LOCATOR.idleMs, true, 4, 3, false);
    expect(s.activePingStartMs).toBe(300 + PLAYER_LOCATOR.idleMs);
  });

  test('going not-live (pause) cancels the ping and the next live edge pings again', () => {
    const s = new PlayerLocatorState();
    s.update(0, true, 0, 0, false);
    s.update(200, false, 0, 0, false);
    expect(s.activePingStartMs).toBe(-1);
    s.update(9000, true, 0, 0, false);
    expect(s.activePingStartMs).toBe(9000);
  });

  test('reduced motion never starts a ping and never forces redraws', () => {
    const s = new PlayerLocatorState();
    s.update(0, true, 0, 0, true);
    s.update(PLAYER_LOCATOR.idleMs + 1, true, 0, 0, true);
    expect(s.activePingStartMs).toBe(-1);
    expect(s.needsRedraw()).toBe(false);
  });
});
