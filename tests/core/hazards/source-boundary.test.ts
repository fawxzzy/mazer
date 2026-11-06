import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const hazardsDirectory = new URL('../../../src/mazer-core/hazards/', import.meta.url);
const hazardFiles = readdirSync(hazardsDirectory).filter((name) => name.endsWith('.ts')).sort();
const read = (url: URL): string => readFileSync(url, 'utf8');

describe('hazard source boundary (DRAFT, dormant)', () => {
  test('the hazards directory holds exactly the expected modules', () => {
    expect(hazardFiles).toEqual(['graphContract.ts', 'index.ts', 'loadout.ts', 'placement.ts', 'serialization.ts', 'solvability.ts', 'validation.ts']);
  });

  test('stays pure, runtime-agnostic and bounded to mazer-core', () => {
    for (const name of hazardFiles) {
      const source = read(new URL(name, hazardsDirectory));
      expect(source, name).not.toMatch(/from\s+['"][^'"]*(visual-proof|future-runtime|proofRuntime|scenarioLibrary|manifestLoader|manifestTypes)/);
      expect(source, name).not.toMatch(/from\s+['"][^'"]*(legacy-runtime|scenes|phaser)/i);
      expect(source, name).not.toMatch(/\bDOM\b|\bCSS\b|\bwindow\b|\bdocument\b/);
      expect(source, name).not.toMatch(/\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b|\bnew Date\b/);
      expect(source, name).not.toMatch(/from\s+['"][^'"]*(cortex|atlas)/i);
    }
  });

  test('is not re-exported from the mazer-core barrel and not imported by any scene', () => {
    expect(read(new URL('../../../src/mazer-core/index.ts', import.meta.url))).not.toMatch(/hazards/);
    const scenes = new URL('../../../src/scenes/', import.meta.url);
    for (const name of readdirSync(scenes).filter((entry) => entry.endsWith('.ts'))) {
      expect(read(new URL(name, scenes)), name).not.toMatch(/hazards|HazardGraph/);
    }
  });

  test('the legacy adapter is the only legacy-runtime file that mentions the hazard graph', () => {
    const legacy = new URL('../../../src/legacy-runtime/', import.meta.url);
    const mentions = readdirSync(legacy)
      .filter((entry) => entry.endsWith('.ts'))
      .filter((entry) => /mazer-core\/hazards/.test(read(new URL(entry, legacy))));
    expect(mentions).toEqual(['legacyHazardGraphAdapter.ts']);
  });
});
