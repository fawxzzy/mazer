import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('legacy safe-area background', () => {
  test('uses one near-black shell color across the page, canvas, and install metadata', () => {
    const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
    const phaserConfig = readFileSync(resolve(process.cwd(), 'src/boot/phaserConfig.ts'), 'utf8');
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const manifest = readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8');

    expect(baseCss).toContain('background: #02080f;');
    expect(baseCss).not.toContain('#261630');
    expect(phaserConfig).toContain("backgroundColor: '#02080f'");
    expect(indexHtml).toContain('<meta name="theme-color" content="#02080f" />');
    expect(manifest).toContain('"background_color": "#02080f"');
    expect(manifest).toContain('"theme_color": "#02080f"');
  });
});
