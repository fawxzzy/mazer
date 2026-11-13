import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import {
  MAZER_BOOT_LOADER_ICON_DATA_URI,
  MAZER_BOOT_LOADER_ICON_PIXELS,
  MAZER_BOOT_LOADER_ICON_WEBP_SHA256
} from '../../src/brand/bootLoaderIconData';
import { MAZER_ICON_CACHE_VERSION, MAZER_ICON_SOURCE_SHA256 } from '../../src/brand/mazerIconQualityTarget';

// MAZER-VIS-039: ONE app image everywhere. The source is the FawxzzyWeb site's Mazer icon (public/apps/mazer/icon.png),
// copied byte for byte into src/brand/source-art/mazer-app-icon-master.png. Every delivered icon, the link-preview image,
// the iOS launch art and the boot-loader icon are derived from it by committed scripts; this file pins all of that.

const root = process.cwd();
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const bytes = (path: string): Buffer => readFileSync(resolve(root, path));
const sha256 = (payload: Buffer | string): string => createHash('sha256').update(payload).digest('hex');

const SITE_SOURCE_REPO_PATH = 'public/apps/mazer/icon.png';
const SITE_SOURCE_SHA256 = '91764e546b8c1488b3d48baeda927ae18600b088178e190244fb9d8ce35e2440';
const RETIRED_ICON_SHA256 = [
  'ede90e596682795d10f97bed615071ca1f60e08e290eacf1ea143006df914d78', // the neon-diamond master replaced by this card
  '55677db4dff3896979d3e00e1b9ebcb85fd9fc04f106d5a67701cee61ea467d1', // the July 2026 source, already superseded
  'a7e34fa6e91b341e3f0da9a88914d7b0ba3b9b9cd946b81ee3cb8d0bcb15e9f7' // the old maze-screenshot share preview
];

const indexHtml = read('index.html');
const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  background_color: string;
  icons: Array<{ purpose?: string; sizes: string; src: string; type: string }>;
  screenshots: Array<{ src: string }>;
  shortcuts: Array<{ icons: Array<{ src: string }> }>;
  theme_color: string;
};

const stripQuery = (url: string): string => url.split('?')[0];
const publicFile = (url: string): string => `public${stripQuery(url)}`;

describe('the site image is the one source (MAZER-VIS-039)', () => {
  test('the master is the FawxzzyWeb Mazer icon, pinned by sha256, and documented', () => {
    expect(sha256(bytes('src/brand/source-art/mazer-app-icon-master.png'))).toBe(SITE_SOURCE_SHA256);
    expect(MAZER_ICON_SOURCE_SHA256).toBe(SITE_SOURCE_SHA256);
    const doc = read('docs/ops/MAZER-APP-IMAGE-SOURCE-2026-11-13.md');
    expect(doc).toContain(SITE_SOURCE_REPO_PATH);
    expect(doc).toContain('FawxzzyWeb');
    expect(doc).toContain(SITE_SOURCE_SHA256);
    expect(doc).toContain('src/brand/source-art/mazer-app-icon-master.png');
  });

  test('when the FawxzzyWeb checkout is next to this repo, its icon is still byte-identical (drift alarm)', () => {
    const sibling = resolve(root, '..', 'FawxzzyWeb', SITE_SOURCE_REPO_PATH);
    const atlas = resolve('C:/ATLAS/repos/FawxzzyWeb', SITE_SOURCE_REPO_PATH);
    const path = [sibling, atlas].find((candidate) => existsSync(candidate));
    if (path === undefined) return; // CI has no site checkout; the sha256 pin above is the contract there.
    expect(sha256(readFileSync(path))).toBe(SITE_SOURCE_SHA256);
  });

  test('the deterministic generators reproduce every checked-in derivative from the master', () => {
    for (const script of [
      ['scripts/brand/generate-mazer-icons.mjs', '--check'],
      ['scripts/brand/generate-share-preview.mjs', '--check'],
      ['scripts/brand/generate-ios-launch-art.mjs', '--check'],
      ['scripts/brand/generate-boot-loader-icon.mjs', '--check']
    ]) {
      expect(() => execFileSync(process.execPath, script, { cwd: root, encoding: 'utf8', stdio: 'pipe' }), script.join(' ')).not.toThrow();
    }
  }, 120_000);
});

