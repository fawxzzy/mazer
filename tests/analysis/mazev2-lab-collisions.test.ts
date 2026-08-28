import { describe, expect, test } from 'vitest';
import { classifyMazeV2LabCollisions, type MazeV2LabCollisionSample } from '../../scripts/analysis/mazeV2LabCollisions';

const baseSample = (overrides: Partial<MazeV2LabCollisionSample> & { level: number }): MazeV2LabCollisionSample => ({
  requestedSeed: overrides.level,
  selectedSeed: overrides.level,
  topologyFingerprint: `topology-${overrides.level}`,
  metricFingerprint: `metric-${overrides.level}`,
  recipeDigest: `recipe-${overrides.level}`,
  ...overrides
});

describe('classifyMazeV2LabCollisions', () => {
  test('reports no collisions when every identity is unique', () => {
    const samples = [1, 2, 3].map((level) => baseSample({ level }));
    const report = classifyMazeV2LabCollisions(samples);
    expect(report.sameRequestedAndSelectedSeed).toHaveLength(0);
    expect(report.differentRequestedSameSelectedSeed).toHaveLength(0);
    expect(report.differentSelectedSeedSameTopology).toHaveLength(0);
    expect(report.differentTopologySameMetricFingerprint).toHaveLength(0);
    expect(report.sameRecipeDigest).toHaveLength(0);
    expect(report.digestCollisionAcrossDifferentRecipes).toHaveLength(0);
  });

  test('category 1: same requested AND selected seed across levels', () => {
    const samples = [
      baseSample({ level: 1, requestedSeed: 500, selectedSeed: 500 }),
      baseSample({ level: 2, requestedSeed: 500, selectedSeed: 500 })
    ];
    const report = classifyMazeV2LabCollisions(samples);
    expect(report.sameRequestedAndSelectedSeed).toHaveLength(1);
    expect(report.sameRequestedAndSelectedSeed[0]?.levels).toEqual([1, 2]);
  });

  test('category 2: different requested seed, same selected seed -- the original Wave 1 bug mechanism', () => {
    const samples = [
      baseSample({ level: 1, requestedSeed: 100, selectedSeed: 999 }),
      baseSample({ level: 2, requestedSeed: 101, selectedSeed: 999 })
    ];
    const report = classifyMazeV2LabCollisions(samples);
    expect(report.differentRequestedSameSelectedSeed).toHaveLength(1);
    expect(report.differentRequestedSameSelectedSeed[0]?.levels).toEqual([1, 2]);
    // Not the same as category 1 -- requested seeds actually differ here.
    expect(report.sameRequestedAndSelectedSeed).toHaveLength(0);
  });

  test('category 3: different selected seed, same topology -- a genuine generator collision', () => {
    const samples = [
      baseSample({ level: 1, selectedSeed: 1, topologyFingerprint: 'shared-topology' }),
      baseSample({ level: 2, selectedSeed: 2, topologyFingerprint: 'shared-topology' })
    ];
    const report = classifyMazeV2LabCollisions(samples);
    expect(report.differentSelectedSeedSameTopology).toHaveLength(1);
    expect(report.differentSelectedSeedSameTopology[0]?.levels).toEqual([1, 2]);
  });

  test('category 4: different topology, same metric fingerprint -- coincidental, not a duplicate maze', () => {
    const samples = [
      baseSample({ level: 1, topologyFingerprint: 'topo-a', metricFingerprint: 'shared-metric' }),
      baseSample({ level: 2, topologyFingerprint: 'topo-b', metricFingerprint: 'shared-metric' })
    ];
    const report = classifyMazeV2LabCollisions(samples);
    expect(report.differentTopologySameMetricFingerprint).toHaveLength(1);
    expect(report.differentTopologySameMetricFingerprint[0]?.levels).toEqual([1, 2]);
  });

  test('same metric fingerprint but also the same topology is NOT reported as category 4 (that would just be the same maze, not a coincidence)', () => {
    const samples = [
      baseSample({ level: 1, topologyFingerprint: 'shared-topology', metricFingerprint: 'shared-metric' }),
      baseSample({ level: 2, topologyFingerprint: 'shared-topology', metricFingerprint: 'shared-metric' })
    ];
    const report = classifyMazeV2LabCollisions(samples);
    expect(report.differentTopologySameMetricFingerprint).toHaveLength(0);
  });

  test('category 5: same recipe digest', () => {
    const samples = [
      baseSample({ level: 1, recipeDigest: 'shared-recipe' }),
      baseSample({ level: 2, recipeDigest: 'shared-recipe' })
    ];
    const report = classifyMazeV2LabCollisions(samples);
    expect(report.sameRecipeDigest).toHaveLength(1);
    expect(report.sameRecipeDigest[0]?.levels).toEqual([1, 2]);
  });

  test('category 6 is always reported empty -- structurally undetectable, not silently unimplemented', () => {
    const report = classifyMazeV2LabCollisions([baseSample({ level: 1 })]);
    expect(report.digestCollisionAcrossDifferentRecipes).toEqual([]);
  });

  test('a group of more than two levels is reported as one group, not pairwise', () => {
    const samples = [1, 2, 3].map((level) => baseSample({ level, requestedSeed: 42, selectedSeed: 42 }));
    const report = classifyMazeV2LabCollisions(samples);
    expect(report.sameRequestedAndSelectedSeed).toHaveLength(1);
    expect(report.sameRequestedAndSelectedSeed[0]?.levels).toEqual([1, 2, 3]);
  });
});
