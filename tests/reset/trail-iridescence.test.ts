import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { BOARD_CHIP_FILL, boardMaterial } from '../../src/render/boardTileStyle';
import {
  IRIDESCENT_TRAIL_CORE_STOPS,
  TRAIL_SHEEN_CORE_LIFT_MAX,
  TRAIL_SHEEN_PERIOD_MS,
  TRAIL_SHEEN_SPACING_TILES,
  resolveIridescentBaseCore,
  resolveTrailSheen,
  IRIDESCENT_TRAIL_GLOW_STOPS,
  IRIDESCENT_TRAIL_SWEEP_PERIOD_MS,
  IRIDESCENT_TRAIL_TILES_PER_SWEEP,
  TRAIL_PULSE_BREATH_PERIOD_MS,
  TRAIL_PULSE_CORE_LIFT_MAX,
  TRAIL_PULSE_GLOW_ALPHA_SWING,
  TRAIL_PULSE_PERIOD_MS,
  TRAIL_PULSE_REDUCED_LEVEL,
  TRAIL_PULSE_WAVELENGTH_TILES,
  TRAIL_PULSE_WIDTH_SWING,
  resolveIridescentRestingCore,
  resolveTrailBreath,
  resolveTrailGlowAlphaScale,
  resolveTrailPulseWave,
  resolveTrailWidthScale,
  sampleIridescentTrail
} from '../../src/render/trailIridescence';
import {
  TRAIL_FADE_ALPHA_MIN,
  TRAIL_FLOOR_COLORS,
  contrastRatio,
  mixRgb,
  resolveTrailWidths,
  trailCoreContrast
} from '../../src/render/trailLegibility';

const MENU_SCENE = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n?/g, '\n');

const channels = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const distance = (a: number, b: number): number => {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
};
const hue = (c: number): number => {
  const [r, g, b] = channels(c).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? ((b - r) / d) + 2 : ((r - g) / d) + 4;
  return (h * 60 + 360) % 360;
};

/** Every stop and 64 in-between colours of each neighbouring pair: the resting palette the sweep can show. */
const restingSamples = (): number[] => {
  const out: number[] = [];
  for (let i = 0; i < IRIDESCENT_TRAIL_CORE_STOPS.length - 1; i += 1) {
    for (let s = 0; s <= 64; s += 1) out.push(mixRgb(IRIDESCENT_TRAIL_CORE_STOPS[i]!, IRIDESCENT_TRAIL_CORE_STOPS[i + 1]!, s / 64));
  }
  return out;
};

