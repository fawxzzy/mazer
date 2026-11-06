import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectOffTokenReport,
  formatReport,
  loadTokenSets,
  scanSource,
  stripComments
} from '../../scripts/report-off-token-literals.mjs';

/*
 * Report-only: these tests pin the METER's behavior, never the repo's counts. The repo is allowed to have
 * any number of off-token literals; the baseline is recorded in the PR body and trends down per wave.
 */
describe('off-token literal report (report-only meter)', () => {
  const sets = loadTokenSets();

  it('strips comments so issue numbers and prose do not count as colours', () => {
    const code = stripComments("// see #345 and #abcdef\nconst a = 'https://x.test/#abc'; /* #123456 */ const b = 1;", '.ts');
    expect(code).not.toContain('#345');
    expect(code).not.toContain('#abcdef');
    expect(code).not.toContain('#123456');
    expect(code).toContain('https://x.test/#abc');
  });

  it('buckets hex literals into canonical, legacy-named and unregistered', () => {
    const source = [
      "const a = '#03070B';", // canonical bg.canvas
      'const b = 0xa7e7d9;', // canonical line.active, numeric form
      "const c = '#ecfff5';", // legacy-named
      "const d = '#123456';", // unregistered
      'const e = 0x000000;' // unregistered + hit-area black
    ].join('\n');
    const { record, hitAreaBlack } = scanSource(source, '.ts', sets);
    expect(record.hexCanonical).toBe(2);
    expect(record.hexLegacyNamed).toBe(1);
    expect(record.hexUnregistered).toBe(2);
    expect(hitAreaBlack).toBe(1);
  });

  it('counts duration literals bound to timing identifiers and splits token-valued from unmapped', () => {
    const source = [
      'export const INTRO_DIGIT_IN_MS = 200;', // equals motion.durationMs.base
      'const holdMs = 777;', // unmapped
      'const spec = { fadeDuration: 1234, delay: 0 };', // unmapped; 0 ignored
      'const total = baseMs * 2;', // not a literal binding
      "const label = 'items: 5';" // not a timing identifier
    ].join('\n');
    const { record } = scanSource(source, '.ts', sets);
    expect(record.durationTokenValued).toBe(1);
    expect(record.durationUnmapped).toBe(2);
  });

  it('counts CSS transition/animation times and token var() uses', () => {
    const css = '.a { transition: opacity 120ms ease; color: var(--mazer-token-color-text-primary); }\n.b { animation: pulse 1.4s ease-in-out; }';
    const { record, tokenReferences } = scanSource(css, '.css', sets);
    expect(record.durationTokenValued).toBe(1); // 120ms equals motion.durationMs.fast
    expect(record.durationUnmapped).toBe(1); // 1400ms
    expect(tokenReferences).toBe(1);
  });

  it('is deterministic, internally consistent, and excludes src/theme', () => {
    const root = mkdtempSync(join(tmpdir(), 'mazer-offtoken-'));
    try {
      mkdirSync(join(root, 'src', 'theme'), { recursive: true });
      mkdirSync(join(root, 'src', 'a'), { recursive: true });
      mkdirSync(join(root, 'docs', 'contracts'), { recursive: true });
      writeFileSync(join(root, 'src', 'theme', 'ignored.ts'), "export const x = '#abcdef';\n");
      writeFileSync(join(root, 'src', 'a', 'one.ts'), "import { designTokens } from '../theme/tokens';\nconst y = '#abcdef'; const slowMs = 999;\n");
      const report = collectOffTokenReport(root, { tokenSets: sets });
      expect(report).toEqual(collectOffTokenReport(root, { tokenSets: sets }));
      expect(report.scope.filesScanned).toBe(1);
      expect(report.colors.hexLiteralsTotal).toBe(1);
      expect(report.colors.unregistered).toBe(1);
      expect(report.durations.unmapped).toBe(1);
      expect(report.tokenReferences.filesImportingTokens).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs against the real src tree and reports a self-consistent baseline without asserting counts', () => {
    const report = collectOffTokenReport();
    expect(report.scope.filesScanned).toBeGreaterThan(0);
    const { colors, durations } = report;
    expect(colors.canonical + colors.legacyNamed + colors.unregistered).toBe(colors.hexLiteralsTotal);
    expect(colors.offToken).toBe(colors.legacyNamed + colors.unregistered);
    expect(durations.tokenValued + durations.unmapped).toBe(durations.literalsTotal);
    expect(formatReport(report)).toContain('report-only');
  });
});
