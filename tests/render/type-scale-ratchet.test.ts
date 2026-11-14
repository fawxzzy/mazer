import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  TYPE_BODY_FACE,
  TYPE_BODY_FLOOR_PX,
  TYPE_DISPLAY_FACE,
  TYPE_SCALE,
  TYPE_SCALE_SIZES_PX,
  getTypeScaleStep,
  resolveTypeFaceStack,
  snapToTypeScale
} from '../../src/render/typeScale';

const root = process.cwd();
// Dev-only surfaces are not part of the shipped game UI.
const EXCLUDED = ['src/future-runtime/', 'src/proof-surfaces/', 'src/visual-proof/'];

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|css)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
};

const sourceFiles = [...walk(join(root, 'src')), join(root, 'index.html')]
  .map((file) => relative(root, file).split(sep).join('/'))
  .filter((file) => !EXCLUDED.some((prefix) => file.startsWith(prefix)));

const sources = sourceFiles.map((file) => ({ file, text: readFileSync(join(root, file), 'utf8') }));

const normaliseStack = (stack: string): string => stack.replace(/["']/g, '').replace(/\s*,\s*/g, ', ').trim();

const collectSizes = (): Map<number, string[]> => {
  const found = new Map<number, string[]>();
  const patterns = [/fontSize:\s*['"`](\d+(?:\.\d+)?)px/g, /font-size:\s*(\d+(?:\.\d+)?)px/g];
  for (const { file, text } of sources) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const size = Number(match[1]);
        found.set(size, [...(found.get(size) ?? []), file]);
      }
    }
  }
  return found;
};

const collectStacks = (): Map<string, string[]> => {
  const found = new Map<string, string[]>();
  const patterns = [/[A-Za-z_]*[Ff]ontFamily\s*=\s*'([^']+)'/g, /fontFamily:\s*'([^']+)'/g, /font-family:\s*([^;}\n]+)[;}\n]/g, /--mazer-token-font-[a-z-]+:\s*([^;]+);/g];
  const add = (raw: string, file: string): void => {
    const stack = normaliseStack(raw);
    if (stack === 'inherit' || stack.startsWith('var(')) {
      return;
    }
    found.set(stack, [...(found.get(stack) ?? []), file]);
  };
  for (const { file, text } of sources) {
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        add(match[1], file);
      }
    }
  }
  // Stacks declared once as constants and referenced by name.
  add(readFileSync(join(root, 'src/scenes/MenuScene.ts'), 'utf8').match(/LEGACY_AUTH_UI_FONT_FAMILY = '([^']+)'/)?.[1] ?? '', 'src/scenes/MenuScene.ts');
  found.delete('');
  return found;
};

/**
 * Sizes in shipped source that are still off the scale. Migrations (one surface per PR) delete entries; the test
 * fails when an entry no longer appears (so it must be removed) and when a new off-scale size appears.
 * 9 and 11 are also below the 12 px body floor and are the first to go.
 */
const LEGACY_OFF_SCALE_SIZES_PX = [1, 9, 11, 13, 15, 18] as const;

/** Font stacks still in shipped source besides the two scale faces. Same shrink-only rule. */
const LEGACY_FONT_STACKS = [
  'Segoe UI Variable, Helvetica Neue, Arial, sans-serif',
  'Bahnschrift SemiCondensed, Trebuchet MS, Segoe UI, sans-serif',
  'IBM Plex Mono, ui-monospace, monospace'
] as const;

describe('type scale module', () => {
  test('every step respects the 12 px body floor and sizes ascend', () => {
    expect(TYPE_BODY_FLOOR_PX).toBe(12);
    for (const step of TYPE_SCALE) {
      expect(step.sizePx).toBeGreaterThanOrEqual(TYPE_BODY_FLOOR_PX);
    }
    expect([...TYPE_SCALE_SIZES_PX]).toEqual([...TYPE_SCALE_SIZES_PX].sort((a, b) => a - b));
    expect(new Set(TYPE_SCALE_SIZES_PX).size).toBe(TYPE_SCALE.length);
  });

  test('only the display face is uppercase; body-face steps are sentence case', () => {
    for (const step of TYPE_SCALE) {
      expect(step.uppercase).toBe(step.face === 'display');
    }
    expect(getTypeScaleStep('body').face).toBe('body');
    expect(resolveTypeFaceStack('body')).toBe(TYPE_BODY_FACE);
    expect(resolveTypeFaceStack('display')).toBe(TYPE_DISPLAY_FACE);
    expect(TYPE_DISPLAY_FACE.startsWith('"Oxanium"')).toBe(true);
  });

  test('snapToTypeScale never returns less than the floor and always lands on a step', () => {
    expect(snapToTypeScale(8)).toBe(12);
    expect(snapToTypeScale(NaN)).toBe(12);
    expect(snapToTypeScale(13)).toBe(14);
    expect(snapToTypeScale(40)).toBe(40);
    expect(snapToTypeScale(99)).toBe(40);
    for (const size of [1, 9, 11, 12, 15, 19, 33]) {
      expect(TYPE_SCALE_SIZES_PX).toContain(snapToTypeScale(size));
    }
  });
});

describe('type scale source ratchet (shipped src + index.html)', () => {
  test('no font size outside the scale or the shrink-only legacy list', () => {
    const allowed = new Set<number>([...TYPE_SCALE_SIZES_PX, ...LEGACY_OFF_SCALE_SIZES_PX]);
    const offenders = [...collectSizes()].filter(([size]) => !allowed.has(size));
    expect(offenders.map(([size, files]) => `${size}px in ${[...new Set(files)].join(', ')}`)).toEqual([]);
  });

  test('every legacy off-scale size still exists, so migrated entries are removed', () => {
    const present = new Set(collectSizes().keys());
    expect(LEGACY_OFF_SCALE_SIZES_PX.filter((size) => !present.has(size))).toEqual([]);
  });

  test('any size under the 12 px floor is on the legacy list only', () => {
    const below = [...collectSizes().keys()].filter((size) => size < TYPE_BODY_FLOOR_PX && size !== 1);
    for (const size of below) {
      expect(LEGACY_OFF_SCALE_SIZES_PX as readonly number[]).toContain(size);
    }
  });

  test('font stacks: Space Grotesk body face, optional Oxanium display face, plus the shrink-only legacy list', () => {
    const stacks = [...collectStacks().keys()];
    const allowed = new Set<string>([
      ...LEGACY_FONT_STACKS,
      normaliseStack(TYPE_BODY_FACE),
      normaliseStack(TYPE_DISPLAY_FACE),
      'Space Grotesk, ui-sans-serif, system-ui',
      'Space Grotesk',
      'Oxanium'
    ]);
    expect(stacks.filter((stack) => !allowed.has(stack))).toEqual([]);
    const present = new Set(stacks);
    expect(LEGACY_FONT_STACKS.filter((stack) => !present.has(stack))).toEqual([]);
  });

  test('Oxanium is declared in exactly one place and is the only added face', () => {
    const declaring = sources.filter(({ text }) => /font-family:\s*"Oxanium";/.test(text)).map(({ file }) => file);
    expect(declaring).toEqual(['src/styles/base.css']);
  });
});
