import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MAZER_ICON_CACHE_VERSION,
  MAZER_ICON_QUALITY_TARGET,
  MAZER_ICON_QUALITY_TARGET_VERSION,
  MAZER_ICON_SOURCE_SHA256,
  summarizeMazerIconQualityTarget
} from '../../src/brand/mazerIconQualityTarget';
import {
  CYBER_ARCADE_ICON_TARGET,
  CYBER_ARCADE_MATERIAL_VERSION,
  summarizeCyberArcadeMaterial
} from '../../src/render/cyberArcadeMaterial';

const sha256 = (relativePath: string): string => (
  createHash('sha256').update(readFileSync(resolve(process.cwd(), relativePath))).digest('hex')
);

const readPngDimensions = (relativePath: string): { width: number; height: number } => {
  const payload = readFileSync(resolve(process.cwd(), relativePath));
  expect(payload.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: payload.readUInt32BE(16),
    height: payload.readUInt32BE(20)
  };
};

const readIcoSizes = (relativePath: string): number[] => {
  const payload = readFileSync(resolve(process.cwd(), relativePath));
  expect(payload.readUInt16LE(0)).toBe(0);
  expect(payload.readUInt16LE(2)).toBe(1);
  const count = payload.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const encoded = payload.readUInt8(6 + (index * 16));
    return encoded === 0 ? 256 : encoded;
  });
};

