/**
 * The board layer cost options page (board-cost-options.html) must not change the game: the page is not a build input,
 * and nothing the game ships imports its code or the exact board copy (src/render/exactImageBlit.ts) it installs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';
import { BOARD_COST_VARIANTS, capDevicePixelRatio, findBoardCostVariant } from '../../src/render/boardPerf/boardCostVariants';
import { describeBoardCostMeasurement } from '../../src/render/boardPerf/boardCostMeasurements';

const ROOT = join(__dirname, '..', '..');
const PAGE_ONLY = [join('src', 'render', 'boardPerf') + sep, join('src', 'render', 'exactImageBlit.ts')];

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

describe('board layer cost options page stays out of the game', () => {
  test('the page is not a vite build input and boots its own entry', () => {
    const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(vite).not.toMatch(/board-cost-options/);
    const html = readFileSync(join(ROOT, 'board-cost-options.html'), 'utf8');
    expect(html).toContain('/src/render/boardPerf/boardCostOptionsMain.ts');
    expect(html).toContain('name="robots" content="noindex"');
  });

  test('no game source imports the page code or the exact board copy', () => {
    const offenders = walk(join(ROOT, 'src'))
      .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path))
      .map((path) => relative(ROOT, path))
      .filter((rel) => !PAGE_ONLY.some((own) => rel === own || rel.startsWith(own)))
      .filter((rel) => {
        const text = readFileSync(join(ROOT, rel), 'utf8');
        return /boardPerf\//.test(text) || /exactImageBlit/.test(text);
      });
    expect(offenders).toEqual([]);
  });

  test('options: Today plus A, B, C, each with a look line and a measurement line', () => {
    expect(BOARD_COST_VARIANTS.map((v) => v.id)).toEqual(['today', 'A', 'B', 'C']);
    expect(findBoardCostVariant('nope').id).toBe('today');
    expect(findBoardCostVariant('C')).toMatchObject({ exactBoard: true, canvasScaleCap: 2 });
    for (const variant of BOARD_COST_VARIANTS) {
      expect(variant.look.length).toBeGreaterThan(10);
      expect(describeBoardCostMeasurement(variant.id).length).toBeGreaterThan(0);
    }
  });

  test('the canvas scale cap only ever lowers the ratio', () => {
    expect(capDevicePixelRatio(3, 2)).toBe(2);
    expect(capDevicePixelRatio(1.5, 2)).toBe(1.5);
    expect(capDevicePixelRatio(3, null)).toBe(3);
    expect(capDevicePixelRatio(Number.NaN, 2)).toBe(1);
  });
});
