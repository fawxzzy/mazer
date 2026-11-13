import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { yieldToRunner } from '../fixtures/yieldToRunner';
import {
  GEOMETRY_BUDGET_TOP_TARGET,
  GEOMETRY_BUDGET_MIN_STEP,
  GEOMETRY_BUDGET_FELT_SATURATION_LEVEL,
  GEOMETRY_BUDGET_FRINGE_CAP,
  GEOMETRY_BUDGET_FRINGE_END_LEVEL,
  GEOMETRY_BUDGET_REVERSE_FLOOR_PERMILLE,
  GEOMETRY_BUDGET_REVERSE_FLOOR_WRAP_PERMILLE,
  GEOMETRY_BUDGET_SATURATION_LEVEL,
  resolveGeometryBudgetFringeCells,
  resolveGeometryBudgetReverseFloor,
  GEOMETRY_BUDGET_WINDOW,
  GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL,
  resolveGeometryBudgetTarget
} from '../../src/legacy-runtime/legacyGeometryBudget';
import {
  createEmptyLegacyProgressionState,
  LEGACY_PROGRESSION_STORAGE_KEY,
  normalizeLegacyAuthoritativeProgressionState,
  readLegacyProgressionState,
  resolveGeometryBudgetLevel,
  resolveLegacyMazeGenerationProfileForProgression
} from '../../src/legacy-runtime/legacyProgression';
import { measureFelt, measurePricedFeltSteps } from '../../src/legacy-runtime/legacyMazeFeltDifficulty';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';
import {
  generateLadderMaze,
  hashLadderMaze,
  LADDER_BOARDS,
  sampleLevel,
  seedForIndex,
  trackForLevel
} from '../../scripts/analysis/lib/progressionLadderSampling';

