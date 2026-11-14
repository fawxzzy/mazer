import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { legacyTuning } from '../../src/config/tuning';

// MAZER-MOTION-010: legacyTuning only holds values something reads. A value no source file names is dead weight
// that looks tunable but drives nothing (the unused `menu.status.pulseDurationMs` was one). Colors are read as whole
// groups through palette.ts, so they are checked by their group.

const SRC = resolve(process.cwd(), 'src');
const TUNING_FILE = resolve(SRC, 'config', 'tuning.ts');

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = join(dir, entry.name);
  if (entry.isDirectory()) return walk(full);
  return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
});

const readerSource = walk(SRC)
  .filter((file) => file !== TUNING_FILE)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

const leafPaths = (value: unknown, prefix: string[] = []): string[][] => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, [...prefix, key]));
};

describe('legacyTuning has no dead values (MAZER-MOTION-010)', () => {
  test('every non-color leaf key is named by at least one source file outside tuning.ts', () => {
    const dead = leafPaths(legacyTuning)
      .filter((path) => path[0] !== 'colors')
      .filter((path) => !new RegExp(String.raw`\b${path[path.length - 1]}\b`).test(readerSource))
      .map((path) => path.join('.'));
    expect(dead).toEqual([]);
  });

  test('the dead groups and the pulse durations stay deleted', () => {
    const tuning = legacyTuning as Record<string, unknown>;
    for (const group of ['game', 'hud', 'overlays']) {
      expect(tuning[group], group).toBeUndefined();
    }
    const menu = legacyTuning.menu as Record<string, unknown>;
    for (const group of ['title', 'status', 'starfield', 'utilityButton', 'signalPriority', 'ambientSky']) {
      expect(menu[group], `menu.${group}`).toBeUndefined();
    }
    expect(Object.keys(legacyTuning.menu).sort()).toEqual(['intentFeed', 'layout', 'runtime']);
    expect(JSON.stringify(legacyTuning)).not.toContain('pulseDurationMs');
  });

  test('the values that are read keep their shipped numbers', () => {
    expect(legacyTuning.menu.runtime.ambientUpdateIntervalMs).toEqual({ full: 16, throttled: 100, hidden: 1000 });
    expect(legacyTuning.menu.runtime.diagnosticsPublishIntervalMs).toBe(1500);
    expect(legacyTuning.menu.layout.narrowBreakpoint).toBe(620);
    expect(legacyTuning.menu.intentFeed.holdDurationMs).toBe(2600);
    expect(legacyTuning.demo.cadence.goalHoldMs).toBe(3900);
    expect(legacyTuning.board.goalPulse.waveSpeed).toBe(0.0054);
  });
});
