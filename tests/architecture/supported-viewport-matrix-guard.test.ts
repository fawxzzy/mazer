import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * MAZER-QA-006: CI-run guard for the supported viewport matrix. tests/visual/layout-matrix-config.test.ts holds the
 * same pins but is not part of any CI step; this copy lives in tests/architecture, which CI runs.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

interface Viewport { height: number; id: string; label: string; rotateFrom?: { height: number; width: number }; width: number }
interface MatrixConfig {
  LAYOUT_MATRIX_PRESET_GROUPS: Record<string, readonly string[]>;
  resolveLayoutMatrixViewports: (group?: string) => Viewport[];
}

const loadConfig = async (): Promise<MatrixConfig> => (
  // @ts-expect-error The helper module is plain .mjs without TS declarations.
  await import('../../scripts/visual/layout-matrix.config.mjs')
);

const CORE = [
  ['phone-portrait', 390, 844],
  ['phone-tall', 430, 932],
  ['phone-landscape', 844, 390],
  ['tablet-portrait', 768, 1024],
  ['tablet-landscape', 1024, 768],
  ['laptop', 1366, 768],
  ['desktop', 1440, 900],
  ['desktop-wide', 1920, 1080]
] as const;

const SUPPORTED = [
  ['phone-320', 320, 568],
  ['phone-360', 360, 800],
  ['phone-portrait', 390, 844],
  ['phone-tall', 430, 932],
  ['phone-landscape', 844, 390],
  ['phone-rotate-back', 390, 844],
  ['tablet-portrait', 768, 1024],
  ['desktop', 1440, 900]
] as const;

describe('supported viewport matrix guard (MAZER-QA-006)', () => {
  it('keeps the pinned core group unchanged', async () => {
    const { resolveLayoutMatrixViewports } = await loadConfig();
    expect(resolveLayoutMatrixViewports('core').map((v) => [v.id, v.width, v.height])).toEqual(CORE.map((row) => [...row]));
  });

  it('pins the supported group (320, 360, 390, 430, landscape, rotate-back, 768, 1440)', async () => {
    const { resolveLayoutMatrixViewports } = await loadConfig();
    const supported = resolveLayoutMatrixViewports('supported');
    expect(supported.map((v) => [v.id, v.width, v.height])).toEqual(SUPPORTED.map((row) => [...row]));
    const rotate = supported.find((v) => v.id === 'phone-rotate-back');
    expect(rotate?.rotateFrom).toEqual({ width: 844, height: 390 });
    expect(supported.filter((v) => v.rotateFrom).map((v) => v.id)).toEqual(['phone-rotate-back']);
  });

  it('keeps supported-only viewports out of `all`', async () => {
    const { resolveLayoutMatrixViewports } = await loadConfig();
    const all = resolveLayoutMatrixViewports('all').map((v) => v.id);
    expect(all).toHaveLength(14);
    for (const id of ['phone-320', 'phone-360', 'phone-rotate-back']) {
      expect(all).not.toContain(id);
    }
  });

  it('documents every supported viewport id and size in the matrix doc and records Decision A', () => {
    const doc = readFileSync(resolve(repoRoot, 'docs/architecture/MAZER-SUPPORTED-VIEWPORT-MATRIX.md'), 'utf8');
    for (const [id, width, height] of SUPPORTED) {
      expect(doc).toContain(`\`${id}\``);
      expect(doc).toContain(`${width}x${height}`);
    }
    expect(doc).toContain('Decision A');
    expect(doc).toContain('Layout state survives reload');
  });
});