class MemoryStorage {
  public values = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const SAT = GEOMETRY_BUDGET_SATURATION_LEVEL;
const FELT_SAT = GEOMETRY_BUDGET_FELT_SATURATION_LEVEL;

describe('progression ladder: strictly harder every level up to the felt saturation', () => {
  test('for ANY two seeds the worst maze of level N+1 beats the best maze of level N (every level, reduced sample)', async () => {
    // Full-scale version: scripts/analysis/progression-ladder-report.ts --assert.
    for (const board of LADDER_BOARDS) {
      let previousBest = -Infinity;
      for (let level = 2; level < FELT_SAT; level += 1) {
        // MAZER-GOV-009: this test is ~35 s of synchronous work (minutes on a busy machine); yield so the runner is never starved.
        await yieldToRunner();
        const samples = [0, 1].map((index) => sampleLevel(level, board, seedForIndex(index)));
        samples.forEach((sample) => {
          expect(sample.onTarget).toBe(true);
          expect(sample.felt).toBeGreaterThanOrEqual(resolveGeometryBudgetTarget(level)!);
          expect(sample.felt).toBeLessThanOrEqual(resolveGeometryBudgetTarget(level)! + GEOMETRY_BUDGET_WINDOW);
        });
        const worst = Math.min(...samples.map((sample) => sample.felt));
        expect(worst).toBeGreaterThan(previousBest);
        previousBest = Math.max(...samples.map((sample) => sample.felt));
      }
    }
  }, 300_000);

  test('a denser seed sweep on sampled levels keeps the ordering guarantee', () => {
    const levels = [2, 3, 9, 27, 40, 60, 99, 100, 140, FELT_SAT - 2, FELT_SAT - 1];
    for (const board of LADDER_BOARDS) {
      for (const level of levels) {
        const low = Array.from({ length: 10 }, (_, index) => sampleLevel(level, board, seedForIndex(index + 7)).felt);
        const high = Array.from({ length: 10 }, (_, index) => sampleLevel(level + 1, board, seedForIndex(index + 7)).felt);
        expect(Math.min(...high)).toBeGreaterThan(Math.max(...low));
        expect(Math.min(...high) - Math.max(...low)).toBeGreaterThanOrEqual(GEOMETRY_BUDGET_MIN_STEP - GEOMETRY_BUDGET_WINDOW);
      }
    }
  }, 300_000);

  test('the corridor level is the entry point and level 2 is the first maze', () => {
    const corridor = generateLadderMaze(1, LADDER_BOARDS[0], 5);
    expect(resolveLegacyMazeGenerationProfileForProgression(trackForLevel(1)).layout).toBe('corridor');
    // A straight line: one coordinate never changes along the whole route.
    expect(Math.min(
      new Set(corridor.solutionPath.map((point) => point.x)).size,
      new Set(corridor.solutionPath.map((point) => point.y)).size
    )).toBe(1);
    expect(resolveGeometryBudgetTarget(2)).toBeLessThan(resolveGeometryBudgetTarget(3)!);
  });
});

describe('progression ladder: the fringe carries the ladder from the felt saturation to the end of the fringe', () => {
  test('for ANY two seeds level N + 1 is strictly harder than level N as the pair (felt, fringe cells): the felt value holds the top window and the fringe is exactly one cell more per level', () => {
    for (const board of LADDER_BOARDS) {
      let previousMaxFringe = -1;
      for (let level = FELT_SAT; level <= GEOMETRY_BUDGET_FRINGE_END_LEVEL; level += 1) {
        const samples = [0, 1].map((index) => sampleLevel(level, board, seedForIndex(index)));
        samples.forEach((sample) => {
          expect(sample.onTarget).toBe(true);
          expect(sample.felt).toBeGreaterThanOrEqual(GEOMETRY_BUDGET_TOP_TARGET);
          expect(sample.felt).toBeLessThanOrEqual(GEOMETRY_BUDGET_TOP_TARGET + GEOMETRY_BUDGET_WINDOW);
          // Exact, not "at least": a maze either holds the level's count or the next base is tried.
          expect(sample.fringeCells).toBe(resolveGeometryBudgetFringeCells(level));
        });
        expect(Math.min(...samples.map((sample) => sample.fringeCells))).toBeGreaterThan(previousMaxFringe);
        previousMaxFringe = Math.max(...samples.map((sample) => sample.fringeCells));
      }
      expect(previousMaxFringe).toBe(GEOMETRY_BUDGET_FRINGE_CAP);
    }
  }, 300_000);
});

// What a solver who works from the goal end pays: the felt explorer run goal -> start, minus the
// priced savings (loops and wraps give back the same steps in either direction).
const reverseFeltOf = (maze: ReturnType<typeof generateLadderMaze>): number => {
  const saved = ((maze as LegacyMazeSnapshot).loopStats?.saved ?? 0) + ((maze as LegacyMazeSnapshot).wrapStats?.saved ?? 0);
  return measureFelt({ ...maze, start: maze.goal, goal: maze.start }).steps - saved;
};

// Ladder v2 (2026-11-11): the double lure applies to every maze of every level from 2 (it was a
// mastery tier past level 268), and every maze is held to a reverse floor. The documented floor
// per band, as a permille of the level's forward target (legacyGeometryBudget.ts):
//   levels 2..9 and 140..288, a maze with no wrap corridor: 975 (905 at the top class)
//   levels 10..139, a maze that owns a wrap corridor:        400
const FLOOR_BANDS = [
  { name: 'plain 2-9', levels: [2, 3, 5, 9], wrapped: false, permille: 975 },
  { name: 'wrapped 10-139', levels: [10, 12, 20, 30, 50, 100, 120, 139], wrapped: true, permille: 400 },
  { name: 'plain 140-288', levels: [140, 160, 198, 240, 283, 288], wrapped: false, permille: 975 }
] as const;
// Mean reverse felt of the ladder before the lure (docs/research/MAZER_PROGRESSION_FINAL_AUDIT_2026-11-10.md,
// "What if the lure covered levels 2 to 268", forced-off column), phone / desktop, 40 seeds.
const REVERSE_FELT_BEFORE_THE_LURE: Record<number, readonly [number, number]> = {
  30: [118, 157], 100: [188, 195], 150: [372, 394], 198: [461, 437]
};

describe('progression ladder v2: the double lure on every level from 2, and the reverse floor', () => {
  const sampleSeeds = Array.from({ length: 12 }, (_, index) => seedForIndex(index + 3));

  test('every sampled level 2..288 on both boards: lured, forward felt in its window, reverse felt at or above the documented floor of its band', () => {
    for (const board of LADDER_BOARDS) {
      for (const band of FLOOR_BANDS) {
        for (const level of band.levels) {
          let wrappedCount = 0;
          for (const seed of sampleSeeds.slice(0, 6)) {
            const maze = generateLadderMaze(level, board, seed);
            const stats = (maze as LegacyMazeSnapshot).reverseStats;
            // Every ladder maze carries the stats: nothing generates through the old, un-lured path.
            expect(stats).toBeDefined();
            const rungs = (maze as LegacyMazeSnapshot).wrapStats?.rungs ?? 0;
            // Wrap rules are unchanged: no wrap corridor below level 10 or from level 140 on.
            if (level < 10 || level >= GEOMETRY_BUDGET_WRAP_FADE_TO_LEVEL) { expect(rungs).toBe(0); }
            const wrapped = rungs > 0;
            wrappedCount += wrapped ? 1 : 0;
            // A maze is held to the floor of the wrap corridors it actually owns (the rare maze of a
            // wrapped band that fell back to a plain base is held to the plain floor).
            const target = resolveGeometryBudgetTarget(level)!;
            expect(stats!.floor).toBe(resolveGeometryBudgetReverseFloor(level, rungs));
            const permille = wrapped ? GEOMETRY_BUDGET_REVERSE_FLOOR_WRAP_PERMILLE : GEOMETRY_BUDGET_REVERSE_FLOOR_PERMILLE;
            expect(stats!.floor).toBe(Math.floor((target * permille) / 1000));
            // The documented floor of the band (permille of the target), as a minimum.
            expect(stats!.floor).toBeGreaterThanOrEqual(Math.floor((target * Math.min(band.permille, permille)) / 1000));
            expect(stats!.reverseFelt).toBeGreaterThanOrEqual(stats!.floor);
            // The recorded number is the real one, measured again from the finished grid.
            expect(reverseFeltOf(maze)).toBe(stats!.reverseFelt);
            // The lure does not move the forward number.
            const forward = measurePricedFeltSteps(maze);
            expect(forward).toBeGreaterThanOrEqual(target);
            expect(forward).toBeLessThanOrEqual(target + GEOMETRY_BUDGET_WINDOW);
          }
          // Levels 10..99 keep their band's wrap corridors (measured: 99.5 to 100 percent up to level 60,
          // 94 to 97 at level 100 after the lure, the rest fell back to plain bases; all of them before).
          if (band.wrapped && level <= 99) { expect(wrappedCount).toBeGreaterThanOrEqual(5); }
        }
      }
    }
  }, 240_000);

  test('the old behaviour is gone: mean reverse felt is at least 1.5 times the un-lured ladder\'s at the levels the audit measured', () => {
    for (const board of LADDER_BOARDS) {
      const boardIndex = board.name === 'phone' ? 0 : 1;
      for (const [levelText, before] of Object.entries(REVERSE_FELT_BEFORE_THE_LURE)) {
        const level = Number(levelText);
        const values = sampleSeeds.map((seed) => reverseFeltOf(generateLadderMaze(level, board, seed)));
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        expect(mean).toBeGreaterThanOrEqual(1.5 * before[boardIndex]!);
      }
    }
  }, 240_000);

  test('the plateau class: a level from the end of the fringe on is the same lured class, held to 905 reverse steps (no mastery share, no level past 288 adds one)', () => {
    for (const board of LADDER_BOARDS) {
      for (const level of [GEOMETRY_BUDGET_FRINGE_END_LEVEL, 300, 388, 1_000]) {
        for (const seed of sampleSeeds.slice(0, 6)) {
          const maze = generateLadderMaze(level, board, seed);
          const stats = (maze as LegacyMazeSnapshot).reverseStats!;
          expect(stats.floor).toBe(905);
          expect(stats.reverseFelt).toBeGreaterThanOrEqual(905);
          expect((maze as LegacyMazeSnapshot).fringeStats?.cells).toBe(GEOMETRY_BUDGET_FRINGE_CAP);
          expect((maze as unknown as { masteryStats?: unknown }).masteryStats).toBeUndefined();
        }
      }
    }
  }, 120_000);
});

describe('progression ladder: beyond the hard ceiling', () => {
  test('every level at or past the ceiling is valid, deterministic, solvable and the same difficulty class', () => {
    const ordinals = [SAT, SAT + 1, SAT + 2, 300, 1000, 1_000_000];
    for (const board of LADDER_BOARDS) {
      const hashes = new Set<string>();
      for (const level of ordinals) {
        const maze = generateLadderMaze(level, board, 4242 + level);
        const again = generateLadderMaze(level, board, 4242 + level);
        expect(hashLadderMaze(again)).toBe(hashLadderMaze(maze));
        expect(maze.solutionPath.length).toBeGreaterThan(2);
        const sample = sampleLevel(level, board, 4242 + level);
        expect(sample.felt).toBeGreaterThanOrEqual(GEOMETRY_BUDGET_TOP_TARGET);
        expect(sample.felt).toBeLessThanOrEqual(GEOMETRY_BUDGET_TOP_TARGET + GEOMETRY_BUDGET_WINDOW);
        hashes.add(hashLadderMaze(maze));
      }
      // Documented seed progression: the play seed still advances one per level, so the
      // ceiling-class mazes are distinct (same class, different maze).
      expect(hashes.size).toBe(ordinals.length);
    }
  }, 120_000);

  test('the geometry seam clamps at the ceiling for an arbitrarily large ordinal and never throws', () => {
    const base = createEmptyLegacyProgressionState().tracks.player;
    for (const level of [String(SAT - 1), String(SAT), String(SAT + 1), '999999999999', '9'.repeat(60)]) {
      const track = { ...base, level, targetComplexity: 400 };
      expect(resolveGeometryBudgetLevel(track)).toBe(Math.min(SAT, Math.max(99, Number(level))));
      expect(resolveLegacyMazeGenerationProfileForProgression(track).geometryBudgetLevel).toBe(Math.min(SAT, Math.max(99, Number(level))));
    }
    // Garbage ordinals fall back to the bounded level.
    for (const level of ['', 'abc', '-5', '0']) {
      expect(resolveGeometryBudgetLevel({ ...base, level, targetComplexity: 400 })).toBe(99);
    }
  });

  test('a drifted saved state (ordinal 18000, target of a level-25 or level-1 player) generates at the displayed level, through the real reader and the authoritative path', () => {
    const empty = createEmptyLegacyProgressionState();
    for (const targetComplexity of [8, 8 + (24 * 4), 8 + (97 * 4), 400]) {
      const saved = {
        ...empty,
        tracks: {
          ...empty.tracks,
          player: { ...empty.tracks.player, completedCycles: '17999', level: '18000', peakComplexity: targetComplexity, targetComplexity }
        }
      };
      const storage = new MemoryStorage();
      storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(saved));
      const local = readLegacyProgressionState(storage).tracks.player;
      const remote = normalizeLegacyAuthoritativeProgressionState(saved).tracks.player;
      for (const track of [local, remote]) {
        // The label is untouched (nothing is rewritten) ...
        expect(track.level).toBe('18000');
        // ... and the maze is the ceiling class, whatever the stored target was.
        expect(resolveGeometryBudgetLevel(track)).toBe(SAT);
        expect(resolveLegacyMazeGenerationProfileForProgression(track).geometryBudgetLevel).toBe(SAT);
      }
    }
  });
});

