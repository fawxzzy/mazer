import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = process.cwd();
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const ORIGIN = 'https://mazer.fawxzzy.com';
const PREVIEW_PATH = '/share/mazer-share-preview.png';

const tag = (attr: 'property' | 'name', key: string): string | undefined => {
  const match = new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html);
  return match?.[1];
};

const pngSize = (path: string) => {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

describe('web share metadata (MAZER-SHARE-001)', () => {
  test('canonical and Open Graph identity use the production origin', () => {
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
    expect(tag('property', 'og:url')).toBe(`${ORIGIN}/`);
    expect(tag('property', 'og:type')).toBe('website');
    expect(tag('property', 'og:site_name')).toBe('Mazer');
    expect(tag('property', 'og:title')).toBe('Mazer');
    expect(tag('property', 'og:description')).toBeTruthy();
  });

  test('every share image URL is absolute, on the production origin, and the dedicated preview (not the app icon)', () => {
    const urls = [
      tag('property', 'og:image'),
      tag('property', 'og:image:secure_url'),
      tag('name', 'twitter:image')
    ];
    for (const url of urls) {
      expect(url, 'share image tag present').toBeTruthy();
      const parsed = new URL(url as string);
      expect(parsed.origin).toBe(ORIGIN);
      expect(parsed.pathname).toBe(PREVIEW_PATH);
    }
    expect(new Set(urls).size).toBe(1);
  });

  test('twitter card tags mirror the Open Graph tags', () => {
    expect(tag('name', 'twitter:card')).toBe('summary_large_image');
    expect(tag('name', 'twitter:title')).toBe(tag('property', 'og:title'));
    expect(tag('name', 'twitter:description')).toBe(tag('property', 'og:description'));
    expect(tag('name', 'twitter:image:alt')).toBe(tag('property', 'og:image:alt'));
    expect(tag('property', 'og:image:alt')).toBeTruthy();
  });

  test('declared image type and size match the file that is served', () => {
    const file = resolve(root, 'public', PREVIEW_PATH.slice(1));
    expect(existsSync(file)).toBe(true);
    expect(tag('property', 'og:image:type')).toBe('image/png');
    const { width, height } = pngSize(file);
    expect(tag('property', 'og:image:width')).toBe(String(width));
    expect(tag('property', 'og:image:height')).toBe(String(height));
    expect([width, height]).toEqual([1200, 630]);
  });

  test('preview stays out of public/assets and the precache, and is small', () => {
    const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
    expect(PREVIEW_PATH.startsWith('/assets/')).toBe(false);
    expect(viteConfig).not.toContain('share/mazer-share-preview');
    // Chat apps skip or crop images over a few hundred KB; keep well under.
    expect(readFileSync(resolve(root, 'public', 'share', 'mazer-share-preview.png')).length).toBeLessThan(300_000);
  });
});
