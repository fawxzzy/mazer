import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('Mazer installable PWA contract', () => {
  test('declares standalone app behavior, safe scope, and a direct play shortcut', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8')
    ) as {
      categories?: string[];
      display?: string;
      display_override?: string[];
      prefer_related_applications?: boolean;
      scope?: string;
      shortcuts?: Array<{ url?: string }>;
      start_url?: string;
    };

    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.display_override).toEqual([
      'standalone',
      'minimal-ui'
    ]);
    expect(manifest.prefer_related_applications).toBe(false);
    expect(manifest.categories).toEqual(expect.arrayContaining(['games']));
    expect(manifest.shortcuts).toEqual([
      expect.objectContaining({ url: '/?mode=play' })
    ]);
  });

  test('keeps mobile/PWA head metadata and production-only service worker registration explicit', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const bootSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');

    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('name="apple-mobile-web-app-capable"');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(bootSource).toContain("if (isLocalhostRuntime() || !('serviceWorker' in navigator))");
    expect(bootSource).toContain("navigator.serviceWorker.register('/sw.js')");
  });
});
