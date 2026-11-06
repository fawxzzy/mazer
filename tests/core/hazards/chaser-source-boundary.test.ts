import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const hazardsDirectory = new URL('../../../src/mazer-core/hazards/', import.meta.url);
const chaserFiles = readdirSync(hazardsDirectory)
  .filter((name) => /^chaser.*\.ts$/.test(name))
  .sort();
const read = (url: URL): string => readFileSync(url, 'utf8');

describe('chaser engine source boundary (DRAFT, dormant)', () => {
  test('the chaser modules are exactly the expected files', () => {
    expect(chaserFiles).toEqual(['chaserEngine.ts', 'chaserSolvability.ts', 'chaserValidation.ts']);
  });

  test('stay pure, runtime-agnostic and bounded to mazer-core hazards', () => {
    for (const name of chaserFiles) {
      const source = read(new URL(name, hazardsDirectory));
      expect(source, name).not.toMatch(/\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b|\bnew Date\b|\bsetTimeout\b|\bsetInterval\b/);
      expect(source, name).not.toMatch(/from\s+['"][^'"]*(visual-proof|future-runtime|proofRuntime|scenarioLibrary|manifestLoader|manifestTypes)/);
      expect(source, name).not.toMatch(/from\s+['"][^'"]*(legacy-runtime|scenes|phaser)/i);
      expect(source, name).not.toMatch(/\bDOM\b|\bCSS\b|\bwindow\b|\bdocument\b/);
      expect(source, name).not.toMatch(/from\s+['"][^'"]*(cortex|atlas)/i);
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]!);
      for (const specifier of imports) {
        expect(specifier, `${name} imports ${specifier}`).toMatch(/^\.\/[A-Za-z]+$/);
      }
    }
  });

  test('is not re-exported from the mazer-core barrel and not imported by any scene', () => {
    expect(read(new URL('../../../src/mazer-core/index.ts', import.meta.url))).not.toMatch(/hazards|chaser/i);
    const scenes = new URL('../../../src/scenes/', import.meta.url);
    for (const name of readdirSync(scenes).filter((entry) => entry.endsWith('.ts'))) {
      expect(read(new URL(name, scenes)), name).not.toMatch(/chaserEngine|chaserSolvability|chaserValidation|junctionGreedy/i);
    }
  });

  test('the world-turn modules do not depend on the chaser engine', () => {
    const world = new URL('../../../src/mazer-core/world/', import.meta.url);
    for (const name of readdirSync(world).filter((entry) => entry.endsWith('.ts'))) {
      expect(read(new URL(name, world)), name).not.toMatch(/chaser|junctionGreedy/i);
    }
  });
});
