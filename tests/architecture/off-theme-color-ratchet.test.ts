import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTokenSets, scanSource } from '../../scripts/report-off-token-literals.mjs';

/*
 * MAZER-UI-013 ratchet (lint half of the card): colour literals ("#rgb", "#rrggbb", "0xRRGGBB") are counted per
 * src/ file and a file may never hold more OFF-THEME literals than its committed baseline. New files start at zero.
 * Off-theme = the value is not one of the canonical theme colours in the design-token contract (legacy-named or
 * unregistered values). A literal that equals a canonical value is on-theme, so it is recorded (`total`) but not gated.
 *
 * This is a one-way ratchet, not a migration: it does not map any colour onto a theme value (that is the
 * per-file work the baseline's `migrationOrder` orders), it only stops the count from growing while that work
 * happens. Lowering a count never fails; commit the lower number so the gain is locked in:
 *
 *   MAZER_UPDATE_OFF_THEME_BASELINE=1 npx vitest run tests/architecture/off-theme-color-ratchet.test.ts
 *
 * Method is the shared meter in scripts/report-off-token-literals.mjs (comments stripped first). `offToken` counts the
 * legacy-named plus unregistered values, the figure the 2026-11-06 audit quoted, and is what the ratchet gates.
 * `total` also counts canonical-valued literals (still hard-coded, a trivial later migration) and is informational.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const BASELINE_PATH = resolve(repoRoot, 'tests/fixtures/off-theme-color-baseline.json');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.css'];

/** Files that DEFINE colour values. Everything else must reference them. */
const OFF_THEME_ALLOWLIST_FILES = [
  'src/render/palette.ts',
  'src/render/trailPalette.ts'
] as const;
/** Prefix allowlist: src/theme/tokens.ts and src/theme/tokens.css. */
const OFF_THEME_ALLOWLIST_PREFIXES = ['src/theme/tokens.'] as const;

const isAllowlisted = (path: string): boolean => (
  (OFF_THEME_ALLOWLIST_FILES as readonly string[]).includes(path)
  || OFF_THEME_ALLOWLIST_PREFIXES.some((prefix) => path.startsWith(prefix))
);

interface FileCount { offToken: number; total: number }

const walk = (dir: string, out: string[]): void => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      out.push(full);
    }
  }
};

const countAllFiles = (): Record<string, FileCount> => {
  const sets = loadTokenSets(repoRoot);
  const files: string[] = [];
  walk(resolve(repoRoot, 'src'), files);
  const counts: Record<string, FileCount> = {};
  for (const file of files) {
    const path = relative(repoRoot, file).split(sep).join('/');
    if (isAllowlisted(path)) {
      continue;
    }
    const extension = file.slice(file.lastIndexOf('.'));
    const { record } = scanSource(readFileSync(file, 'utf8'), extension, sets);
    const total = record.hexCanonical + record.hexLegacyNamed + record.hexUnregistered;
    if (total > 0) {
      counts[path] = { offToken: record.hexLegacyNamed + record.hexUnregistered, total };
    }
  }
  return counts;
};

interface Baseline {
  allowlist: string[];
  files: Record<string, FileCount>;
  migrationOrder: string[];
  schemaVersion: number;
  totals: FileCount & { files: number };
}

const sortedEntries = (files: Record<string, FileCount>): Array<[string, FileCount]> => (
  Object.entries(files).sort((left, right) => left[0].localeCompare(right[0]))
);

const buildBaseline = (counts: Record<string, FileCount>): Baseline => {
  const files = Object.fromEntries(sortedEntries(counts));
  const entries = Object.entries(files);
  // Cheapest, least contended files first; the god-scene last so it is migrated with the rest already done.
  const migrationOrder = entries
    .filter(([path, count]) => path !== 'src/scenes/MenuScene.ts' && count.offToken > 0)
    .sort((left, right) => left[1].offToken - right[1].offToken || left[0].localeCompare(right[0]))
    .map(([path]) => path);
  if (files['src/scenes/MenuScene.ts']?.offToken > 0) {
    migrationOrder.push('src/scenes/MenuScene.ts');
  }
  return {
    allowlist: [...OFF_THEME_ALLOWLIST_FILES, ...OFF_THEME_ALLOWLIST_PREFIXES.map((prefix) => `${prefix}*`)],
    files,
    migrationOrder,
    schemaVersion: 1,
    totals: {
      files: entries.length,
      offToken: entries.reduce((sum, [, count]) => sum + count.offToken, 0),
      total: entries.reduce((sum, [, count]) => sum + count.total, 0)
    }
  };
};

