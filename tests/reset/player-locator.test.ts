import { describe, expect, test } from 'vitest';
import { BOARD_CHIP_FILL, CHIP_CORNER_RATIO, boardMaterial } from '../../src/render/boardTileStyle';
import { getContrastRatio } from '../../src/render/palette';
import { resolvePlayerMarkerReach } from '../../src/render/playerMarker';
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
  devicePixelRatio: 2,
  coreHalfWidth: 6,
  coreHalfHeight: 6,
  coreCornerRadius: 1.5,
  coreReachCss: 6.4,
  alpha: 1,
  timeMs: 0,
  pingStartMs: -1,
  reducedMotion: false,
  ...over
});

/** Ring strokes (the ring, then 2 per live ping ring): every strokeRoundedRect except the final core keyline. */
const circles = (calls: Call[]): number => calls.filter((c) => c.fn === 'strokeRoundedRect').length - 1;
const ringSquares = (calls: Call[]): Call[] => calls.filter((c) => c.fn === 'strokeRoundedRect').slice(0, -1);

/** The tile sizes the owner compared: a dense 8 px board, the 14.7 px phone tile and the 25 px desktop tile. */
const TILES = [8.32, 14.72, 25.44];
const DPRS = [1, 2, 2.625, 3];
const reachOf = (tile: number): number => resolvePlayerMarkerReach(tile);

describe('player locator geometry (tile-proportioned: the ring and keyline stay inside the players own tile)', () => {
  test.each(TILES.flatMap((tile) => DPRS.map((dpr) => [tile, dpr] as const)))('tile %f at DPR %f: the ring lies inside the tile, the glow is a bounded falloff', (tile, dpr) => {
    const m = resolvePlayerLocatorMetrics(tile, dpr, reachOf(tile));
    const half = tile / 2;
    // ring: the outer edge of its stroke is flush with the tile edge, never past it
    expect(m.ringHalfCss + (m.ringStrokeCss / 2)).toBeCloseTo(half, 9);
    // whole device pixels, at least one
    expect(Math.round(m.ringStrokeCss * dpr)).toBeGreaterThanOrEqual(1);
    expect(m.ringStrokeCss * dpr).toBeCloseTo(Math.round(m.ringStrokeCss * dpr), 9);
    expect(Math.round(m.coreKeylineCss * dpr)).toBeGreaterThanOrEqual(1);
    expect(m.coreKeylineCss * dpr).toBeCloseTo(Math.round(m.coreKeylineCss * dpr), 9);
    // glow: exactly glowSpreadTileRatio of a tile beyond the cell edge (a falloff, not a second ring)
    expect(m.glowHalfCss).toBeCloseTo(half + (tile * PLAYER_LOCATOR.glowSpreadTileRatio), 9);
    // the ping is the one css-px sized part: it travels well outside the tile
    expect(m.pingTravelHalfCss).toBeGreaterThanOrEqual(half + PLAYER_LOCATOR.pingMinTravelCss);
  });

  test('where the ring is drawn it never overlaps the block and its keyline (beyond half a device px)', () => {
    for (const tile of TILES) {
      for (const dpr of DPRS) {
        const m = resolvePlayerLocatorMetrics(tile, dpr, reachOf(tile));
        if (!m.ringVisible) continue;
        const inner = m.ringHalfCss - (m.ringStrokeCss / 2);
        expect(inner, `${tile}@${dpr}`).toBeGreaterThanOrEqual(reachOf(tile) + m.coreKeylineCss - (0.5 / dpr) - 1e-9);
      }
    }
  });

  test('the ring is present on the phone (14.7 px) and desktop (25 px) tiles at every tested DPR, and on 8 px tiles at 2x and up', () => {
    for (const dpr of DPRS) {
      expect(resolvePlayerLocatorMetrics(14.72, dpr, reachOf(14.72)).ringVisible, `14.72@${dpr}`).toBe(true);
      expect(resolvePlayerLocatorMetrics(25.44, dpr, reachOf(25.44)).ringVisible, `25.44@${dpr}`).toBe(true);
    }
    for (const dpr of [2, 2.625, 3]) {
      expect(resolvePlayerLocatorMetrics(8.32, dpr, reachOf(8.32)).ringVisible, `8.32@${dpr}`).toBe(true);
    }
    // 8 px at 1x has no room for ring + keyline around a 5 px block: the glow and the ping carry the marker
    expect(resolvePlayerLocatorMetrics(8.32, 1, reachOf(8.32)).ringVisible).toBe(false);
  });

  test('a degenerate tile size resolves to nothing (and never NaN)', () => {
    for (const tile of [0, -4, Number.NaN]) {
      const m = resolvePlayerLocatorMetrics(tile, 2, 3);
      expect(m).toEqual({ ringHalfCss: 0, ringStrokeCss: 0, ringVisible: false, glowHalfCss: 0, coreKeylineCss: 0, pingTravelHalfCss: 0 });
    }
  });

  test('reuses the caller record (no allocation) and is a pure function of its inputs', () => {
    const out = resolvePlayerLocatorMetrics(12, 2, 3.5);
    const again = { ...out, ringHalfCss: -1 };
    expect(resolvePlayerLocatorMetrics(12, 2, 3.5, again)).toBe(again);
    expect(again).toEqual(out);
  });
});

