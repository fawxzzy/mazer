import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildMazerLegalUrl, resolveMazerLegalRoute } from '../../src/legacy-runtime/legacyAccountPortal';

describe('Mazer legal routes', () => {
  test('matches only exact local Privacy and Terms paths', () => {
    expect(resolveMazerLegalRoute('/privacy')).toBe('privacy');
    expect(resolveMazerLegalRoute('/terms/')).toBe('terms');
    expect(resolveMazerLegalRoute('/')).toBeNull();
    expect(resolveMazerLegalRoute('//evil.example/privacy')).toBeNull();
  });

  test('renders local install-gate-free entrypoints with canonical policy links', () => {
    const boot = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
    expect(buildMazerLegalUrl('privacy')).toBe('https://fawxzzy.com/legal/mazer/privacy');
    expect(buildMazerLegalUrl('terms')).toBe('https://fawxzzy.com/legal/mazer/terms');
    expect(boot.indexOf('installMazerLegalSurface(document, legalRoute)')).toBeLessThan(boot.indexOf('initializeInstallSurface(window)'));
    expect(vercel.rewrites).toEqual(expect.arrayContaining([
      { destination: '/index.html', source: '/privacy' },
      { destination: '/index.html', source: '/terms' }
    ]));
  });
});
