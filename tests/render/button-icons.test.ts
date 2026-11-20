import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  BUTTON_ICON_HUD_TEXTURE_IDS,
  BUTTON_ICON_IDS,
  BUTTON_ICON_PALETTE,
  BUTTON_ICON_SET_ID,
  BUTTON_ICON_SOURCES,
  bakeButtonIconCell,
  drawButtonIconGraphics,
  flattenSvgPath,
  isButtonIconId,
  resolveButtonIconGlyph,
  resolveButtonIconPressedTextureKey,
  resolveMenuToggleDust
} from '../../src/render/buttonIcons';
import { HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX } from '../../src/render/hudIconAtlas';
import { MENU_TOGGLE_INK, drawMenuBurgerGlyph, type MenuBurgerGraphics } from '../../src/render/menuDropdownArt';
import { drawGuideSoundGlyph } from '../../src/render/guideSoundGlyph';
import {
  CLOSED_LEGACY_MENU_DROPDOWN_STATE,
  resolveLegacyMenuBurgerMetrics,
  resolveLegacyMenuBurgerSegments,
  resolveLegacyMenuDropdownProgress,
  setLegacyMenuDropdownOpen
} from '../../src/legacy-runtime/legacyMenuDropdown';
import { RasterContext } from './support/rasterContext';

// MAZER-UI-097: every button icon in the game comes from ONE module (src/render/buttonIcons.ts, C Star Dust), the
// HUD textures are baked from it once at boot, and the menu toggle keeps its hamburger-to-X morph unchanged while
// taking C's strokes and dust.

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

/** Records every call so two paints can be compared exactly. */
class RecordingContext {
  readonly calls: string[] = [];
  private props: Record<string, unknown> = {};
  constructor() {
    return new Proxy(this, {
      get: (target, key: string) => {
        if (key in target) return (target as unknown as Record<string, unknown>)[key];
        if (key in target.props) return target.props[key];
        return (...args: unknown[]) => { target.calls.push(`${key}(${args.map((a) => (typeof a === 'number' ? a.toFixed(4) : String(a))).join(',')})`); };
      },
      set: (target, key: string, value: unknown) => {
        target.props[key] = value;
        target.calls.push(`${key}=${String(value)}`);
        return true;
      }
    });
  }
}

interface GraphicsCall { readonly name: string; readonly args: readonly unknown[] }
const recordingGraphics = (): { graphics: MenuBurgerGraphics & Parameters<typeof drawButtonIconGraphics>[0]; calls: GraphicsCall[] } => {
  const calls: GraphicsCall[] = [];
  const graphics = new Proxy({}, {
    get: (_t, name: string) => (...args: unknown[]) => { calls.push({ args, name }); return graphics; }
  }) as MenuBurgerGraphics & Parameters<typeof drawButtonIconGraphics>[0];
  return { calls, graphics };
};

describe('one icon module: C Star Dust', () => {
  test('is the C set and covers every dropdown/HUD row (19 rows plus menuOpen)', () => {
    expect(BUTTON_ICON_SET_ID).toBe('star-dust-c');
    expect(BUTTON_ICON_IDS).toHaveLength(20);
    for (const id of ['menu', 'menuOpen', 'resume', 'settings', 'guide', 'soundOn', 'soundOff', 'reset', 'home', 'leaderboard', 'profile', 'pause', 'back', 'close', 'signIn', 'eye', 'eyeOff', 'check', 'share', 'install']) {
      expect(isButtonIconId(id), id).toBe(true);
    }
    expect(isButtonIconId('nope')).toBe(false);
  });

  test('the lookup returns a drawable glyph for every id, inside the 24-unit box', () => {
    for (const id of BUTTON_ICON_IDS) {
      const glyph = resolveButtonIconGlyph(id);
      expect(glyph.id).toBe(id);
      expect(glyph.strokes.length + glyph.sparks.length + glyph.dots.length, id).toBeGreaterThan(0);
      for (const stroke of glyph.strokes) {
        expect(stroke.points.length, id).toBeGreaterThanOrEqual(2);
        for (const p of stroke.points) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y), id).toBe(true);
          expect(p.x, id).toBeGreaterThanOrEqual(-0.5);
          expect(p.x, id).toBeLessThanOrEqual(24.5);
          expect(p.y, id).toBeGreaterThanOrEqual(-0.5);
          expect(p.y, id).toBeLessThanOrEqual(24.5);
        }
      }
      // C: one cyan spark (or dot) per icon; Sound off, hide password and close carry none (the options page rule).
      const lineOnly = id === 'soundOff' || id === 'eyeOff' || id === 'close';
      expect(glyph.sparks.length + glyph.dots.length > 0, `${id} dust`).toBe(!lineOnly);
    }
    expect(Object.keys(BUTTON_ICON_SOURCES).sort()).toEqual([...BUTTON_ICON_IDS].sort());
  });

  test('the SVG flattener handles lines, curves and arcs exactly at their endpoints', () => {
    const [line] = flattenSvgPath('M4 6h16');
    expect(line!.points).toEqual([{ x: 4, y: 6 }, { x: 20, y: 6 }]);
    const [arc] = flattenSvgPath('M2 12a10 10 0 0 1 20 0');
    expect(arc!.points[0]).toEqual({ x: 2, y: 12 });
    expect(arc!.points[arc!.points.length - 1]).toEqual({ x: 22, y: 12 });
    // The half circle's top sits 10 units above the chord.
    expect(Math.min(...arc!.points.map((p) => p.y))).toBeCloseTo(2, 1);
    const [closed] = flattenSvgPath('M1 1L5 1L5 5Z');
    expect(closed!.closed).toBe(true);
  });
});

