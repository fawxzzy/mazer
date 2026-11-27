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

/** One rem is 16 px (no html font-size override in src/styles/base.css). */
const REM_PX = 16;

/**
 * Font sizes written in rem inside the DOM layers (src/ui/**\/*.css), as `file -> px`. The px patterns above never see
 * these, which is how the rating popup and the mode select drifted off the scale (UI audit 2026-11-26).
 */
const collectCssRemSizes = (): Map<string, Set<number>> => {
  const found = new Map<string, Set<number>>();
  for (const { file, text } of sources) {
    if (!file.startsWith('src/ui/') || !file.endsWith('.css')) {
      continue;
    }
    for (const match of text.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d*\.?\d+)rem/g)) {
      const px = Math.round(Number(match[1]) * REM_PX * 100) / 100;
      found.set(file, new Set([...(found.get(file) ?? []), px]));
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
  // MenuScene's stacks come from the shared token (LEGACY_UI_FONT_FAMILY, and the sign-in surface's alias of it): no literal.
  return found;
};

/**
 * Sizes in shipped source that are still off the scale. Migrations (one surface per PR) delete entries; the test
 * fails when an entry no longer appears (so it must be removed) and when a new off-scale size appears.
 * 11 was migrated to 12 in MAZER-UI-010 surface PR 1. 9 is still below the 12 px body floor: it is the two never-populated
 * badge label texts in MenuScene, and the design-token evidence contract (legacy/fontSizePx/micro) cites that literal,
 * so it leaves with the token owner's decision, not in a type-scale PR.
 */
const LEGACY_OFF_SCALE_SIZES_PX = [1, 9, 13, 15, 18] as const;

/**
 * rem font sizes (as px) in src/ui/**\/*.css that are still off the scale, per file. Same shrink-only rule: a migrated
 * entry must be deleted, a new off-scale rem size fails. feedbackPopup.css and modeSelect.css are on the scale
 * (UI consistency batch C). primitives.css holds the kit's own sizes (field labels, helper text, the slider value) that
 * only unmounted kit parts and the options pages use today; gameModeOptions.css is the mode-select proposal page.
 */
const LEGACY_OFF_SCALE_REM_PX: Readonly<Record<string, readonly number[]>> = {
  'src/ui/dom/primitives.css': [11.2, 12.48, 12.8, 13.6, 14.4, 15.2],
  'src/ui/gameModeOptions/gameModeOptions.css': [11.2, 12.48, 13.12, 13.6, 14.4, 15.2, 17.6, 21.6, 24, 83.2]
};

/** Font stacks still in shipped source besides the two scale faces. Same shrink-only rule. */
const LEGACY_FONT_STACKS = [
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

  test('rem font sizes in the DOM layers are on the scale, or on the shrink-only per-file legacy list', () => {
    const scale = new Set<number>(TYPE_SCALE_SIZES_PX);
    const offScale: Record<string, number[]> = {};
    for (const [file, sizes] of collectCssRemSizes()) {
      const off = [...sizes].filter((px) => !scale.has(px)).sort((a, b) => a - b);
      if (off.length > 0) {
        offScale[file] = off;
      }
    }
    const expected = Object.fromEntries(Object.entries(LEGACY_OFF_SCALE_REM_PX).map(([file, sizes]) => [file, [...sizes].sort((a, b) => a - b)]));
    expect(offScale).toEqual(expected);
  });

  test('the rating popup and the mode select hold no off-scale font size at all', () => {
    const sizes = collectCssRemSizes();
    for (const file of ['src/ui/feedback/feedbackPopup.css', 'src/ui/modeSelect/modeSelect.css']) {
      expect([...(sizes.get(file) ?? [])].filter((px) => !TYPE_SCALE_SIZES_PX.includes(px)), file).toEqual([]);
    }
  });

  test('font stacks: Space Grotesk body face, optional Oxanium display face, plus the shrink-only legacy list', () => {
    const stacks = [...collectStacks().keys()];
    const allowed = new Set<string>([
      ...LEGACY_FONT_STACKS,
      normaliseStack(TYPE_BODY_FACE),
      normaliseStack(TYPE_DISPLAY_FACE),
      'Space Grotesk, ui-sans-serif, system-ui',
      // index.html #mazer-boot-fallback (Auth Surface v2 static fallback, #600): a plain stack on purpose, no var(),
      // because the CSS bundle may be missing. Same faces as the body face with a shorter system tail.
      'Space Grotesk, ui-sans-serif, system-ui, sans-serif',
      'Space Grotesk',
      'Oxanium'
    ]);
    expect(stacks.filter((stack) => !allowed.has(stack))).toEqual([]);
    const present = new Set(stacks);
    expect(LEGACY_FONT_STACKS.filter((stack) => !present.has(stack))).toEqual([]);
  });

  test('the sign-in surface uses the shared Space Grotesk stack, not a system stack of its own', () => {
    const menuScene = readFileSync(join(root, 'src/scenes/MenuScene.ts'), 'utf8');
    expect(menuScene).toMatch(/const LEGACY_AUTH_UI_FONT_FAMILY = LEGACY_UI_FONT_FAMILY;/);
    expect(menuScene).not.toContain('Segoe UI Variable');
  });

  test('Oxanium is declared in exactly one place and is the only added face', () => {
    const declaring = sources.filter(({ text }) => /font-family:\s*"Oxanium";/.test(text)).map(({ file }) => file);
    expect(declaring).toEqual(['src/styles/base.css']);
  });
});