describe('Mazer icon-quality target', () => {
  test('publishes one repository-owned source, generator, delivery, and material authority', () => {
    const summary = summarizeMazerIconQualityTarget();

    expect(summary.version).toBe(MAZER_ICON_QUALITY_TARGET_VERSION);
    expect(summary.cacheVersion).toBe(MAZER_ICON_CACHE_VERSION);
    expect(summary.materialVersion).toBe(CYBER_ARCADE_MATERIAL_VERSION);
    expect(summary.sourceMaster).toEqual({
      repositoryPath: 'src/brand/source-art/mazer-app-icon-master.png',
      width: 1024,
      height: 1024,
      bytes: 1_173_366,
      sha256: MAZER_ICON_SOURCE_SHA256
    });
    expect(summary.generator).toMatchObject({
      repositoryPath: 'scripts/brand/generate-mazer-icons.mjs',
      command: 'npm run brand:icons',
      checkCommand: 'npm run brand:icons:check'
    });
    expect(summary.canonicalAsset.repositoryPath).toBe(CYBER_ARCADE_ICON_TARGET);
    expect(summary.canonicalAsset.sha256).toBe(summary.sourceMaster.sha256);
    expect(summary.supersededEvidence.every((asset) => asset.authoritative === false)).toBe(true);
    expect(summary.visualRules).toEqual(expect.arrayContaining([
      'locked-final-master-no-redesign',
      'preserve-rainbow-frame-and-central-maze',
      'maskable-safe-zone-padding',
      'no-competing-authoritative-artwork'
    ]));
    expect(summarizeCyberArcadeMaterial()).toMatchObject({
      version: summary.materialVersion,
      iconTarget: summary.canonicalAsset.repositoryPath,
      iconTargetSha256: summary.canonicalAsset.sha256,
      iconQualityTargetVersion: summary.version
    });
  });

  test('locks the exact master and every deterministic repository derivative', () => {
    const pngSizes = new Map([
      ['src/brand/source-art/mazer-app-icon-master.png', { width: 1024, height: 1024 }],
      ['public/icons/mazer-app-icon.png', { width: 1024, height: 1024 }],
      ['public/icons/apple-touch-icon.png', { width: 180, height: 180 }],
      ['public/icons/icon-192.png', { width: 192, height: 192 }],
      ['public/icons/icon-512.png', { width: 512, height: 512 }],
      ['public/icons/icon-192-maskable.png', { width: 192, height: 192 }],
      ['public/icons/icon-512-maskable.png', { width: 512, height: 512 }]
    ]);
    const assets = [
      MAZER_ICON_QUALITY_TARGET.sourceMaster,
      MAZER_ICON_QUALITY_TARGET.canonicalAsset,
      ...MAZER_ICON_QUALITY_TARGET.deliveryAssets
    ];

    for (const asset of assets) {
      expect(sha256(asset.repositoryPath)).toBe(asset.sha256);
      const expectedSize = pngSizes.get(asset.repositoryPath);
      if (expectedSize) expect(readPngDimensions(asset.repositoryPath)).toEqual(expectedSize);
    }

    const source = readFileSync(resolve(process.cwd(), MAZER_ICON_QUALITY_TARGET.sourceMaster.repositoryPath));
    const canonical = readFileSync(resolve(process.cwd(), MAZER_ICON_QUALITY_TARGET.canonicalAsset.repositoryPath));
    expect(source.byteLength).toBe(1_173_366);
    expect(canonical.equals(source)).toBe(true);
    expect(readIcoSizes('public/favicon.ico')).toEqual([16, 32, 48, 64, 128, 256]);
    expect(readFileSync(resolve(process.cwd(), 'public/favicon.ico')).equals(
      readFileSync(resolve(process.cwd(), 'public/icons/mazer-app-icon.ico'))
    )).toBe(true);
    expect(sha256('public/icons/icon-192-maskable.png')).not.toBe(sha256('public/icons/icon-192.png'));
    expect(sha256('public/icons/icon-512-maskable.png')).not.toBe(sha256('public/icons/icon-512.png'));
    expect(MAZER_ICON_QUALITY_TARGET.maskablePolicy).toEqual({
      background: '#000000',
      guaranteedSafeCircleDiameterRatio: 0.8,
      completeMasterFitsSafeCircle: true
    });
  });

  test('reproduces the checked-in derivatives from the canonical master', () => {
    expect(() => execFileSync(
      process.execPath,
      [MAZER_ICON_QUALITY_TARGET.generator.repositoryPath, '--check'],
      { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' }
    )).not.toThrow();
  });

  test('keeps browser, install, manifest, cache, watch, social, and shortcut consumers wired', () => {
    const indexSource = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const watchPreviewSource = readFileSync(resolve(process.cwd(), 'watch-pass-preview.html'), 'utf8');
    const watchPaywallSource = readFileSync(resolve(process.cwd(), 'watch-pass-paywall.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8')) as {
      icons: Array<{ purpose?: string; sizes: string; src: string; type: string }>;
      shortcuts: Array<{ icons: Array<{ purpose?: string; src: string }> }>;
    };
    const viteSource = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    const shortcutSource = readFileSync(resolve(process.cwd(), 'scripts/windows/Prepare-MazerShortcut.ps1'), 'utf8');
    const expectedManifestUrls = [
      `/icons/icon-192.png?v=${MAZER_ICON_CACHE_VERSION}`,
      `/icons/icon-512.png?v=${MAZER_ICON_CACHE_VERSION}`,
      `/icons/icon-192-maskable.png?v=${MAZER_ICON_CACHE_VERSION}`,
      `/icons/icon-512-maskable.png?v=${MAZER_ICON_CACHE_VERSION}`,
      MAZER_ICON_QUALITY_TARGET.canonicalAsset.publicUrl
    ];

    expect(indexSource).toContain(`/favicon.ico?v=${MAZER_ICON_CACHE_VERSION}`);
    expect(indexSource).toContain(`/icons/apple-touch-icon.png?v=${MAZER_ICON_CACHE_VERSION}`);
    expect(indexSource).toContain('/manifest.webmanifest');
    expect(indexSource).toContain(`https://mazer.fawxzzy.com/icons/mazer-app-icon.png?v=${MAZER_ICON_CACHE_VERSION}`);
    expect(manifest.icons.map((icon) => icon.src)).toEqual(expectedManifestUrls);
    expect(manifest.shortcuts[0]?.icons).toEqual([
      expect.objectContaining({ src: `/icons/icon-192.png?v=${MAZER_ICON_CACHE_VERSION}`, purpose: 'any' })
    ]);
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable').map((icon) => icon.src)).toEqual([
      `/icons/icon-192-maskable.png?v=${MAZER_ICON_CACHE_VERSION}`,
      `/icons/icon-512-maskable.png?v=${MAZER_ICON_CACHE_VERSION}`
    ]);
    for (const asset of MAZER_ICON_QUALITY_TARGET.deliveryAssets) {
      expect(viteSource).toContain(`'${asset.repositoryPath.replace('public/', '')}'`);
    }
    expect(viteSource).toContain('/^v$/');
    expect(watchPreviewSource).toContain(`/favicon.ico?v=${MAZER_ICON_CACHE_VERSION}`);
    expect(watchPaywallSource).toContain(`/favicon.ico?v=${MAZER_ICON_CACHE_VERSION}`);
    expect(watchPreviewSource).not.toContain('mazer-emblem');
    expect(watchPaywallSource).not.toContain('mazer-emblem');
    expect(shortcutSource).toContain("public\\icons\\mazer-app-icon.ico");
  });
});
