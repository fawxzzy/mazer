import { describe, expect, test } from 'vitest';
import { MAZE_V2_CONVERGENCE_CORPUS } from '../../scripts/analysis/mazev2ConvergenceCorpus';
import { MAZE_V2_LAB_DEFAULT_SEED_CORPUS } from '../../scripts/analysis/mazeV2SeedStrategies';

describe('MAZE_V2_CONVERGENCE_CORPUS (Wave 1.5 PR D)', () => {
  test('has exactly the 15 required recipes', () => {
    expect(MAZE_V2_CONVERGENCE_CORPUS).toHaveLength(15);
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

  test('the distant-corner and noncorner-offaxis endpoint recipes are paired on every controllable input', () => {
    // Per the recipe's own honest note: neither engine exposes placement
    // control, so these two are only meaningfully comparable if every OTHER
    // input matches -- otherwise a measured difference could be attributed
    // to the wrong cause.
    const distant = MAZE_V2_CONVERGENCE_CORPUS.find((recipe) => recipe.name === 'distant-corner-endpoints');
    const noncorner = MAZE_V2_CONVERGENCE_CORPUS.find((recipe) => recipe.name === 'noncorner-offaxis-endpoints');
    expect(distant).toBeDefined();
    expect(noncorner).toBeDefined();
    expect(distant!.width).toBe(noncorner!.width);
    expect(distant!.height).toBe(noncorner!.height);
    expect(distant!.targetComplexity).toBe(noncorner!.targetComplexity);
  });
});

describe('seed corpus reuse (Wave 1.5 PR D)', () => {
  test('the convergence harness reuses the committed 32-seed corpus from PR A, not a smaller one', () => {
    expect(MAZE_V2_LAB_DEFAULT_SEED_CORPUS.length).toBeGreaterThanOrEqual(32);
  });
});