describe('off-theme colour literal ratchet (MAZER-UI-013)', () => {
  it('counts #rgb, #rrggbb and 0xRRGGBB literals, ignores comments, and buckets them against the token sets', () => {
    const sets = loadTokenSets(repoRoot);
    const { record } = scanSource(
      [
        "const canonical = '#03070B';", // bg.canvas
        'const numeric = 0x39f58a;', // semantic.energy
        "const legacy = '#02080f';", // legacy bg.page
        "const stray = '#123456'; const short = '#abc';",
        "// ignored: '#abcdef' and issue #345",
        '/* ignored 0xabcdef */'
      ].join('\n'),
      '.ts',
      sets
    );
    expect(record.hexCanonical).toBe(2);
    expect(record.hexLegacyNamed).toBe(1);
    expect(record.hexUnregistered).toBe(2);
  });

  it('allowlists exactly the files that define colours and nothing else', () => {
    expect(isAllowlisted('src/render/palette.ts')).toBe(true);
    expect(isAllowlisted('src/render/trailPalette.ts')).toBe(true);
    expect(isAllowlisted('src/theme/tokens.ts')).toBe(true);
    expect(isAllowlisted('src/theme/tokens.css')).toBe(true);
    expect(isAllowlisted('src/scenes/MenuScene.ts')).toBe(false);
    expect(isAllowlisted('src/render/boardRenderer.ts')).toBe(false);
    for (const allowed of OFF_THEME_ALLOWLIST_FILES) {
      expect(existsSync(resolve(repoRoot, allowed))).toBe(true);
    }
    expect(existsSync(resolve(repoRoot, 'src/theme/tokens.ts'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'src/theme/tokens.css'))).toBe(true);
  });

  it('never lets a src file hold more colour literals than its committed baseline', () => {
    const counts = countAllFiles();

    if (process.env.MAZER_UPDATE_OFF_THEME_BASELINE === '1') {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(buildBaseline(counts), null, 2)}\n`, 'utf8');
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    expect(baseline.schemaVersion).toBe(1);

    const violations: string[] = [];
    for (const [path, count] of sortedEntries(counts)) {
      const allowed = baseline.files[path] ?? { offToken: 0, total: 0 };
      if (count.offToken > allowed.offToken) {
        violations.push(
          `${path}: ${count.offToken} off-theme colour literals, baseline ${allowed.offToken}. `
          + 'Use a value from src/theme/tokens.ts or src/render/palette.ts instead of a new literal.'
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the committed baseline well-formed: no allowlisted files, totals add up, migration order covers every file with off-theme literals, MenuScene last', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    const entries = Object.entries(baseline.files);

    for (const [path, count] of entries) {
      expect(isAllowlisted(path)).toBe(false);
      expect(count.total).toBeGreaterThan(0);
      expect(count.offToken).toBeLessThanOrEqual(count.total);
    }
    expect(baseline.totals.files).toBe(entries.length);
    expect(baseline.totals.total).toBe(entries.reduce((sum, [, count]) => sum + count.total, 0));
    expect(baseline.totals.offToken).toBe(entries.reduce((sum, [, count]) => sum + count.offToken, 0));
    expect([...baseline.migrationOrder].sort()).toEqual(
      entries.filter(([, count]) => count.offToken > 0).map(([path]) => path).sort()
    );
    if (baseline.files['src/scenes/MenuScene.ts']) {
      expect(baseline.migrationOrder.at(-1)).toBe('src/scenes/MenuScene.ts');
    }
  });
});
