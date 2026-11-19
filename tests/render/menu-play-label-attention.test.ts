import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MENU_PLAY_LABEL_BREATH_PERIOD_MS,
  MENU_PLAY_LABEL_GLOW_BASE_ALPHA,
  MENU_PLAY_LABEL_GLOW_STOPS,
  MENU_PLAY_LABEL_GLOW_TEXTURE_HEIGHT,
  MENU_PLAY_LABEL_GLOW_TEXTURE_KEY,
  MENU_PLAY_LABEL_GLOW_TEXTURE_WIDTH,
  MENU_PLAY_LABEL_STATIC_ATTENTION,
  MENU_PLAY_LABEL_SWEEP_DURATION_MS,
  MENU_PLAY_LABEL_SWEEP_END,
  MENU_PLAY_LABEL_SWEEP_PEAK_MIX,
  MENU_PLAY_LABEL_SWEEP_PERIOD_MS,
  MENU_PLAY_LABEL_SWEEP_START,
  ensureMenuPlayLabelGlowTexture,
  paintMenuPlayLabelGlow,
  resolveMenuPlayLabelAttention,
  resolveMenuPlayLabelBreath,
  resolveMenuPlayLabelGlowRect,
  resolveMenuPlayLabelSweepCenter,
  resolveMenuPlayLabelSweepMix,
  type MenuPlayLabelGlowContext
} from '../../src/render/menuPlayLabelAttention';