describe('every referenced icon exists with the declared size', () => {
  test('manifest icons: file exists, PNG, size matches the declared size, one cache version everywhere', async () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    for (const icon of manifest.icons) {
      const file = publicFile(icon.src);
      expect(existsSync(resolve(root, file)), file).toBe(true);
      const meta = await sharp(resolve(root, file)).metadata();
      expect(`${meta.width}x${meta.height}`, file).toBe(icon.sizes);
      expect(meta.format, file).toBe('png');
      expect(icon.type, file).toBe('image/png');
      expect(icon.src, file).toContain(`?v=${MAZER_ICON_CACHE_VERSION}`);
    }
    const purposes = new Set(manifest.icons.map((icon) => `${icon.purpose}:${icon.sizes}`));
    for (const needed of ['any:192x192', 'any:512x512', 'maskable:192x192', 'maskable:512x512']) {
      expect(purposes.has(needed), needed).toBe(true);
    }
    for (const shortcutIcon of manifest.shortcuts.flatMap((shortcut) => shortcut.icons)) {
      expect(existsSync(resolve(root, publicFile(shortcutIcon.src)))).toBe(true);
      expect(shortcutIcon.src).toContain(`?v=${MAZER_ICON_CACHE_VERSION}`);
    }
  });

  test('index.html icon links: favicon.ico (16/32/48), 192, 512 and apple-touch 180 all exist at the declared size', async () => {
    const hrefs = [...indexHtml.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"([^>]*)\/>/g)];
    expect(hrefs.length).toBe(4);
    for (const [, href, rest] of hrefs) {
      const file = publicFile(href);
      expect(existsSync(resolve(root, file)), file).toBe(true);
      expect(href, file).toContain(`?v=${MAZER_ICON_CACHE_VERSION}`);
      const sizes = /sizes="(\d+)x(\d+)"/.exec(rest);
      if (sizes && file.endsWith('.png')) {
        const meta = await sharp(resolve(root, file)).metadata();
        expect([meta.width, meta.height], file).toEqual([Number(sizes[1]), Number(sizes[2])]);
      }
    }
    const ico = bytes('public/favicon.ico');
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([0, 1, 2].map((index) => ico.readUInt8(6 + (index * 16)))).toEqual([16, 32, 48]);
    expect(ico.equals(bytes('public/icons/mazer-app-icon.ico'))).toBe(true);
  });

  test('both watch-pass pages use the same favicon and apple-touch files and cache version', () => {
    for (const page of ['watch-pass-preview.html', 'watch-pass-paywall.html']) {
      const html = read(page);
      expect(html, page).toContain(`/favicon.ico?v=${MAZER_ICON_CACHE_VERSION}`);
      expect(html, page).toContain(`/icons/apple-touch-icon.png?v=${MAZER_ICON_CACHE_VERSION}`);
    }
  });

  test('iOS apple-touch icon has no transparency (iOS paints it black) and the launch art is the same image', async () => {
    const meta = await sharp(resolve(root, 'public/icons/apple-touch-icon.png')).metadata();
    expect(meta.hasAlpha).toBe(false);
    expect([meta.width, meta.height]).toEqual([180, 180]);
    expect(indexHtml.match(/rel="apple-touch-startup-image"/g)?.length).toBe(9);
    expect(indexHtml).toContain('?v=mazer-launch-v2');
  });

  test.each([192, 512])('maskable %i: every visible pixel is inside the guaranteed 80%% safe circle', async (size) => {
    const { data, info } = await sharp(resolve(root, `public/icons/icon-${size}-maskable.png`)).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([size, size]);
    const centre = (size - 1) / 2;
    const safeRadius = (size * 0.8) / 2;
    let farthest = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * info.channels;
        // The art's own surround is pure black; anything with a channel at 20+ is the frame, maze or wordmark.
        if (Math.max(data[offset], data[offset + 1], data[offset + 2]) >= 20) {
          farthest = Math.max(farthest, Math.hypot(x - centre, y - centre));
        }
      }
    }
    expect(farthest).toBeGreaterThan(safeRadius * 0.9); // the icon is not shrunk needlessly
    expect(farthest).toBeLessThanOrEqual(safeRadius + 1.5);
  });
});

