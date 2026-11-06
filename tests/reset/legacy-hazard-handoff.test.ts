import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { GEOMETRY_BUDGET_SATURATION_LEVEL } from '../../src/legacy-runtime/legacyGeometryBudget';
import {
  LEGACY_HAZARD_LAYER_ENABLED,
  LEGACY_PHASE2_FEATURE_REGISTRY,
  resolveLegacyHazardHandoff
} from '../../src/legacy-runtime/legacyHazardHandoff';
import {
  createEmptyLegacyProgressionState,
  resolveLegacyMazeGenerationProfileForProgression
} from '../../src/legacy-runtime/legacyProgression';

const listSource = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? listSource(path) : (path.endsWith('.ts') ? [path] : []);
});

describe('Phase 2 hazard hand-off stays dormant', () => {
  test('the feature switch is a literal false and the registry is frozen and off', () => {
    expect(LEGACY_HAZARD_LAYER_ENABLED).toBe(false);
    expect(LEGACY_PHASE2_FEATURE_REGISTRY.hazards.enabled).toBe(false);
    expect(LEGACY_PHASE2_FEATURE_REGISTRY.hazards.status).toBe('dormant-awaiting-product-contract');
    expect(Object.isFrozen(LEGACY_PHASE2_FEATURE_REGISTRY)).toBe(true);
    expect(Object.isFrozen(LEGACY_PHASE2_FEATURE_REGISTRY.hazards)).toBe(true);
  });

  test('the hand-off reports the owed hazard budget as level - saturation, with nothing active', () => {
    for (const level of [1, 2, 50, GEOMETRY_BUDGET_SATURATION_LEVEL - 1]) {
      expect(resolveLegacyHazardHandoff(level)).toMatchObject({ geometrySaturated: false, hazardBudgetLevels: 0, hazardsActive: false });
    }
    for (const level of [GEOMETRY_BUDGET_SATURATION_LEVEL, GEOMETRY_BUDGET_SATURATION_LEVEL + 1, 300, 1000, 1_000_000]) {
      const handoff = resolveLegacyHazardHandoff(level);
      expect(handoff.geometrySaturated).toBe(true);
      expect(handoff.hazardBudgetLevels).toBe(level - GEOMETRY_BUDGET_SATURATION_LEVEL);
      expect(handoff.hazardsActive).toBe(false);
      expect(handoff.obstacles).toEqual([]);
      expect(handoff.enemies).toEqual([]);
    }
  });

  test('no generated maze or generation profile at any ladder level carries hazard data', () => {
    const baseline = createEmptyLegacyProgressionState().tracks.player;
    for (const level of [1, 2, 40, 99, 100, GEOMETRY_BUDGET_SATURATION_LEVEL, GEOMETRY_BUDGET_SATURATION_LEVEL + 1, 300, 5000]) {
      const track = { ...baseline, level: String(level), targetComplexity: Math.min(400, 8 + ((level - 1) * 4)) };
      const profile = resolveLegacyMazeGenerationProfileForProgression(track);
      const maze = createLegacyRuntimeMazeForMode('play', 35, 99 + level, profile, {}, 23 / 51);
      const serialized = JSON.stringify({ profile, maze });
      expect(serialized).not.toMatch(/hazard|enem(y|ies)|obstacle/i);
    }
  });

  test('no runtime module reads the switch or imports the hand-off module (nothing can reach a hazard path)', () => {
    const root = join(__dirname, '..', '..', 'src');
    const offenders: string[] = [];
    for (const file of listSource(root)) {
      if (file.endsWith('legacyHazardHandoff.ts')) { continue; }
      const source = readFileSync(file, 'utf8');
      if (/LEGACY_HAZARD_LAYER_ENABLED|legacyHazardHandoff|LEGACY_PHASE2_FEATURE_REGISTRY/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  }, 60_000);

  test('the draft hazard graph adapter is still imported by no scene or runtime module', () => {
    const root = join(__dirname, '..', '..', 'src');
    const importers = listSource(root).filter((file) => (
      !file.endsWith('legacyHazardGraphAdapter.ts')
      && /legacyHazardGraphAdapter/.test(readFileSync(file, 'utf8'))
    ));
    expect(importers).toEqual([]);
  }, 60_000);
});
