import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ASSET_FORMATS,
  ASSET_KINDS,
  ASSET_MANIFEST_SCHEMA_VERSION,
  ASSET_ORIGINS,
  ASSET_STATUSES,
  buildAssetIndex
} from '../../src/domain/assets/assetManifest.ts';

interface Violation { rule: string; path: string; message: string }
interface ValidatorModule {
  ASSET_MANIFEST_SCHEMA_VERSION: number;
  ASSET_KINDS: readonly string[];
  ASSET_FORMATS: readonly string[];
  ASSET_STATUSES: readonly string[];
  ASSET_ORIGINS: readonly string[];
  ASSET_KIND_RULES: Record<string, { formats: readonly string[]; maxBytes: number }>;
  collectAssetManifestViolations: (manifest: unknown, options?: { root?: string; checkFiles?: boolean }) => Violation[];
  validateAssetManifestFile: (path: string) => { manifestPath: string; violations: Violation[] };
}

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(here, '../fixtures/assets/example');
const SCRIPT_PATH = resolve(here, '../../scripts/assets/validate-asset-manifest.mjs');
const loadValidator = async (): Promise<ValidatorModule> => (
  import('../../scripts/assets/validate-asset-manifest.mjs') as Promise<ValidatorModule>
);

const sha = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const rules = (violations: Violation[]): string[] => violations.map((entry) => entry.rule);

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});
const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'mazer-asset-test-'));
  tempDirs.push(dir);
  return dir;
};

const baseEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'test.audio.blip',
  kind: 'audio',
  path: 'audio/blip.ogg',
  format: 'ogg',
  bytes: 8,
  sha256: sha(Buffer.from('OggS-test')),
  source: { origin: 'handcrafted', reference: 'unit test', createdOn: '2026-11-05' },
  license: { id: 'LicenseRef-Mazer-Owned' },
  author: 'tester',
  status: 'draft',
  ...overrides
});

/** Writes a file into a temp root and returns a manifest whose single entry matches it exactly. */
const manifestWithFile = (relativePath: string, content: Buffer, overrides: Record<string, unknown> = {}) => {
  const root = makeTempDir();
  mkdirSync(dirname(join(root, relativePath)), { recursive: true });
  writeFileSync(join(root, relativePath), content);
  const manifest = {
    schemaVersion: 1,
    assets: [baseEntry({ path: relativePath, bytes: content.length, sha256: sha(content), ...overrides })]
  };
  return { root, manifest };
};

const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(12, 1)]);

