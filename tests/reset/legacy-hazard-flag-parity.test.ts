import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { yieldToRunner } from '../fixtures/yieldToRunner';
import { LADDER_BOARDS, generateLadderMaze, hashLadderMaze } from '../../scripts/analysis/lib/progressionLadderSampling';
import {
  HAZARD_LAB_STORAGE_KEY,
  resolveHazardLayerState
} from '../../src/legacy-runtime/legacyHazardLayerFlag';
import { createHazardWorldRuntime } from '../../src/legacy-runtime/legacyWorldClock';

// Roadmap slice H1: flag OFF must be byte-identical behaviour, and flag ON (empty hazard schedule) must
// not change generation either. The pinned corpus is tests/fixtures/progression-ladder-golden.v1.json
// (never regenerated or hand-edited by this slice).
describe('geometry hash corpus is identical with the hazard layer flag off and on', () => {
  const golden = JSON.parse(readFileSync(new URL('../fixtures/progression-ladder-golden.v1.json', import.meta.url), 'utf8')) as {
    seed: number;
    levels: number;
    hashes: Record<string, Record<string, string>>;
  };

  const generateCorpus = async (runtimeFrame: (() => void) | null): Promise<Record<string, Record<string, string>>> => {
    const corpus: Record<string, Record<string, string>> = {};
    for (const board of LADDER_BOARDS) {
      const hashes: Record<string, string> = {};
      for (let level = 1; level <= golden.levels; level += 1) {
        runtimeFrame?.();
        hashes[String(level)] = hashLadderMaze(generateLadderMaze(level, board, golden.seed + level));
        runtimeFrame?.();
        if (level % 25 === 0) { await yieldToRunner(); }
      }
      corpus[board.name] = hashes;
    }
    return corpus;
  };

  test('flag off: the corpus equals the pinned fixture and no runtime exists', async () => {
    const state = resolveHazardLayerState({ search: '', storage: null });
    expect(state.enabled).toBe(false);
    const off = await generateCorpus(null);
    expect(off).toEqual(golden.hashes);
  }, 300_000);

  test('flag on (lab switch, clock running over the empty schedule): the corpus is byte-identical', async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); }
    };
    const state = resolveHazardLayerState({ search: '?lab=hazards', storage });
    expect(state.enabled).toBe(true);
    expect(store.get(HAZARD_LAB_STORAGE_KEY)).toBe('1');
    const runtime = createHazardWorldRuntime();
    runtime.noteInput(0);
    let now = 0;
    const on = await generateCorpus(() => {
      now += 16;
      runtime.frame(now, true, 140);
    });
    expect(runtime.clock.ticks).toBeGreaterThan(0);
    expect(runtime.schedule.hazards).toEqual([]);
    expect(on).toEqual(golden.hashes);
  }, 300_000);
});
