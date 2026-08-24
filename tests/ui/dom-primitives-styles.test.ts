import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DOM_ROOT = join(ROOT, 'src/ui/dom');
const CSS = readFileSync(join(DOM_ROOT, 'primitives.css'), 'utf8');

const readDomSource = (): string => readdirSync(DOM_ROOT)
  .filter((entry) => entry.endsWith('.ts'))
  .map((entry) => readFileSync(join(DOM_ROOT, entry), 'utf8'))
  .join('\n');

describe('Wave 2A primitive styling and isolation', () => {
  it('guarantees 44px action targets and a 20px line-only password eye', () => {
    expect(CSS).toMatch(/--mazer-token-touch-target-min, 44px/);
    expect(CSS).toMatch(/\.mazer-field__reveal\s*\{[\s\S]*?height:\s*var\(--mazer-token-touch-target-min, 44px\)/);
    const iconBlock = CSS.match(/\.mazer-icon\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(iconBlock).not.toMatch(/(?:height|width):\s*20px/);

    const iconSource = readFileSync(join(DOM_ROOT, 'MazerIcon.ts'), 'utf8');
    const passwordSource = readFileSync(join(DOM_ROOT, 'MazerPasswordField.ts'), 'utf8');
    expect(iconSource).toContain('const size = parsed.size ?? 20');
    expect(iconSource).toContain("svg.setAttribute('width', String(size))");
    expect(iconSource).toContain("svg.setAttribute('height', String(size))");
    expect(passwordSource).toMatch(/name:\s*revealed \? 'eye-off' : 'eye',[\s\S]*?size:\s*20/);
    expect(iconSource).toContain("svg.setAttribute('fill', 'none')");
    expect(iconSource).toContain("svg.setAttribute('stroke', 'currentColor')");
  });

  it('keeps panels opaque and fields transparent with a one-pixel clean label notch', () => {
    expect(CSS).toMatch(/\.mazer-app-shell\s*\{[\s\S]*?box-sizing:\s*border-box;/);
    expect(CSS).toMatch(/\.mazer-app-shell \*\s*\{[\s\S]*?box-sizing:\s*border-box;/);
    expect(CSS).toMatch(/\.mazer-panel\s*\{[\s\S]*?background:\s*var\(--mazer-control-notch-background\)/);
    expect(CSS).toMatch(/\.mazer-field\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*var\(--mazer-token-stroke-hairline, 1px\)/);
    expect(CSS).toMatch(/\.mazer-field__input\s*\{[\s\S]*?background:\s*transparent;/);
    expect(CSS).toMatch(/\.mazer-field__label\s*\{[\s\S]*?background:\s*var\(--mazer-control-notch-background/);
  });

  it('remains state, network, persistence, Phaser, and MenuScene free', () => {
    const source = readDomSource();
    const forbidden = [
      /from ['"]phaser['"]/, /MenuScene/, /legacyAuth/, /supabase/i,
      /localStorage/, /sessionStorage/, /fetch\s*\(/, /XMLHttpRequest/,
      /uiCommandBus/, /createUiStore/
    ];

    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern);
    }
  });

  it('is not imported by a shipping runtime in Wave 2A', () => {
    const sourceRoot = join(ROOT, 'src');
    const scan = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return scan(path);
      if (!entry.name.endsWith('.ts') || path.startsWith(DOM_ROOT)) return [];
      return [readFileSync(path, 'utf8')];
    });

    const runtimeSource = scan(sourceRoot).join('\n');
    expect(runtimeSource).not.toMatch(/ui\/dom|ui\\dom/);
    expect(runtimeSource).not.toMatch(/from ['"][^'"]*\/dom['"]/);
  });
});