describe('iridescent midnight-sun trail: palette and contrast', () => {
  test('worst hue against the bare Chip fill is at least 3:1 (reported), and every hue clears 4.5:1 under the dark underlay on every floor', () => {
    let worst = Infinity;
    let worstColor = 0;
    for (const c of restingSamples()) {
      const ratio = contrastRatio(c, BOARD_CHIP_FILL);
      if (ratio < worst) { worst = ratio; worstColor = c; }
      for (const floor of Object.values(TRAIL_FLOOR_COLORS)) {
        expect(trailCoreContrast(c, floor, 1), `0x${c.toString(16)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    console.info(`TRAIL_IRIDESCENT_WORST_HUE vs chip: ${worst.toFixed(2)}:1 at 0x${worstColor.toString(16)}`);
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  test('the faded tail (Trail Fade alpha floor) still clears 3:1 under the underlay for every hue on every floor', () => {
    for (const c of restingSamples()) {
      for (const [name, floor] of Object.entries(TRAIL_FLOOR_COLORS)) {
        expect(trailCoreContrast(c, floor, TRAIL_FADE_ALPHA_MIN), `0x${c.toString(16)} on ${name}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('every sampled core, anywhere on the sweep and at any pulse level, is at least 3:1 on the chip (the pulse only brightens)', () => {
    let worst = Infinity;
    for (let d = 0; d < IRIDESCENT_TRAIL_TILES_PER_SWEEP * 2; d += 0.25) {
      for (let t = 0; t < IRIDESCENT_TRAIL_SWEEP_PERIOD_MS; t += 400) {
        const sample = sampleIridescentTrail(d, t, false, { core: 0, glow: 0, wave: 0, sheen: 0 });
        worst = Math.min(worst, contrastRatio(sample.core, BOARD_CHIP_FILL));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(3);
  });

  test('it stays clear of the player (green), the goal (red) and the start (gold): colour distance and hue band', () => {
    // The core is the readable mark: held well clear of all three. The bloom is a faint halo (alpha <= ~0.2 over the
    // dark underlay's edge), so it only has to stay clearly off them; its deep orange end is the nearest to the goal red.
    const cases: Array<[string, number[], number, number, number]> = [
      ['core', restingSamples(), 110, 120, 75],
      ['bloom', [...IRIDESCENT_TRAIL_GLOW_STOPS], 110, 75, 55]
    ];
    for (const [part, samples, minPlayer, minGoal, minStart] of cases) {
      for (const c of samples) {
        expect(distance(c, boardMaterial.player), `${part} player vs 0x${c.toString(16)}`).toBeGreaterThanOrEqual(minPlayer);
        expect(distance(c, boardMaterial.goal), `${part} goal vs 0x${c.toString(16)}`).toBeGreaterThanOrEqual(minGoal);
        expect(distance(c, boardMaterial.start), `${part} start vs 0x${c.toString(16)}`).toBeGreaterThanOrEqual(minStart);
        const h = hue(c);
        // never the player's green / lime band
        expect(h < 95 || h > 175, `${part} hue ${h.toFixed(0)} of 0x${c.toString(16)}`).toBe(true);
      }
    }
  });

  test('the bloom carries the deep, saturated version of each hue; the core is the pearly pastel', () => {
    const luminance = (c: number): number => {
      const f = (v: number): number => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      const [r, g, b] = channels(c);
      return (0.2126 * f(r)) + (0.7152 * f(g)) + (0.0722 * f(b));
    };
    for (let i = 0; i < IRIDESCENT_TRAIL_CORE_STOPS.length; i += 1) {
      expect(luminance(IRIDESCENT_TRAIL_GLOW_STOPS[i]!)).toBeLessThan(luminance(IRIDESCENT_TRAIL_CORE_STOPS[i]!));
      expect(Math.abs(hue(IRIDESCENT_TRAIL_GLOW_STOPS[i]!) - hue(IRIDESCENT_TRAIL_CORE_STOPS[i]!))).toBeLessThan(40);
    }
  });
});

describe('iridescent trail: it shifts along the trail and over time, with no jumps', () => {
  test('colour differs along the trail and changes with time', () => {
    expect(resolveIridescentRestingCore(0, 0)).not.toBe(resolveIridescentRestingCore(IRIDESCENT_TRAIL_TILES_PER_SWEEP / 4, 0));
    // (the sweep is a triangle wave, so test a quarter period at a point that is not a mirror of itself)
    expect(resolveIridescentRestingCore(1, 0)).not.toBe(resolveIridescentRestingCore(1, IRIDESCENT_TRAIL_SWEEP_PERIOD_MS / 4));
    // a full sweep period returns to the same colour
    expect(resolveIridescentRestingCore(3, 0)).toBe(resolveIridescentRestingCore(3, IRIDESCENT_TRAIL_SWEEP_PERIOD_MS));
  });

  test('the hue goes out and back (triangle sweep): no wrap through the palette, no step larger than a gentle lerp', () => {
    let previous = resolveIridescentRestingCore(0, 0);
    let steps = 0;
    for (let d = 0.02; d <= IRIDESCENT_TRAIL_TILES_PER_SWEEP * 2; d += 0.02) {
      const next = resolveIridescentRestingCore(d, 0);
      expect(distance(previous, next), `at ${d.toFixed(2)} tiles`).toBeLessThan(10);
      previous = next;
      steps += 1;
    }
    expect(steps).toBeGreaterThan(700);
    // after one sweep (out and back) it is the colour it started as
    expect(resolveIridescentRestingCore(IRIDESCENT_TRAIL_TILES_PER_SWEEP, 0)).toBe(resolveIridescentRestingCore(0, 0));
    // and halfway it is the far end of the band
    expect(resolveIridescentRestingCore(IRIDESCENT_TRAIL_TILES_PER_SWEEP / 2, 0)).toBe(IRIDESCENT_TRAIL_CORE_STOPS[IRIDESCENT_TRAIL_CORE_STOPS.length - 1]);
  });
});

describe('iridescent trail: the shift is clearly visible (owner feedback: too subtle)', () => {
  const distance3 = (a: number, b: number): number => distance(a, b);

  test('the hue gradient is short and quick: a full sweep spans at most 8 tiles and passes a fixed point in at most 4 s', () => {
    expect(IRIDESCENT_TRAIL_TILES_PER_SWEEP).toBeLessThanOrEqual(8);
    expect(IRIDESCENT_TRAIL_SWEEP_PERIOD_MS).toBeLessThanOrEqual(4000);
  });

  test('at a fixed point the colour visibly changes within half a second (a colour distance of at least 25 in RGB)', () => {
    let best = 0;
    for (let d = 0; d < 16; d += 1) {
      const a = sampleIridescentTrail(d, 0, false, { core: 0, glow: 0, wave: 0, sheen: 0 }).core;
      const b = sampleIridescentTrail(d, 500, false, { core: 0, glow: 0, wave: 0, sheen: 0 }).core;
      best = Math.max(best, distance3(a, b));
    }
    expect(best).toBeGreaterThanOrEqual(25);
  });

  test('along a stretch of trail the colour changes by at least 60 (RGB distance) within 4 tiles, somewhere on every sweep', () => {
    for (const t of [0, 900, 1800, 2700]) {
      let best = 0;
      for (let d = 0; d < IRIDESCENT_TRAIL_TILES_PER_SWEEP * 2; d += 0.25) {
        const a = sampleIridescentTrail(d, t, false, { core: 0, glow: 0, wave: 0, sheen: 0 }).core;
        const b = sampleIridescentTrail(d + 4, t, false, { core: 0, glow: 0, wave: 0, sheen: 0 }).core;
        best = Math.max(best, distance3(a, b));
      }
      expect(best, `t ${t}`).toBeGreaterThanOrEqual(60);
    }
  });

  test('a sheen band travels toward the player: a narrow bright ridge that moves +distance over time', () => {
    const crestAt = (t: number): number => {
      let best = 0; let bestSheen = -1;
      for (let d = 0; d < TRAIL_SHEEN_SPACING_TILES; d += 0.01) {
        const v = resolveTrailSheen(d, t);
        if (v > bestSheen) { bestSheen = v; best = d; }
      }
      return best;
    };
    const quarter = TRAIL_SHEEN_PERIOD_MS / 4;
    const moved = (crestAt(quarter) - crestAt(0) + TRAIL_SHEEN_SPACING_TILES) % TRAIL_SHEEN_SPACING_TILES;
    expect(moved).toBeCloseTo(TRAIL_SHEEN_SPACING_TILES / 4, 1);
    // narrow: more than 3/4 of the trail has less than 25% of the peak
    let dim = 0; let total = 0;
    for (let d = 0; d < TRAIL_SHEEN_SPACING_TILES; d += 0.05) { total += 1; if (resolveTrailSheen(d, 0) < 0.25) dim += 1; }
    expect(dim / total).toBeGreaterThan(0.6);
    // the band is a visible colour change: inside the band the core is much paler than just outside it
    const out = { core: 0, glow: 0, wave: 0, sheen: 0 };
    let peakD = 0;
    for (let d = 0; d < TRAIL_SHEEN_SPACING_TILES; d += 0.01) if (resolveTrailSheen(d, 0) > resolveTrailSheen(peakD, 0)) peakD = d;
    const inside = sampleIridescentTrail(peakD, 0, false, out).core;
    const outside = sampleIridescentTrail(peakD + (TRAIL_SHEEN_SPACING_TILES / 2), 0, false, out).core;
    const lum = (c: number): number => { const [r, g, b] = channels(c); return (0.299 * r) + (0.587 * g) + (0.114 * b); };
    expect(lum(inside)).toBeGreaterThan(lum(outside) + 15);
    expect(TRAIL_SHEEN_CORE_LIFT_MAX).toBeGreaterThanOrEqual(0.4);
  });

  test('reduced motion has no sheen at all (a static gradient)', () => {
    const out = { core: 0, glow: 0, wave: 0, sheen: 0 };
    for (let d = 0; d < 20; d += 0.7) {
      expect(sampleIridescentTrail(d, 777, true, out).sheen).toBe(0);
    }
  });

  test('frame cost: 60 000 samples (a 1000-segment trail for 60 frames) well inside the budget', () => {
    const out = { core: 0, glow: 0, wave: 0, sheen: 0 };
    const start = performance.now();
    for (let i = 0; i < 60000; i += 1) sampleIridescentTrail(i / 16, i * 3, false, out);
    const perFrameMs = (performance.now() - start) / 60;
    console.info(`TRAIL_PALETTE_SAMPLE_COST ${perFrameMs.toFixed(4)} ms per 1000-segment frame`);
    expect(perFrameMs).toBeLessThan(2);
  });
});

describe('iridescent trail pulse', () => {
  test('a brightness wave travels along the trail toward the player (the crest moves +distance over time)', () => {
    const crestAt = (t: number): number => {
      let best = 0; let bestWave = -1;
      for (let d = 0; d < TRAIL_PULSE_WAVELENGTH_TILES; d += 0.01) {
        const w = resolveTrailPulseWave(d, t);
        if (w > bestWave) { bestWave = w; best = d; }
      }
      return best;
    };
    const quarter = TRAIL_PULSE_PERIOD_MS / 4;
    const a = crestAt(0);
    const b = crestAt(quarter);
    const moved = (b - a + TRAIL_PULSE_WAVELENGTH_TILES) % TRAIL_PULSE_WAVELENGTH_TILES;
    expect(moved).toBeCloseTo(TRAIL_PULSE_WAVELENGTH_TILES / 4, 1);
    for (let d = 0; d < 20; d += 0.37) {
      for (let t = 0; t < TRAIL_PULSE_PERIOD_MS; t += 137) {
        const w = resolveTrailPulseWave(d, t);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });

  test('the pulse only brightens the resting core (so the resting colour is the contrast floor) and stays gentle', () => {
    expect(TRAIL_PULSE_CORE_LIFT_MAX).toBeLessThanOrEqual(0.35);
    expect(TRAIL_PULSE_CORE_LIFT_MAX + TRAIL_SHEEN_CORE_LIFT_MAX).toBeLessThanOrEqual(0.85);
    expect(TRAIL_PULSE_WIDTH_SWING).toBeLessThanOrEqual(0.12);
    expect(TRAIL_PULSE_GLOW_ALPHA_SWING).toBeLessThanOrEqual(0.35);
    const out = { core: 0, glow: 0, wave: 0, sheen: 0 };
    for (let d = 0; d < 30; d += 0.9) {
      for (let t = 0; t < 4000; t += 211) {
        sampleIridescentTrail(d, t, false, out);
        // the resting colour at the sample's own hue position (the sheen refracts the hue a little ahead)
        const resting = channels(resolveIridescentBaseCore(d, t, false));
        const core = channels(out.core);
        for (let i = 0; i < 3; i += 1) expect(core[i]!).toBeGreaterThanOrEqual(resting[i]! - 1);
      }
    }
  });

  test('whole-trail breath: widths only ever grow from the resting width, so the width and contrast floors hold', () => {
    for (const tile of [6.4, 10, 14.72, 25.44, 40]) {
      const resting = resolveTrailWidths(tile);
      for (let t = 0; t < TRAIL_PULSE_BREATH_PERIOD_MS; t += 100) {
        const scale = resolveTrailWidthScale(resolveTrailBreath(t, false));
        expect(scale).toBeGreaterThanOrEqual(1);
        expect(scale).toBeLessThanOrEqual(1 + TRAIL_PULSE_WIDTH_SWING + 1e-9);
        expect(resting.coreWidth * scale).toBeGreaterThanOrEqual(3.5);
        const glow = resolveTrailGlowAlphaScale(resolveTrailBreath(t, false));
        expect(glow).toBeGreaterThanOrEqual(1 - TRAIL_PULSE_GLOW_ALPHA_SWING - 1e-9);
        expect(glow).toBeLessThanOrEqual(1);
      }
    }
  });

  test('it never allocates per call: the shared scratch record is reused and a caller record is filled in place', () => {
    const a = sampleIridescentTrail(1, 100, false);
    const b = sampleIridescentTrail(2, 200, false);
    expect(a).toBe(b);
    const mine = { core: 0, glow: 0, wave: 0, sheen: 0 };
    expect(sampleIridescentTrail(1, 100, false, mine)).toBe(mine);
    // cheap: a long trail of 1000 resampled segments, redrawn 60 times, is 60k samples
    const start = performance.now();
    for (let i = 0; i < 60000; i += 1) sampleIridescentTrail(i / 16, i * 3, false, mine);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('iridescent trail with reduced motion (and Trail Shine off): a static gradient', () => {
  test('no time term and a constant pulse level: any two times give the same colours', () => {
    for (let d = 0; d < 20; d += 0.7) {
      const t0 = { ...sampleIridescentTrail(d, 0, true, { core: 0, glow: 0, wave: 0, sheen: 0 }) };
      const t1 = { ...sampleIridescentTrail(d, 12345, true, { core: 0, glow: 0, wave: 0, sheen: 0 }) };
      expect(t1).toEqual(t0);
      expect(t0.wave).toBe(TRAIL_PULSE_REDUCED_LEVEL);
    }
    expect(resolveTrailBreath(0, true)).toBe(resolveTrailBreath(99999, true));
    expect(resolveTrailWidthScale(resolveTrailBreath(0, true))).toBe(resolveTrailWidthScale(resolveTrailBreath(1234, true)));
  });

  test('it is still iridescent: the static gradient shifts along the trail (no banding from a frozen wave)', () => {
    const cores = new Set<number>();
    for (let d = 0; d < IRIDESCENT_TRAIL_TILES_PER_SWEEP; d += 0.25) {
      cores.add(sampleIridescentTrail(d, 5000, true, { core: 0, glow: 0, wave: 0, sheen: 0 }).core);
    }
    // out and back: the triangle sweep revisits each colour once, so 32 samples show 17 distinct ones
    expect(cores.size).toBeGreaterThanOrEqual(14);
  });

  test('the scene gates the animation on Trail Shine (which already includes reduced motion) and redraws only while it is on', () => {
    expect(MENU_SCENE).toContain('const trailAnimated = shineEnabled;');
    expect(MENU_SCENE).toContain('resolveTrailBreath(animationTime, !trailAnimated)');
    expect(MENU_SCENE).toContain('return this.settings.toggleTrailPulse && !this.prefersLegacyReducedMotion();');
    // the continuous-redraw cadence that animates the pulse is only armed while the shine/pulse switch is on
    expect(MENU_SCENE).toContain('const active = this.isLegacyTrailShineVisible() && this.overlay === \'none\' && this.trail.length > 1;');
  });

  test('the Guide trail legend uses the same resting palette, frozen (time 0, no pulse)', () => {
    const glyph = MENU_SCENE.slice(MENU_SCENE.indexOf('private drawLegacyOptionsGuideTrailGlyph('));
    expect(glyph.slice(0, 3000)).toContain('resolveIridescentRestingCore(');
    expect(glyph.slice(0, 3000)).toContain(', 0)');
  });
});