// MAZER-UI-094: owner pick "A mixed with C", beat-aligned timings from the options page.
describe('menu play label attention (MAZER-UI-094)', () => {
  it('uses the beat-aligned loops: 2.4 s breath, 3.6 s sweep period, 0.9 s pass', () => {
    expect(MENU_PLAY_LABEL_BREATH_PERIOD_MS).toBe(2400);
    expect(MENU_PLAY_LABEL_SWEEP_PERIOD_MS).toBe(3600);
    expect(MENU_PLAY_LABEL_SWEEP_DURATION_MS).toBe(900);
  });

  it('breathes 1.00 -> 1.04 and back with the glow swelling at the peak, never fully still', () => {
    const trough = resolveMenuPlayLabelAttention(0, false);
    const peak = resolveMenuPlayLabelAttention(1200, false);
    expect(trough.scale).toBe(1);
    expect(trough.glowAlpha).toBeCloseTo(MENU_PLAY_LABEL_GLOW_BASE_ALPHA, 10);
    expect(peak.scale).toBeCloseTo(1.04, 10);
    expect(peak.glowAlpha).toBeCloseTo(0.62, 10);
    expect(resolveMenuPlayLabelAttention(2400, false).scale).toBeCloseTo(1, 10);
    // Symmetric and smooth: equal distance either side of the peak gives the same size.
    expect(resolveMenuPlayLabelAttention(900, false).scale).toBeCloseTo(resolveMenuPlayLabelAttention(1500, false).scale, 10);
    // Never fully still: the scale changes between any two frames 16 ms apart, except right at the turning points.
    for (let t = 50; t < 2400; t += 97) {
      if (Math.abs(t - 1200) < 40) {
        continue;
      }
      expect(resolveMenuPlayLabelAttention(t + 16, false).scale).not.toBe(resolveMenuPlayLabelAttention(t, false).scale);
    }
  });

  it('keeps every frame inside the 1.00..1.04 band and the glow inside 0.12..0.62', () => {
    for (let t = 0; t < 10_000; t += 7) {
      const { scale, glowAlpha } = resolveMenuPlayLabelAttention(t, false);
      expect(scale).toBeGreaterThanOrEqual(1);
      expect(scale).toBeLessThanOrEqual(1.04 + 1e-12);
      expect(glowAlpha).toBeGreaterThanOrEqual(0.12 - 1e-12);
      expect(glowAlpha).toBeLessThanOrEqual(0.62 + 1e-12);
    }
  });

  it('sweeps the band left to right in 0.9 s, then rests until the next 3.6 s pass', () => {
    expect(resolveMenuPlayLabelSweepCenter(0)).toBeCloseTo(MENU_PLAY_LABEL_SWEEP_START, 10);
    expect(resolveMenuPlayLabelSweepCenter(450)).toBeCloseTo(0.5, 10);
    expect(resolveMenuPlayLabelSweepCenter(899.9)).toBeCloseTo(MENU_PLAY_LABEL_SWEEP_END, 3);
    expect(resolveMenuPlayLabelSweepCenter(900)).toBeNull();
    expect(resolveMenuPlayLabelSweepCenter(3599)).toBeNull();
    expect(resolveMenuPlayLabelSweepCenter(3600)).toBeCloseTo(MENU_PLAY_LABEL_SWEEP_START, 10);
    let previous = -Infinity;
    for (let t = 0; t < 900; t += 10) {
      const center = resolveMenuPlayLabelSweepCenter(t)!;
      expect(center).toBeGreaterThanOrEqual(previous);
      previous = center;
    }
    // Rests for 2.7 s of every 3.6 s.
    let resting = 0;
    for (let t = 0; t < 3600; t += 1) {
      if (resolveMenuPlayLabelSweepCenter(t) === null) {
        resting += 1;
      }
    }
    expect(resting).toBe(2700);
  });

  it('mixes white only near the band centre, peaking at 0.7', () => {
    expect(resolveMenuPlayLabelSweepMix(32, 65, null)).toBe(0);
    expect(resolveMenuPlayLabelSweepMix(0, 65, 0)).toBeCloseTo(MENU_PLAY_LABEL_SWEEP_PEAK_MIX, 10);
    const near = resolveMenuPlayLabelSweepMix(4, 65, 0);
    expect(near).toBeGreaterThan(0.1);
    expect(near).toBeLessThan(MENU_PLAY_LABEL_SWEEP_PEAK_MIX);
    // A narrow band: a chip a third of the word away is untouched.
    expect(resolveMenuPlayLabelSweepMix(22, 65, 0)).toBe(0);
    // At the start and end of a pass the band is off the word: every chip keeps its colour.
    for (let column = 0; column < 65; column += 1) {
      expect(resolveMenuPlayLabelSweepMix(column, 65, MENU_PLAY_LABEL_SWEEP_START)).toBe(0);
    }
  });

  it('reduced motion is fully static: exactly the label as it was before the card', () => {
    for (let t = 0; t < 8000; t += 113) {
      expect(resolveMenuPlayLabelAttention(t, true)).toEqual({ scale: 1, glowAlpha: 0, sweepCenter: null });
    }
    expect(MENU_PLAY_LABEL_STATIC_ATTENTION).toEqual({ scale: 1, glowAlpha: 0, sweepCenter: null });
    expect(Object.isFrozen(MENU_PLAY_LABEL_STATIC_ATTENTION)).toBe(true);
  });

  it('handles non-finite and negative time without throwing or jumping out of range', () => {
    expect(resolveMenuPlayLabelBreath(Number.NaN)).toBe(0);
    expect(resolveMenuPlayLabelSweepCenter(Number.POSITIVE_INFINITY)).toBeNull();
    expect(resolveMenuPlayLabelBreath(-1200)).toBeCloseTo(1, 10);
    expect(resolveMenuPlayLabelSweepCenter(-3600)).toBeCloseTo(MENU_PLAY_LABEL_SWEEP_START, 10);
  });

  it('places the glow on whole css px with an even size, so its top-left corner is whole too', () => {
    for (const [cx, cy, w] of [[195, 400, 260], [196.5, 455.25, 263], [206, 431.7, 312], [205.5, 300, 231]] as const) {
      const rect = resolveMenuPlayLabelGlowRect(cx, cy, w);
      expect(Number.isInteger(rect.centerX)).toBe(true);
      expect(Number.isInteger(rect.centerY)).toBe(true);
      expect(rect.width % 2).toBe(0);
      expect(rect.height % 2).toBe(0);
      expect(Number.isInteger(rect.centerX - (rect.width / 2))).toBe(true);
      expect(Number.isInteger(rect.centerY - (rect.height / 2))).toBe(true);
      expect(Math.abs(rect.width - (w * 1.24))).toBeLessThanOrEqual(1);
    }
  });

  it('paints the glow once as a cyan radial gradient that fades to nothing at the edge', () => {
    const calls: string[] = [];
    const stops: [number, string][] = [];
    const context: MenuPlayLabelGlowContext = {
      clearRect: (...args) => calls.push(`clear ${args.join(',')}`),
      createRadialGradient: (...args) => {
        calls.push(`gradient ${args.join(',')}`);
        return { addColorStop: (offset, color) => stops.push([offset, color]) };
      },
      fillStyle: null,
      fillRect: (...args) => calls.push(`fill ${args.join(',')}`),
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      scale: (x, y) => calls.push(`scale ${x},${y}`)
    };
    paintMenuPlayLabelGlow(context);
    expect(calls[0]).toBe(`clear 0,0,${MENU_PLAY_LABEL_GLOW_TEXTURE_WIDTH},${MENU_PLAY_LABEL_GLOW_TEXTURE_HEIGHT}`);
    expect(calls).toContain('scale 1,0.25');
    expect(stops.map(([offset]) => offset)).toEqual(MENU_PLAY_LABEL_GLOW_STOPS.map(([offset]) => offset));
    expect(stops[0][1]).toBe('rgba(107, 232, 225, 0.3)');
    expect(stops[stops.length - 1][1]).toBe('rgba(107, 232, 225, 0)');
    expect(calls[calls.length - 1]).toBe('restore');
  });

  it('creates the glow texture only once per game', () => {
    let created = 0;
    let refreshed = 0;
    const keys = new Set<string>();
    const noop = (): void => undefined;
    const textures = {
      exists: (key: string) => keys.has(key),
      createCanvas: (key: string) => {
        created += 1;
        keys.add(key);
        return {
          getContext: (): MenuPlayLabelGlowContext => ({
            clearRect: noop,
            createRadialGradient: () => ({ addColorStop: noop }),
            fillStyle: null,
            fillRect: noop,
            save: noop,
            restore: noop,
            scale: noop
          }),
          refresh: () => { refreshed += 1; }
        };
      }
    };
    expect(ensureMenuPlayLabelGlowTexture(textures)).toBe(MENU_PLAY_LABEL_GLOW_TEXTURE_KEY);
    expect(ensureMenuPlayLabelGlowTexture(textures)).toBe(MENU_PLAY_LABEL_GLOW_TEXTURE_KEY);
    expect(created).toBe(1);
    expect(refreshed).toBe(1);
    expect(ensureMenuPlayLabelGlowTexture({ exists: () => false, createCanvas: () => null })).toBeNull();
  });

  it('is pure: no Phaser, DOM or randomness', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/render/menuPlayLabelAttention.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]phaser['"]/);
    expect(source).not.toMatch(/Math\.random|Date\.now|performance\.now|document\.|window\./);
  });
});

describe('MenuScene wiring (MAZER-UI-094)', () => {
  const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

  it('drives the label from the pure module inside the existing per-frame updateFrame', () => {
    expect(scene).toContain('const attention = resolveMenuPlayLabelAttention(time, this.prefersLegacyReducedMotion());');
    expect(scene).toContain('panel.setScale(attention.scale);');
  });

  it('scales only the visible label: the tap rectangle and the reported bounds stay put', () => {
    expect(scene).not.toMatch(/background\.setScale\(/);
    expect(scene).toContain('bounds: createVisualRect(x - (width / 2), y - (height / 2), width, height),');
  });

  it('mixes the sweep into the chip colours inside the existing label redraw (no extra draw pass)', () => {
    const start = scene.indexOf('private drawLegacyGlyphWordTileBlock(');
    const body = scene.slice(start, scene.indexOf('\n  }\n', start));
    expect(body).toContain('resolveMenuPlayLabelSweepMix(cell.column, layout.columns, sweepCenter)');
    expect(body).toContain('sweepCenter: number | null = null');
  });
});
