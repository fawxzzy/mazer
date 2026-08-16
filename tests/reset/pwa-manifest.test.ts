import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('Mazer installable PWA contract', () => {
  test('migrates only the stable legacy host to the branded origin', () => {
    const vercelConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')
    ) as {
      git?: { deploymentEnabled?: boolean };
      redirects?: Array<{
        destination?: string;
        has?: Array<{ type?: string; value?: string }>;
        permanent?: boolean;
        source?: string;
      }>;
    };

    expect(vercelConfig.git?.deploymentEnabled).toBe(false);
    expect(vercelConfig.redirects).toEqual([
      {
        source: '/:path((?!sw\\.js$).*)',
        has: [
          {
            type: 'host',
            value: 'fawxzzy-mazer.vercel.app'
          }
        ],
        destination: 'https://mazer.fawxzzy.com/:path',
        permanent: true
      }
    ]);
  });

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
    const lifecycleSource = readFileSync(
      resolve(process.cwd(), 'src/boot/serviceWorkerLifecycle.ts'),
      'utf8'
    );

    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('name="apple-mobile-web-app-capable"');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('rel="canonical" href="https://mazer.fawxzzy.com/"');
    expect(html).toContain('property="og:url" content="https://mazer.fawxzzy.com/"');
    expect(lifecycleSource).toContain("isLocalhostHostname(runtime.hostname)");
    expect(lifecycleSource).toContain("runtime.register?.('/app-sw.js')");
  });

  test('retires the legacy service worker before host migration', () => {
    const retirementWorker = readFileSync(
      resolve(process.cwd(), 'public/sw.js'),
      'utf8'
    );
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain("filename: 'app-sw.js'");
    expect(retirementWorker).toContain("const LEGACY_ORIGIN = 'https://fawxzzy-mazer.vercel.app';");
    expect(retirementWorker).toContain("const CANONICAL_ORIGIN = 'https://mazer.fawxzzy.com';");
    expect(retirementWorker).toContain('await caches.delete(cacheName)');
    expect(retirementWorker).toContain('await self.registration.unregister()');
    expect(retirementWorker).toContain('canonicalUrl.pathname = clientUrl.pathname');
    expect(retirementWorker).toContain('canonicalUrl.search = clientUrl.search');
  });
});
