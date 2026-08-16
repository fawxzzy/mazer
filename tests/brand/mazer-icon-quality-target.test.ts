import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
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

describe('Mazer icon-quality target', () => {
  test('publishes one versioned source, delivery, and material authority', () => {
    const summary = summarizeMazerIconQualityTarget();

    expect(summary.version).toBe(MAZER_ICON_QUALITY_TARGET_VERSION);
    expect(summary.materialVersion).toBe(CYBER_ARCADE_MATERIAL_VERSION);
    expect(summary.canonicalAsset.repositoryPath).toBe(CYBER_ARCADE_ICON_TARGET);
    expect(summary.atlasSourceReferences).toHaveLength(2);
    expect(summary.atlasSourceReferences.every((source) => source.sha256 === MAZER_ICON_SOURCE_SHA256)).toBe(true);
    expect(summary.visualRules).toEqual(expect.arrayContaining([
      'deep-navy-substrate',
      'hard-cyan-and-mint-rails',
      'green-player-signal',
      'red-goal-and-direction-signal',
      'sparse-white-shine',
      'bounded-glow-with-crisp-pixel-edges'
    ]));
    expect(summarizeCyberArcadeMaterial()).toMatchObject({
      version: summary.materialVersion,
      iconTarget: summary.canonicalAsset.repositoryPath,
      iconTargetSha256: summary.canonicalAsset.sha256,
      iconQualityTargetVersion: summary.version
    });
  });

  test('locks every approved repository binary to its declared hash and size', () => {
    const pngSizes = new Map([
      ['public/icons/mazer-app-icon.png', { width: 1024, height: 1024 }],
      ['public/icons/apple-touch-icon.png', { width: 180, height: 180 }],
      ['public/icons/icon-192.png', { width: 192, height: 192 }],
      ['public/icons/icon-512.png', { width: 512, height: 512 }],
      ['public/icons/icon-192-maskable.png', { width: 192, height: 192 }],
      ['public/icons/icon-512-maskable.png', { width: 512, height: 512 }]
    ]);
    const assets = [MAZER_ICON_QUALITY_TARGET.canonicalAsset, ...MAZER_ICON_QUALITY_TARGET.deliveryAssets];

    for (const asset of assets) {
      expect(sha256(asset.repositoryPath)).toBe(asset.sha256);
      const expectedSize = pngSizes.get(asset.repositoryPath);
      if (expectedSize) expect(readPngDimensions(asset.repositoryPath)).toEqual(expectedSize);
    }
  });

  test('keeps browser, install, manifest, and shortcut delivery wired to the contract', () => {
    const indexSource = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8')) as {
      icons: Array<{ purpose?: string; sizes: string; src: string; type: string }>;
    };
    const viteSource = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    const shortcutSource = readFileSync(resolve(process.cwd(), 'scripts/windows/Prepare-MazerShortcut.ps1'), 'utf8');
    const publicUrls = MAZER_ICON_QUALITY_TARGET.deliveryAssets.map((asset) => asset.publicUrl);

    expect(indexSource).toContain(MAZER_ICON_QUALITY_TARGET.canonicalAsset.publicUrl.replace('.png', '.ico'));
    expect(indexSource).toContain('/icons/apple-touch-icon.png');
    expect(indexSource).toContain('/manifest.webmanifest');
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-192-maskable.png',
      '/icons/icon-512-maskable.png',
      MAZER_ICON_QUALITY_TARGET.canonicalAsset.publicUrl
    ]);
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable').map((icon) => icon.src)).toEqual([
      '/icons/icon-192-maskable.png',
      '/icons/icon-512-maskable.png'
    ]);
    for (const url of publicUrls.filter((url) => url.includes('maskable') || /icon-(192|512)\.png$/.test(url))) {
      expect(viteSource).toContain(url.slice(1));
    }
    expect(shortcutSource).toContain("public\\icons\\mazer-app-icon.ico");
  });
});