describe('saved progression stays valid (a player at level N keeps level N)', () => {
  const savedPlayerAt = (level: number) => {
    const baseline = createEmptyLegacyProgressionState();
    return {
      ...baseline,
      tracks: {
        ...baseline.tracks,
        player: {
          ...baseline.tracks.player,
          completedCycles: String(level - 1),
          level: String(level),
          targetComplexity: Math.min(400, 8 + ((level - 1) * 4))
        }
      }
    };
  };

  test('reading a saved state keeps the ordinal and derives the new geometry level without rewriting anything', () => {
    for (const level of [1, 2, 5, 30, 54, 98, 99, 100, 101, 150, SAT, SAT + 1, 400, 5000]) {
      const storage = new MemoryStorage();
      storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(savedPlayerAt(level)));
      const state = readLegacyProgressionState(storage);
      expect(state.version).toBe(1);
      expect(state.tracks.player.level).toBe(String(level));
      expect(state.tracks.player.completedCycles).toBe(String(level - 1));
      const geometryLevel = resolveGeometryBudgetLevel(state.tracks.player);
      if (level === 1) {
        expect(geometryLevel).toBeNull();
      } else {
        // Same level below the bounded top; ordinal-driven (clamped at the ceiling) above it.
        expect(geometryLevel).toBe(Math.min(SAT, level));
      }
    }
  });

  test('a re-saved state round-trips byte-for-byte through the reader', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(savedPlayerAt(150)));
    const once = readLegacyProgressionState(storage);
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(once));
    const twice = readLegacyProgressionState(storage);
    expect(twice.tracks.player).toEqual(once.tracks.player);
    expect(twice.version).toBe(1);
  });

  test('the saved-state schema version and the stored-field set are unchanged by this lane', () => {
    const state = createEmptyLegacyProgressionState();
    expect(state.version).toBe(1);
    expect(Object.keys(state.tracks.player).sort()).toEqual([
      'bestCompletionTimeMs', 'cleanCycles', 'colorTier', 'completedCycles', 'lastCompletedAt',
      'lastCompletionTimeMs', 'lastMazeSeed', 'lastReceiptId', 'lastSignal', 'level', 'paceScore',
      'peakComplexity', 'rank', 'recentSignals', 'struggleCycles', 'targetComplexity'
    ]);
  });
});

describe('progression ladder golden fingerprints (levels 1..300)', () => {
  // Regenerate deliberately with
  //   npx vite-node scripts/analysis/progression-ladder-golden.ts --write
  // and explain the change in review: it reshuffles every player's mazes.
  const golden = JSON.parse(readFileSync(new URL('../fixtures/progression-ladder-golden.v1.json', import.meta.url), 'utf8')) as {
    seed: number;
    levels: number;
    hashes: Record<string, Record<string, string>>;
  };

  test('fresh generation reproduces the pinned fingerprint of every level on both frozen boards', () => {
    expect(golden.levels).toBe(300);
    const mismatches: string[] = [];
    for (const board of LADDER_BOARDS) {
      for (let level = 1; level <= golden.levels; level += 1) {
        const hash = hashLadderMaze(generateLadderMaze(level, board, golden.seed + level));
        if (golden.hashes[board.name]?.[String(level)] !== hash) {
          mismatches.push(`${board.name}:${level}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  }, 300_000);
});