describe('HUD bake (BootScene, once at boot)', () => {
  test('is deterministic: the same id and state issue the same calls and the same pixels', () => {
    for (const id of Object.values(BUTTON_ICON_HUD_TEXTURE_IDS)) {
      for (const state of ['idle', 'pressed'] as const) {
        const a = new RecordingContext();
        const b = new RecordingContext();
        bakeButtonIconCell(a as never, id, HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX, state);
        bakeButtonIconCell(b as never, id, HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX, state);
        expect(a.calls.length).toBeGreaterThan(10);
        expect(a.calls).toEqual(b.calls);
        expect(a.calls[0]).toBe(`clearRect(0.0000,0.0000,${HUD_ICON_CELL_PX.toFixed(4)},${HUD_ICON_CELL_PX.toFixed(4)})`);
      }
    }
    const first = new RasterContext(HUD_ICON_CELL_PX, HUD_ICON_CELL_PX);
    const second = new RasterContext(HUD_ICON_CELL_PX, HUD_ICON_CELL_PX);
    first.paintStrokes = true;
    second.paintStrokes = true;
    bakeButtonIconCell(first, 'settings', HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX, 'idle');
    bakeButtonIconCell(second, 'settings', HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX, 'idle');
    expect(Buffer.from(first.data).equals(Buffer.from(second.data))).toBe(true);
  });

  test('paints only inside the glyph box (so MenuScene crop and sizing are unchanged) and fills most of it', () => {
    for (const id of Object.values(BUTTON_ICON_HUD_TEXTURE_IDS)) {
      const raster = new RasterContext(HUD_ICON_CELL_PX, HUD_ICON_CELL_PX);
      raster.paintStrokes = true;
      bakeButtonIconCell(raster, id, HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX, 'idle');
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      for (let y = 0; y < HUD_ICON_CELL_PX; y += 1) {
        for (let x = 0; x < HUD_ICON_CELL_PX; x += 1) {
          if (raster.pixel(x, y)[3] > 0) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      }
      expect(minX, id).toBeGreaterThanOrEqual(HUD_ICON_GLYPH_BOX.x - 2);
      expect(minY, id).toBeGreaterThanOrEqual(HUD_ICON_GLYPH_BOX.y - 2);
      expect(maxX, id).toBeLessThanOrEqual(HUD_ICON_GLYPH_BOX.x + HUD_ICON_GLYPH_BOX.width + 2);
      expect(maxY, id).toBeLessThanOrEqual(HUD_ICON_GLYPH_BOX.y + HUD_ICON_GLYPH_BOX.height + 2);
      expect(Math.max(maxX - minX, maxY - minY), `${id} optical size`).toBeGreaterThanOrEqual(72);
    }
  });

  test('idle uses C ink, pressed uses C cyan; pressed textures sit beside the idle key', () => {
    const idle = new RecordingContext();
    const pressed = new RecordingContext();
    bakeButtonIconCell(idle as never, 'profile', HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX, 'idle');
    bakeButtonIconCell(pressed as never, 'profile', HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX, 'pressed');
    expect(idle.calls).toContain(`strokeStyle=${BUTTON_ICON_PALETTE.ink}`);
    expect(pressed.calls).toContain(`strokeStyle=${BUTTON_ICON_PALETTE.inkPressed}`);
    expect(resolveButtonIconPressedTextureKey('mazerHudProfile')).toBe('mazerHudProfile:pressed');
  });

  test('BootScene bakes from the icon module (not by tinting the atlas) and MenuScene is not the icon owner', () => {
    const boot = read('src/scenes/BootScene.ts');
    expect(boot).toContain('bakeButtonIconCell(context, BUTTON_ICON_HUD_TEXTURE_IDS[name], HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX, state);');
    const derive = boot.slice(boot.indexOf('private deriveHudIconTextures'), boot.indexOf('private deriveHudIconTextures') + 2400);
    expect(derive).not.toContain('source-in');
    expect(derive).not.toContain('drawImage');
    expect(read('src/scenes/MenuScene.ts')).not.toContain('flattenSvgPath');
  });
});

describe('menu toggle: the hamburger-to-X morph is unchanged, only its look is C', () => {
  const size = 44;
  const lineCalls = (progress: number, pressed = false): GraphicsCall[] => {
    const { calls, graphics } = recordingGraphics();
    drawMenuBurgerGlyph(graphics, 100, 50, size, progress, MENU_TOGGLE_INK, 1, pressed);
    return calls;
  };

  test('every line is drawn at exactly the legacy morph geometry for progress 0..1', () => {
    const metrics = resolveLegacyMenuBurgerMetrics(size);
    for (let i = 0; i <= 20; i += 1) {
      const progress = i / 20;
      const expected = resolveLegacyMenuBurgerSegments(100, 50, metrics.halfWidth, metrics.gap, progress).filter((s) => s.alpha > 0.01);
      const drawn = lineCalls(progress).filter((c) => c.name === 'lineBetween').map((c) => c.args);
      expect(drawn, `progress ${progress}`).toEqual(expected.map((s) => [s.x1, s.y1, s.x2, s.y2]));
    }
  });

  test('closed: three lines with a spark each and no centre dot; open: two crossed lines, no sparks, the centre dot', () => {
    const dust = resolveMenuToggleDust(size);
    const closed = lineCalls(0);
    expect(closed.filter((c) => c.name === 'lineBetween')).toHaveLength(3);
    expect(closed.filter((c) => c.name === 'fillPoints')).toHaveLength(3);
    expect(closed.some((c) => c.name === 'fillCircle' && c.args[0] === 100 && c.args[1] === 50 && c.args[2] === dust.dotRadius)).toBe(false);
    const open = lineCalls(1);
    expect(open.filter((c) => c.name === 'lineBetween')).toHaveLength(2);
    expect(open.filter((c) => c.name === 'fillPoints')).toHaveLength(0);
    expect(open.some((c) => c.name === 'fillCircle' && c.args[0] === 100 && c.args[1] === 50 && c.args[2] === dust.dotRadius)).toBe(true);
    // C line weight on the toggle box.
    expect(closed.find((c) => c.name === 'lineStyle')!.args[0]).toBe(dust.lineWidth);
  });

  test('pressed adds C ring and nothing moves', () => {
    const idle = lineCalls(0.5);
    const pressed = lineCalls(0.5, true);
    expect(pressed.filter((c) => c.name === 'strokeCircle')).toHaveLength(1);
    expect(idle.filter((c) => c.name === 'strokeCircle')).toHaveLength(0);
    expect(pressed.filter((c) => c.name === 'lineBetween').map((c) => c.args))
      .toEqual(idle.filter((c) => c.name === 'lineBetween').map((c) => c.args));
  });

  test('reduced motion: the toggle jumps straight to closed/open, so the morph is never shown mid-way', () => {
    const opened = setLegacyMenuDropdownOpen(CLOSED_LEGACY_MENU_DROPDOWN_STATE, true, 1000, true);
    expect(resolveLegacyMenuDropdownProgress(opened, 1000, true)).toBe(1);
    expect(resolveLegacyMenuDropdownProgress(opened, 1001, true)).toBe(1);
    const closed = setLegacyMenuDropdownOpen(opened, false, 2000, true);
    expect(resolveLegacyMenuDropdownProgress(closed, 2000, true)).toBe(0);
  });

  test('the toggle redraws only when progress, open or pressed changes (bake-once cost)', () => {
    const buttons = read('src/render/menuDropdownButtons.ts');
    expect(buttons).toContain('const key = `${progress.toFixed(3)}|${open}|${pressed}`;');
    expect(buttons).toContain('drawMenuBurgerGlyph(graphics, 0, 0, size, progress, open ? MENU_DROPDOWN_ACCENT : MENU_TOGGLE_INK, 1, pressed);');
  });
});

describe('Guide icons follow the icon set', () => {
  test('the Sound row draws C soundOn (no hand-drawn speaker)', () => {
    const { calls, graphics } = recordingGraphics();
    drawGuideSoundGlyph(graphics, 20, 20, 10, 0xffffff);
    expect(calls.some((c) => c.name === 'strokePoints')).toBe(true);
    expect(calls.some((c) => c.name === 'fillPoints')).toBe(true);
    expect(calls.some((c) => c.name === 'arc')).toBe(false);
    expect(read('src/render/guideSoundGlyph.ts')).toContain("drawButtonIconGraphics(graphics, 'soundOn',");
  });

  test('the Menu row uses the live toggle ink, so the guide and the button stay one draw', () => {
    expect(read('src/scenes/MenuScene.ts')).toContain('drawMenuBurgerGlyph(graphics, centerX, centerY, badgeRadius * 1.3, 0, MENU_TOGGLE_INK);');
  });
});
