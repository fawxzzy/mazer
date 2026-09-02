import { describe, expect, test } from 'vitest';
import { MAZE_V2_CONVERGENCE_CORPUS } from '../../scripts/analysis/mazev2ConvergenceCorpus';
import { MAZE_V2_LAB_DEFAULT_SEED_CORPUS } from '../../scripts/analysis/mazeV2SeedStrategies';

describe('MAZE_V2_CONVERGENCE_CORPUS (Wave 1.5 PR D)', () => {
  test('has 13 executable recipes and one explicit unsupported endpoint axis', () => {
    expect(MAZE_V2_CONVERGENCE_CORPUS).toHaveLength(14);
    expect(MAZE_V2_CONVERGENCE_CORPUS.filter((recipe) => !recipe.unsupportedReason)).toHaveLength(13);
  });

  test('every recipe has a unique name', () => {
    const names = MAZE_V2_CONVERGENCE_CORPUS.map((recipe) => recipe.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every recipe has positive dimensions and an in-range targetComplexity', () => {
    for (const recipe of MAZE_V2_CONVERGENCE_CORPUS) {
      expect(recipe.width).toBeGreaterThan(0);
      expect(recipe.height).toBeGreaterThan(0);
      expect(recipe.targetComplexity).toBeGreaterThanOrEqual(0);
      expect(recipe.targetComplexity).toBeLessThanOrEqual(100);
    }
  });

  test('every recipe documents both a reason and an honesty note', () => {
    for (const recipe of MAZE_V2_CONVERGENCE_CORPUS) {
      expect(recipe.reason.length).toBeGreaterThan(0);
      expect(recipe.note.length).toBeGreaterThan(0);
    }
  });

  test('includes a wide and a tall rectangular recipe with transposed dimensions', () => {
    const wide = MAZE_V2_CONVERGENCE_CORPUS.find((recipe) => recipe.name === 'wide-rectangular-footprint');
    const tall = MAZE_V2_CONVERGENCE_CORPUS.find((recipe) => recipe.name === 'tall-rectangular-footprint');
    expect(wide).toBeDefined();
    expect(tall).toBeDefined();
    expect(wide!.width).toBe(tall!.height);
    expect(wide!.height).toBe(tall!.width);
  });

  test('exactly one recipe requests explicit wrap topology', () => {
    const wrapRecipes = MAZE_V2_CONVERGENCE_CORPUS.filter((recipe) => recipe.requireWrap === true);
    expect(wrapRecipes).toHaveLength(1);
    expect(wrapRecipes[0]?.name).toBe('explicit-wrap-bleed-demand');
  });

  test('has no duplicate executable recipe inputs and marks endpoint placement unsupported once', () => {
    const executable = MAZE_V2_CONVERGENCE_CORPUS.filter((recipe) => !recipe.unsupportedReason);
    const signatures = executable.map((recipe) => JSON.stringify({
      width: recipe.width,
      height: recipe.height,
      targetComplexity: recipe.targetComplexity,
      requireWrap: recipe.requireWrap ?? false
    }));
    expect(new Set(signatures).size).toBe(signatures.length);

    const unsupported = MAZE_V2_CONVERGENCE_CORPUS.filter((recipe) => recipe.unsupportedReason);
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]?.name).toBe('endpoint-placement-unsupported');
    expect(unsupported[0]?.unsupportedReason).toContain('endpoint-placement');
  });
});

describe('seed corpus reuse (Wave 1.5 PR D)', () => {
  test('the convergence harness reuses the committed 32-seed corpus from PR A, not a smaller one', () => {
    expect(MAZE_V2_LAB_DEFAULT_SEED_CORPUS.length).toBeGreaterThanOrEqual(32);
  });
});
