import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  HUD_ICON_ATLAS_COLUMNS,
  HUD_ICON_CELL_PX,
  HUD_ICON_GLYPH_BOX,
  HUD_ICON_NAMES,
  resolveHudIconCell
} from '../../src/render/hudIconAtlas';

// MAZER-VIS-011 (MenuScene half): the HUD icon crop follows the texture it is drawing.

const menuSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('HUD icon atlas layout (src/render/hudIconAtlas.ts)', () => {
  test('the glyph box sits inside its cell with a margin on every side', () => {
    expect(HUD_ICON_GLYPH_BOX.x).toBeGreaterThan(0);
    expect(HUD_ICON_GLYPH_BOX.y).toBeGreaterThan(0);
    expect(HUD_ICON_GLYPH_BOX.x + HUD_ICON_GLYPH_BOX.width).toBeLessThan(HUD_ICON_CELL_PX);
    expect(HUD_ICON_GLYPH_BOX.y + HUD_ICON_GLYPH_BOX.height).toBeLessThan(HUD_ICON_CELL_PX);
  });

  test('cells tile the atlas in order, left to right then top to bottom, without overlap', () => {
    const seen = new Set<string>();
    HUD_ICON_NAMES.forEach((name, index) => {
      const cell = resolveHudIconCell(name);
      expect(cell).toEqual({
        x: (index % HUD_ICON_ATLAS_COLUMNS) * HUD_ICON_CELL_PX,
        y: Math.floor(index / HUD_ICON_ATLAS_COLUMNS) * HUD_ICON_CELL_PX,
        width: HUD_ICON_CELL_PX,
        height: HUD_ICON_CELL_PX
      });
      seen.add(`${cell.x},${cell.y}`);
    });
    expect(seen.size).toBe(HUD_ICON_NAMES.length);
  });

  test('carries the three header icons plus close, check, info, share and install', () => {
    expect([...HUD_ICON_NAMES]).toEqual(['profile', 'leaderboard', 'settings', 'close', 'check', 'info', 'share', 'install']);
  });
});

describe('MenuScene.applyLegacyHudIconFrame crop', () => {
  test('uses the shared glyph box for a baked HUD_ICON_CELL_PX texture and keeps the bitmap crops for the 1254 px art', () => {
    expect(menuSource).toContain("import { HUD_ICON_CELL_PX, HUD_ICON_GLYPH_BOX } from '../render/hudIconAtlas';");
    expect(menuSource).toContain('const crop = image.width === HUD_ICON_CELL_PX ? MAZER_HUD_BAKED_ICON_METRICS : metrics;');
    expect(menuSource).toContain('bboxWidth: HUD_ICON_GLYPH_BOX.width');
    expect(menuSource).toContain('bboxHeight: HUD_ICON_GLYPH_BOX.height');
    // The existing bitmap crops stay until the BootScene PR swaps the assets (boot-payload-budget pins them to the files).
    expect(menuSource).toContain('const MAZER_HUD_SETTINGS_ICON_METRICS: LegacyHudIconSourceMetrics = { bboxHeight: 828, bboxWidth: 807, bboxX: 221, bboxY: 204 };');
  });
});