describe('link previews use the same image', () => {
  const metaContent = (attr: 'property' | 'name', key: string): string | undefined => (
    new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(indexHtml)?.[1]
  );

  test('og:image and twitter:image are one absolute mazer.fawxzzy.com URL for a 1200x630 PNG built from the master', async () => {
    const url = new URL(metaContent('property', 'og:image') as string);
    expect(url.origin).toBe('https://mazer.fawxzzy.com');
    expect(metaContent('name', 'twitter:image')).toBe(metaContent('property', 'og:image'));
    expect(metaContent('property', 'og:image:secure_url')).toBe(metaContent('property', 'og:image'));
    const file = `public${url.pathname}`;
    const meta = await sharp(resolve(root, file)).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 630, 'png']);
    expect(statSync(resolve(root, file)).size).toBeLessThan(300_000);
    expect(url.search).toBe('?v=share-v2');
    expect(metaContent('property', 'og:image:alt')).toMatch(/Mazer app icon/);
  });

  test('the theme colour is one value across the page, the manifest and the loader', () => {
    expect(metaContent('name', 'theme-color')).toBe(manifest.theme_color);
    expect(manifest.background_color).toBe(manifest.theme_color);
    expect(indexHtml).toMatch(/#mazer-boot-splash \{[^}]*background: #02080f/);
  });
});

describe('the boot loader icon is inline, small and derived from the master', () => {
  test('index.html and the Phaser loader carry the very same data URI', () => {
    expect(indexHtml).toContain(`src="${MAZER_BOOT_LOADER_ICON_DATA_URI}"`);
    expect(MAZER_BOOT_LOADER_ICON_DATA_URI.startsWith('data:image/webp;base64,')).toBe(true);
  });

  test('it decodes to the declared square size and matches its pinned hash; budget: well under 20 KB', async () => {
    const webp = Buffer.from(MAZER_BOOT_LOADER_ICON_DATA_URI.split(',')[1], 'base64');
    expect(sha256(webp)).toBe(MAZER_BOOT_LOADER_ICON_WEBP_SHA256);
    const meta = await sharp(webp).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([MAZER_BOOT_LOADER_ICON_PIXELS, MAZER_BOOT_LOADER_ICON_PIXELS, 'webp']);
    expect(webp.length).toBeLessThan(20_000);
  });
});

describe('no retired icon is referenced or shipped', () => {
  const listFiles = (dir: string): string[] => readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path.split('\\').join('/')];
  });

  test('no file under public/ or src/brand/ has the bytes of a retired icon or share image', () => {
    const offenders = [...listFiles('public'), ...listFiles('src/brand')]
      .filter((file) => /\.(png|ico|webp|jpg|jpeg)$/i.test(file))
      .filter((file) => RETIRED_ICON_SHA256.includes(sha256(bytes(file))));
    expect(offenders).toEqual([]);
  });

  test('no shipped source or page names the retired cache version, the emblem files or a retired hash', () => {
    const scanned = [
      'index.html', 'watch-pass-preview.html', 'watch-pass-paywall.html', 'watch-pass-setup.html',
      'public/manifest.webmanifest', 'vite.config.ts', 'public/sw.js',
      ...listFiles('src').filter((file) => /\.(ts|css|html)$/.test(file)),
      ...listFiles('scripts/brand')
    ];
    for (const file of scanned) {
      const text = read(file);
      expect(text, file).not.toContain('mazer-final-icon-v2');
      expect(text, file).not.toContain('mazer-emblem');
      // The icon-quality target keeps the two pre-July evidence hashes as explicitly non-authoritative history.
      if (file === 'src/brand/mazerIconQualityTarget.ts') continue;
      for (const hash of RETIRED_ICON_SHA256) expect(text, file).not.toContain(hash);
    }
  });

  test('the superseded emblem files are not wired into the PWA precache or the manifest', () => {
    const vite = read('vite.config.ts');
    expect(vite).not.toContain('mazer-emblem');
    expect(JSON.stringify(manifest)).not.toContain('emblem');
    expect(existsSync(resolve(root, 'public/icons/mazer-emblem.svg'))).toBe(false);
    expect(existsSync(resolve(root, 'public/icons/mazer-emblem.ico'))).toBe(false);
  });
});