describe('player locator draw', () => {
  test('static treatment: glow squares, one thin ring, the core keyline, and no ping', () => {
    const { g, calls } = recorder();
    drawPlayerLocator(g, baseInput());
    expect(calls.filter((c) => c.fn === 'fillRoundedRect')).toHaveLength(PLAYER_LOCATOR.glowSteps);
    expect(circles(calls)).toBe(1);
    expect(calls.filter((c) => c.fn === 'strokeRoundedRect')).toHaveLength(2);
    const m = resolvePlayerLocatorMetrics(20, 2, 6.4);
    const widths = calls.filter((c) => c.fn === 'lineStyle').map((c) => c.args[0]!);
    expect(widths[0]).toBe(m.ringStrokeCss);
    expect(widths[1]).toBe(m.coreKeylineCss);
  });

  test('a tile too small for the ring draws the glow and the keyline only', () => {
    const { g, calls } = recorder();
    drawPlayerLocator(g, baseInput({ tileSize: 8.32, devicePixelRatio: 1, coreHalfWidth: 2.5, coreHalfHeight: 2.5, coreReachCss: 2.67 }));
    expect(circles(calls)).toBe(0);
    expect(calls.filter((c) => c.fn === 'fillRoundedRect')).toHaveLength(PLAYER_LOCATOR.glowSteps);
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
    expect(circles(live.calls)).toBe(1 + 4);

    const early = recorder();
    drawPlayerLocator(early.g, baseInput({ pingStartMs: 1000, timeMs: 1100 }));
    expect(circles(early.calls)).toBe(1 + 2);

    const done = recorder();
    drawPlayerLocator(done.g, baseInput({ pingStartMs: 1000, timeMs: 1000 + PLAYER_LOCATOR_PING_TOTAL_MS + 1 }));
    expect(circles(done.calls)).toBe(1);

    const reduced = recorder();
    drawPlayerLocator(reduced.g, baseInput({ pingStartMs: 1000, timeMs: 1400, reducedMotion: true }));
    expect(circles(reduced.calls)).toBe(1);
  });

  test('ping radius grows monotonically from the ring to the travel radius', () => {
    const m = resolvePlayerLocatorMetrics(20, 2, 6.4);
    const radii: number[] = [];
    for (const t of [50, 300, 600, 900, 1050]) {
      const { g, calls } = recorder();
      drawPlayerLocator(g, baseInput({ pingStartMs: 0, timeMs: t }));
      // strokeRoundedRect args: x, y, width, height, radius; the half-extent is width / 2
      radii.push(ringSquares(calls)[1]!.args[2]! / 2);
    }
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]!);
    }
    expect(radii[0]).toBeGreaterThanOrEqual(m.ringHalfCss);
    expect(radii[radii.length - 1]).toBeLessThanOrEqual(m.pingTravelHalfCss);
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
    const ringAlpha = (c: Call[]): number => c.filter((x) => x.fn === 'lineStyle')[0]!.args[2]!;
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
