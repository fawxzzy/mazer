import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import {
  HUD_ICON_ATLAS_COLUMNS as SCRIPT_COLUMNS,
  HUD_ICON_ATLAS_PUBLIC_PATH,
  HUD_ICON_CELL_PX as SCRIPT_CELL_PX,
  HUD_ICON_GLYPHS,
  HUD_ICON_GLYPH_BOX as SCRIPT_GLYPH_BOX,
  HUD_ICON_STROKE_PX,
  buildHudIconAtlasWebp,
  hudIconAtlasSize
} from '../../scripts/assets/build-hud-icon-atlas.mjs';
import {
  HUD_ICON_ATLAS_COLUMNS,
  HUD_ICON_ATLAS_PUBLIC_URL,
  HUD_ICON_CELL_PX,
  HUD_ICON_GLYPH_BOX,
  HUD_ICON_NAMES,
  resolveHudIconCell
} from '../../src/render/hudIconAtlas';

// MAZER-VIS-011: one outline icon family in one small atlas, replacing three 1254 px bitmaps.

const root = process.cwd();
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
const ATLAS_BUDGET_BYTES = 100_000;

const decode = async (input: Buffer | string) => sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

describe('HUD icon atlas layout is one contract', () => {
  test('the build script and src/render/hudIconAtlas.ts agree on cell, columns, box and glyph order', () => {
    expect(HUD_ICON_CELL_PX).toBe(SCRIPT_CELL_PX);
    expect(HUD_ICON_ATLAS_COLUMNS).toBe(SCRIPT_COLUMNS);
    expect(HUD_ICON_GLYPH_BOX).toEqual(SCRIPT_GLYPH_BOX);
    expect([...HUD_ICON_NAMES]).toEqual(HUD_ICON_GLYPHS.map(([name]: [string, string]) => name));
    expect(`public${HUD_ICON_ATLAS_PUBLIC_URL}`).toBe(HUD_ICON_ATLAS_PUBLIC_PATH);
  });

  test('carries profile, leaderboard, settings and the missing glyphs (close, check, info, share, install)', () => {
    expect([...HUD_ICON_NAMES]).toEqual(['profile', 'leaderboard', 'settings', 'close', 'check', 'info', 'share', 'install']);
  });
});

describe('the shipped atlas', () => {
  test(`is under ${ATLAS_BUDGET_BYTES} bytes (the three bitmaps it replaced were 1,019,276 B)`, () => {
    expect(statSync(resolve(root, HUD_ICON_ATLAS_PUBLIC_PATH)).size).toBeLessThanOrEqual(ATLAS_BUDGET_BYTES);
  });

  test('is exactly what the build script renders (decoded pixels, so a libwebp byte difference cannot fail it)', async () => {
    const shipped = await decode(resolve(root, HUD_ICON_ATLAS_PUBLIC_PATH));
    const rendered = await decode(await buildHudIconAtlasWebp());
    expect({ width: shipped.info.width, height: shipped.info.height }).toEqual(hudIconAtlasSize());
    expect(Buffer.compare(shipped.data, rendered.data)).toBe(0);
  });

  test('every glyph sits inside the shared glyph box and the three HUD icons share one optical size', async () => {
    const { data, info } = await decode(resolve(root, HUD_ICON_ATLAS_PUBLIC_PATH));
    const bounds = (name: (typeof HUD_ICON_NAMES)[number]) => {
      const cell = resolveHudIconCell(name);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -1;
      let maxY = -1;
      for (let y = cell.y; y < cell.y + cell.height; y += 1) {
        for (let x = cell.x; x < cell.x + cell.width; x += 1) {
          if (data[(y * info.width + x) * 4 + 3] > 8) {
            minX = Math.min(minX, x - cell.x);
            minY = Math.min(minY, y - cell.y);
            maxX = Math.max(maxX, x - cell.x);
            maxY = Math.max(maxY, y - cell.y);
          }
        }
      }
      return { minX, minY, maxX, maxY, longest: Math.max(maxX - minX + 1, maxY - minY + 1) };
    };
    const box = HUD_ICON_GLYPH_BOX;
    for (const name of HUD_ICON_NAMES) {
      const b = bounds(name);
      expect(b.minX, `${name} left`).toBeGreaterThanOrEqual(box.x - 1);
      expect(b.minY, `${name} top`).toBeGreaterThanOrEqual(box.y - 1);
      expect(b.maxX, `${name} right`).toBeLessThanOrEqual(box.x + box.width);
      expect(b.maxY, `${name} bottom`).toBeLessThanOrEqual(box.y + box.height);
    }
    for (const name of ['profile', 'leaderboard', 'settings'] as const) {
      expect(bounds(name).longest, `${name} optical size`).toBeGreaterThanOrEqual(88);
    }
  });

  test('stays legible at 24 css px: the stroke is at least 1.5 css px there, and 4.5 device px on a 3x phone', () => {
    const strokeAt24 = (HUD_ICON_STROKE_PX * 24) / HUD_ICON_GLYPH_BOX.width;
    expect(strokeAt24).toBeGreaterThanOrEqual(1.5);
    expect(strokeAt24 * 3).toBeGreaterThanOrEqual(4.5);
  });
});

describe('BootScene consumes the atlas', () => {
  const bootSource = read('src/scenes/BootScene.ts');

  test('BootScene preloads the one atlas and derives the three textures MenuScene asks for by key', () => {
    expect(bootSource).toContain('HUD_ICON_ATLAS_PUBLIC_URL');
    expect(bootSource).toContain('this.deriveHudIconTextures();');
    expect(bootSource).not.toMatch(/hud-(profile|leaderboard|settings)\.(webp|png)/);
    for (const key of ['MAZER_HUD_PROFILE_TEXTURE_KEY', 'MAZER_HUD_LEADERBOARD_TEXTURE_KEY', 'MAZER_HUD_SETTINGS_TEXTURE_KEY']) {
      expect(bootSource, key).toContain(`export const ${key} =`);
    }
  });
});