describe('asset manifest validator', () => {
  it('accepts the shipped example fixture', async () => {
    const { validateAssetManifestFile } = await loadValidator();
    const result = validateAssetManifestFile(join(FIXTURE_DIR, 'manifest.json'));
    expect(result.violations).toEqual([]);
  });

  it('accepts a minimal audio entry (no dimensions) and rejects the same entry with dimensions', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    const ok = manifestWithFile('audio/blip.ogg', OGG);
    expect(collectAssetManifestViolations(ok.manifest, { root: ok.root })).toEqual([]);
    const bad = manifestWithFile('audio/blip.ogg', OGG, { dimensions: { width: 1, height: 1 } });
    expect(rules(collectAssetManifestViolations(bad.manifest, { root: bad.root }))).toEqual(['dimensions-not-allowed']);
  });

  it('keeps its constants in sync with src/domain/assets/assetManifest.ts', async () => {
    const validator = await loadValidator();
    expect(validator.ASSET_MANIFEST_SCHEMA_VERSION).toBe(ASSET_MANIFEST_SCHEMA_VERSION);
    expect([...validator.ASSET_KINDS]).toEqual([...ASSET_KINDS]);
    expect([...validator.ASSET_FORMATS]).toEqual([...ASSET_FORMATS]);
    expect([...validator.ASSET_STATUSES]).toEqual([...ASSET_STATUSES]);
    expect([...validator.ASSET_ORIGINS]).toEqual([...ASSET_ORIGINS]);
    expect(Object.keys(validator.ASSET_KIND_RULES).sort()).toEqual([...ASSET_KINDS].sort());
    for (const rule of Object.values(validator.ASSET_KIND_RULES)) {
      for (const format of rule.formats) expect(ASSET_FORMATS).toContain(format);
    }
  });

  it('is deterministic: identical input yields identical, sorted output', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    const { root, manifest } = manifestWithFile('audio/blip.ogg', OGG);
    const broken = clone(manifest) as any;
    broken.assets[0].sha256 = '0'.repeat(64);
    broken.assets[0].license = {};
    broken.assets.push(clone(broken.assets[0]));
    broken.assets[1].id = 'test.audio.other';
    const first = collectAssetManifestViolations(broken, { root });
    const second = collectAssetManifestViolations(clone(broken), { root });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const keys = first.map((entry) => `${entry.path}|${entry.rule}|${entry.message}`);
    expect([...keys].sort()).toEqual(keys);
  });

  it('reports a missing file', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    const { root, manifest } = manifestWithFile('audio/blip.ogg', OGG);
    (manifest.assets[0] as any).path = 'audio/gone.ogg';
    expect(rules(collectAssetManifestViolations(manifest, { root }))).toEqual(['missing-file']);
  });

  it('reports hash and size mismatches', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    const { root, manifest } = manifestWithFile('audio/blip.ogg', OGG);
    (manifest.assets[0] as any).sha256 = 'f'.repeat(64);
    (manifest.assets[0] as any).bytes = OGG.length + 1;
    expect(rules(collectAssetManifestViolations(manifest, { root })).sort()).toEqual(['hash-mismatch', 'size-mismatch']);
  });

  it('reports oversized assets from declared and actual size', async () => {
    const { collectAssetManifestViolations, ASSET_KIND_RULES } = await loadValidator();
    const big = Buffer.concat([OGG, Buffer.alloc(ASSET_KIND_RULES.audio.maxBytes)]);
    const { root, manifest } = manifestWithFile('audio/blip.ogg', big);
    expect(rules(collectAssetManifestViolations(manifest, { root }))).toEqual(['oversized-asset']);

    // Declared size lies low but the file on disk is over the limit: reported once, plus the size mismatch.
    (manifest.assets[0] as any).bytes = OGG.length;
    expect(rules(collectAssetManifestViolations(manifest, { root })).sort()).toEqual(['oversized-asset', 'size-mismatch']);
  });

  it('reports a format that is not allowed for the kind and an extension mismatch', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    const { root, manifest } = manifestWithFile('audio/blip.ogg', OGG, { format: 'png' });
    const found = rules(collectAssetManifestViolations(manifest, { root }));
    expect(found).toContain('format-not-allowed');
    expect(found).toContain('extension-mismatch');
  });

  it('reports malformed content behind a valid-looking name', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    const { root, manifest } = manifestWithFile('audio/blip.ogg', Buffer.from('not an ogg file at all'));
    expect(rules(collectAssetManifestViolations(manifest, { root }))).toEqual(['malformed-asset']);
  });

  it('reports PNG dimension disagreement and missing dimensions for raster kinds', async () => {
    const { collectAssetManifestViolations, validateAssetManifestFile } = await loadValidator();
    const root = FIXTURE_DIR;
    const fixture = validateAssetManifestFile(join(root, 'manifest.json'));
    expect(fixture.violations).toEqual([]);

    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    manifest.assets[0].dimensions = { width: 32, height: 32 };
    delete manifest.assets[1].dimensions;
    expect(rules(collectAssetManifestViolations(manifest, { root })).sort()).toEqual(['dimensions-mismatch', 'missing-dimensions']);
  });

  it('reports duplicate ids and duplicate paths', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    const { root, manifest } = manifestWithFile('audio/blip.ogg', OGG);
    manifest.assets.push(clone(manifest.assets[0]));
    const found = rules(collectAssetManifestViolations(manifest, { root }));
    expect(found).toContain('duplicate-id');
    expect(found).toContain('duplicate-path');
  });

  it('requires license, author, and source provenance', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    const { root, manifest } = manifestWithFile('audio/blip.ogg', OGG);
    const entry = manifest.assets[0] as any;
    delete entry.license;
    entry.author = '  ';
    delete entry.source;
    expect(rules(collectAssetManifestViolations(manifest, { root })).sort()).toEqual(['missing-author', 'missing-license', 'missing-source']);
  });

  it('rejects unsafe paths without touching the filesystem', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    for (const path of ['../escape.ogg', '/abs/blip.ogg', 'C:/abs/blip.ogg', 'audio\\blip.ogg', 'audio//blip.ogg']) {
      const violations = collectAssetManifestViolations({ schemaVersion: 1, assets: [baseEntry({ path })] }, { root: makeTempDir() });
      expect(rules(violations), path).toContain('unsafe-path');
      expect(rules(violations), path).not.toContain('missing-file');
    }
  });

  it('rejects unknown fields, bad enums, and unsupported schema versions', async () => {
    const { collectAssetManifestViolations } = await loadValidator();
    const violations = collectAssetManifestViolations({
      schemaVersion: 2,
      extra: true,
      assets: [baseEntry({ kind: 'sprite', status: 'live', surprise: 1, id: 'Bad Id' })]
    }, { checkFiles: false });
    expect(rules(violations)).toEqual(expect.arrayContaining([
      'unsupported-schema-version', 'unknown-manifest-field', 'invalid-kind', 'invalid-status', 'unknown-asset-field', 'invalid-id'
    ]));
  });

  it('exposes a CLI that exits 0 on the fixture, 1 on violations, and 2 without arguments', () => {
    const ok = spawnSync(process.execPath, [SCRIPT_PATH, '--manifest', join(FIXTURE_DIR, 'manifest.json')], { encoding: 'utf8' });
    expect(ok.status).toBe(0);

    const dir = makeTempDir();
    const manifestPath = join(dir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, assets: [baseEntry()] }));
    const bad = spawnSync(process.execPath, [SCRIPT_PATH, '--manifest', manifestPath, '--json'], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stdout).ok).toBe(false);

    expect(spawnSync(process.execPath, [SCRIPT_PATH], { encoding: 'utf8' }).status).toBe(2);
  });
});

describe('asset index', () => {
  it('indexes validated manifest entries by id', () => {
    const index = buildAssetIndex({
      assets: [{ ...baseEntry(), kind: 'audio', format: 'ogg', status: 'approved' } as never]
    });
    expect(index.get('test.audio.blip')).toEqual({ id: 'test.audio.blip', kind: 'audio', status: 'approved' });
  });
});
