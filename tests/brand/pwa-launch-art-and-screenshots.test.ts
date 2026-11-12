import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import {
  IOS_LAUNCH_ART_DEVICES,
  launchArtFileName,
  launchArtLinkTag,
  launchArtPixels
} from '../../scripts/brand/ios-launch-art-devices.mjs';

const root = process.cwd();
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');

interface ManifestScreenshot { src: string; sizes: string; type: string; form_factor: string; label: string }
const manifest = JSON.parse(read('public/manifest.webmanifest')) as { description: string; screenshots: ManifestScreenshot[] };
const indexHtml = read('index.html');
const viteConfig = read('vite.config.ts');

describe('manifest screenshots (MAZER-PWA-002)', () => {
  test('has narrow and wide screenshots with labels', () => {
    const factors = new Set(manifest.screenshots.map((shot) => shot.form_factor));
    expect([...factors].sort()).toEqual(['narrow', 'wide']);
    for (const shot of manifest.screenshots) {
      expect(shot.label.length).toBeGreaterThan(0);
      expect(shot.type).toBe('image/png');
    }
  });

  test.each(manifest.screenshots.map((shot) => [shot.src, shot] as const))('%s exists with the declared size', async (_src, shot) => {
    const file = `public${shot.src.split('?')[0]}`;
    expect(existsSync(resolve(root, file)), file).toBe(true);
    const meta = await sharp(resolve(root, file)).metadata();
    expect(`${meta.width}x${meta.height}`).toBe(shot.sizes);
  });

  test('description is plain language, not internal jargon', () => {
    expect(manifest.description).not.toMatch(/ambient|profile-driven|surface/i);
    expect(manifest.description.length).toBeLessThanOrEqual(130);
  });
});

describe('iOS launch art', () => {
  test.each(IOS_LAUNCH_ART_DEVICES.map((device) => [device.id, device] as const))('%s: file has the device pixel size and index.html links it', async (_id, device) => {
    const file = `public/splash/${launchArtFileName(device)}`;
    const meta = await sharp(resolve(root, file)).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual(launchArtPixels(device));
    expect(statSync(resolve(root, file)).size).toBeLessThanOrEqual(120_000);
    expect(indexHtml).toContain(launchArtLinkTag(device));
  });

  test('index.html carries no stray startup-image link', () => {
    const count = (indexHtml.match(/rel="apple-touch-startup-image"/g) ?? []).length;
    expect(count).toBe(IOS_LAUNCH_ART_DEVICES.length);
  });

  test('screenshots and launch art are deliberately kept out of the precache', () => {
    expect(viteConfig).not.toMatch(/includeAssets:[\s\S]*?(splash|screenshots)\/[\s\S]*?\]/);
  });
});
