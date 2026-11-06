#!/usr/bin/env node
/**
 * Mazer UI rework -- Wave 1B migration meter (REPORT ONLY, never a gate).
 *
 * Counts, under src/ (excluding src/theme/, which defines the tokens), how many colour and duration
 * literals are still hard-coded instead of coming from docs/contracts/mazer-ui-rework-design-tokens.v1.json,
 * so per-wave migration progress is measurable. Always exits 0.
 *
 *   node scripts/report-off-token-literals.mjs            human-readable summary
 *   node scripts/report-off-token-literals.mjs --json     machine-readable (stable key order)
 *   node scripts/report-off-token-literals.mjs --top 25   longer per-file offender list
 *
 * Method (deliberately simple and deterministic; counts are for trend, not for correctness proofs):
 *  - comments are stripped first (// and block comments in .ts, block comments in .css) so issue numbers
 *    such as "#345" and prose never count;
 *  - colours: "#rgb"/"#rrggbb" string/CSS literals and "0xRRGGBB" numeric literals. Each is bucketed as
 *      canonical    equals a value in tokens.color
 *      legacyNamed  equals a value in tokens.legacy.color (named, migration pending)
 *      unregistered equals no token value
 *    "offToken" = legacyNamed + unregistered (comparable with the 2026-11-06 audit figure). Every literal
 *    is still hard-coded, including canonical-valued ones: the migration meter is hexLiteralsTotal +
 *    durations.literalsTotal falling toward zero while tokenReferences grows. Invisible hit-area fills (0x000000 / #000000) are included in
 *    the counts and also broken out as hitAreaBlack so the visible figure can be read off.
 *  - durations: numeric literals bound to an identifier ending in Ms / MS / Duration / Delay / Period /
 *    Interval / Hold (any of `name: 120`, `name = 120`), plus "<n>ms" / "<n>s" inside CSS transition and
 *    animation declarations. Literals 0 and 1 are ignored. A literal whose value equals a registered
 *    motion token is "tokenValued" (a trivial migration); the rest are "unmapped". Neither is a token
 *    reference: migration progress means these totals shrinking and tokenReferences growing.
 *  - tokenReferences: files importing src/theme/tokens (or the cyberArcadeMaterial facade) and uses of
 *    var(--mazer-token-*) in CSS.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_PATH = 'docs/contracts/mazer-ui-rework-design-tokens.v1.json';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const DURATION_NAME = '[A-Za-z_$][\\w$]*(?:Ms|MS|Duration|Delay|Period|Interval|Hold|duration|delay|period|interval|hold)';

const normalizeHex = (raw) => {
  let hex = raw.replace(/^(#|0x)/i, '').toLowerCase();
  if (hex.length === 3) {
    hex = hex.split('').map((digit) => digit + digit).join('');
  }
  return hex;
};

export const stripComments = (source, extension) => {
  // Block comments first, then // line comments that are not part of a URL scheme (":" before "//").
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '));
  if (extension === '.css') {
    return withoutBlocks;
  }
  return withoutBlocks.replace(/(^|[^:\\'"`])\/\/[^\n]*/g, (_match, lead) => lead);
};

const collectNumbers = (value, into) => {
  if (typeof value === 'number') {
    into.add(value);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      collectNumbers(child, into);
    }
  }
};

export const loadTokenSets = (root = repoRoot) => {
  const registry = JSON.parse(readFileSync(resolve(root, TOKENS_PATH), 'utf8'));
  const tokens = registry.tokens;
  const canonical = new Set(Object.values(tokens.color).map(normalizeHex));
  const legacy = new Set(Object.values(tokens.legacy?.color ?? {}).map(normalizeHex));
  const motionValues = new Set();
  collectNumbers(tokens.motionMs, motionValues);
  collectNumbers({ ...tokens.motion, easing: undefined }, motionValues);
  return { canonical, legacy, motionValues };
};

const walk = (dir, out) => {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, out);
    } else if (SOURCE_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) {
      out.push(full);
    }
  }
};

const emptyFileRecord = () => ({
  hexCanonical: 0,
  hexLegacyNamed: 0,
  hexUnregistered: 0,
  durationTokenValued: 0,
  durationUnmapped: 0
});

