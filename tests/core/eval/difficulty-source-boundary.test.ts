import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const evalDirectory = new URL('../../../src/mazer-core/eval/', import.meta.url);
const files = ['bots.ts', 'difficultyReport.ts'];
const read = (url: URL): string => readFileSync(url, 'utf8');

describe('difficulty monitor source boundary (DRAFT, dormant)', () => {
  test('stays pure: no ambient randomness, clock, DOM, scene or legacy-runtime import', () => {
    for (const name of files) {
      const source = read(new URL(name, evalDirectory));
      expect(source, name).not.toMatch(/\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b|\bnew Date\b|\bsetTimeout\b|\bsetInterval\b/);
      expect(source, name).not.toMatch(/\bDOM\b|\bCSS\b|\bwindow\b|\bdocument\b/);
      expect(source, name).not.toMatch(/from\s+['"][^'"]*(legacy-runtime|scenes|phaser|visual-proof|future-runtime|proofRuntime)/i);
      expect(source, name).not.toMatch(/from\s+['"][^'"]*(cortex|atlas)/i);
    }
  });

  test('imports only the hazards modules and its own siblings', () => {
    for (const name of files) {
      const imports = [...read(new URL(name, evalDirectory)).matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
      for (const specifier of imports) {
        expect(specifier, `${name}: ${specifier}`).toMatch(/^(\.\.\/hazards\/[A-Za-z]+|\.\/(bots|difficultyReport))$/);
      }
    }
  });

  test('does not fork the contact rule: contact comes from the P3 state space', () => {
    const bots = read(new URL('bots.ts', evalDirectory));
    expect(bots).toMatch(/createHazardStateSpace/);
    expect(bots).toMatch(/resolvePushbackCell/);
    expect(bots).not.toMatch(/enemyCellsAt\([^)]*\)\.includes/);
  });

  test('is not re-exported from the mazer-core barrel or the eval index, and no scene imports it', () => {
    expect(read(new URL('../../../src/mazer-core/index.ts', import.meta.url))).not.toMatch(/difficultyReport|eval\/bots/);
    expect(read(new URL('index.ts', evalDirectory))).not.toMatch(/bots|difficultyReport/);
    for (const relative of ['../../../src/scenes/', '../../../src/legacy-runtime/']) {
      const directory = new URL(relative, import.meta.url);
      for (const name of readdirSyncSafe(directory)) {
        expect(read(new URL(name, directory)), name).not.toMatch(/mazer-core\/eval\/(bots|difficultyReport)/);
      }
    }
  });
});

import { readdirSync } from 'node:fs';
const readdirSyncSafe = (directory: URL): string[] => readdirSync(directory).filter((entry) => entry.endsWith('.ts'));