export const scanSource = (source, extension, sets) => {
  const code = stripComments(source, extension);
  const record = emptyFileRecord();
  let hitAreaBlack = 0;

  const classifyHex = (raw) => {
    const hex = normalizeHex(raw);
    if (hex === '000000') {
      hitAreaBlack += 1;
    }
    if (sets.canonical.has(hex)) {
      record.hexCanonical += 1;
    } else if (sets.legacy.has(hex)) {
      record.hexLegacyNamed += 1;
    } else {
      record.hexUnregistered += 1;
    }
  };

  for (const match of code.matchAll(/(?<![\w&#])#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w])/g)) {
    classifyHex(match[0]);
  }
  for (const match of code.matchAll(/(?<![\w])0x[0-9a-fA-F]{6}(?![\w])/g)) {
    classifyHex(match[0]);
  }

  const classifyDuration = (rawValue) => {
    const value = Number(rawValue.replace(/_/g, ''));
    if (!Number.isFinite(value) || value <= 1) {
      return;
    }
    if (sets.motionValues.has(value)) {
      record.durationTokenValued += 1;
    } else {
      record.durationUnmapped += 1;
    }
  };

  const bound = new RegExp(`(?<![\\w$.])${DURATION_NAME}\\s*(?::|=(?!=))\\s*(\\d[\\d_]*(?:\\.\\d+)?)(?![\\w.]|\\s*[*/+\\-%])`, 'g');
  for (const match of code.matchAll(bound)) {
    classifyDuration(match[1]);
  }

  if (extension === '.css') {
    for (const line of code.split('\n')) {
      if (!/\b(?:transition|animation)(?:-duration|-delay)?\s*:/.test(line)) {
        continue;
      }
      for (const match of line.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)(ms|s)\b/g)) {
        classifyDuration(String(match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1])));
      }
    }
  }

  let tokenReferences = 0;
  if (extension === '.css') {
    tokenReferences = (code.match(/var\(--mazer-token-/g) ?? []).length;
  } else if (/from\s+['"][./]*(?:[\w-]+\/)*theme\/tokens['"]/.test(code) || /from\s+['"][./]*(?:[\w-]+\/)*cyberArcadeMaterial['"]/.test(code)) {
    tokenReferences = 1;
  }

  return { record, hitAreaBlack, tokenReferences };
};

const sumRecords = (records) => records.reduce((total, record) => {
  for (const key of Object.keys(total)) {
    total[key] += record[key];
  }
  return total;
}, emptyFileRecord());

export const collectOffTokenReport = (root = repoRoot, options = {}) => {
  const srcDir = resolve(root, options.srcDir ?? 'src');
  const excluded = (options.excludeDirs ?? ['theme']).map((dir) => join(srcDir, dir) + sep);
  const sets = options.tokenSets ?? loadTokenSets(root);
  const files = [];
  if (existsSync(srcDir)) {
    walk(srcDir, files);
  }

  const perFile = [];
  let hitAreaBlack = 0;
  let tokenReferenceFiles = 0;
  let cssTokenUses = 0;

  for (const file of files) {
    if (excluded.some((prefix) => file.startsWith(prefix))) {
      continue;
    }
    const extension = file.slice(file.lastIndexOf('.'));
    const { record, hitAreaBlack: black, tokenReferences } = scanSource(readFileSync(file, 'utf8'), extension, sets);
    hitAreaBlack += black;
    if (extension === '.css') {
      cssTokenUses += tokenReferences;
    } else {
      tokenReferenceFiles += tokenReferences;
    }
    perFile.push({ file: relative(root, file).split(sep).join('/'), ...record });
  }

  const totals = sumRecords(perFile);
  const hexTotal = totals.hexCanonical + totals.hexLegacyNamed + totals.hexUnregistered;
  const hexOffToken = totals.hexLegacyNamed + totals.hexUnregistered;
  const durationTotal = totals.durationTokenValued + totals.durationUnmapped;

  const offenderScore = (entry) => entry.hexLegacyNamed + entry.hexUnregistered + entry.durationTokenValued + entry.durationUnmapped;
  const topOffenders = [...perFile]
    .filter((entry) => offenderScore(entry) > 0)
    .sort((a, b) => offenderScore(b) - offenderScore(a) || a.file.localeCompare(b.file))
    .slice(0, options.top ?? 10)
    .map((entry) => ({ file: entry.file, offToken: offenderScore(entry) }));

  return {
    scope: { root: 'src', excludedDirs: options.excludeDirs ?? ['theme'], filesScanned: perFile.length },
    colors: {
      hexLiteralsTotal: hexTotal,
      canonical: totals.hexCanonical,
      legacyNamed: totals.hexLegacyNamed,
      unregistered: totals.hexUnregistered,
      offToken: hexOffToken,
      offTokenPercent: hexTotal === 0 ? 0 : Math.round((hexOffToken / hexTotal) * 1000) / 10,
      hitAreaBlack
    },
    durations: {
      literalsTotal: durationTotal,
      tokenValued: totals.durationTokenValued,
      unmapped: totals.durationUnmapped
    },
    tokenReferences: { filesImportingTokens: tokenReferenceFiles, cssVarUses: cssTokenUses },
    topOffenders
  };
};

export const formatReport = (report) => [
  'Mazer off-token literal report (report-only; this is not a gate)',
  `scope: ${report.scope.root}/ excluding [${report.scope.excludedDirs.join(', ')}], ${report.scope.filesScanned} files`,
  `colors: ${report.colors.hexLiteralsTotal} hex literals, ${report.colors.canonical} canonical, `
    + `${report.colors.legacyNamed} legacy-named, ${report.colors.unregistered} unregistered `
    + `(off-token ${report.colors.offToken} = ${report.colors.offTokenPercent}%; of which black hit-area fills ${report.colors.hitAreaBlack})`,
  `durations: ${report.durations.literalsTotal} literals, ${report.durations.tokenValued} equal a motion token value, ${report.durations.unmapped} unmapped`,
  `token references: ${report.tokenReferences.filesImportingTokens} source files import the token module, ${report.tokenReferences.cssVarUses} var(--mazer-token-*) uses in CSS`,
  'migration meter: hex literals + duration literals should fall toward 0 (outside src/theme) as call sites adopt tokens',
  'top offenders (off-token colour + duration literals):',
  ...report.topOffenders.map((entry) => `  ${String(entry.offToken).padStart(4)}  ${entry.file}`)
].join('\n');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const topIndex = args.indexOf('--top');
  const top = topIndex >= 0 ? Number(args[topIndex + 1]) || 10 : 10;
  const report = collectOffTokenReport(repoRoot, { top });
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
}
