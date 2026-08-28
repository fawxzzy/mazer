import { describe, expect, test } from 'vitest';
import { createMazeV2LegacyRuntimeAdapter } from '../../src/domain/mazeV2/adapters/legacyRuntimeAdapter';
import { createMazeV2DomainMazeAdapter } from '../../src/domain/mazeV2/adapters/domainMazeAdapter';
import { analyzeMazeV2CanonicalMaze } from '../../src/domain/mazeV2/canonicalAnalyzer';
import type { MazeV2ComparisonSampleSpec, MazeV2EngineAdapter } from '../../src/domain/mazeV2/adapters/types';

const sampleSpec: MazeV2ComparisonSampleSpec = {
  label: 'unit-test-small',
  level: 5,
  targetComplexity: 40,
  width: 16,
  height: 16,
  seed: 4242
};

const exerciseAdapterContract = (adapter: MazeV2EngineAdapter): void => {
  test(`${adapter.engineId}: declares a capability assessment for all eight target-vector axes`, () => {
    const axes = adapter.capabilities.map((c) => c.axis);
    for (const expectedAxis of [
      'spatialLoad', 'routeBurden', 'decisionBurden', 'deadEndDeception',
      'turningLoad', 'routeAmbiguity', 'shortcutRelief', 'wrapPressure'
    ]) {
      expect(axes).toContain(expectedAxis);
    }
  });

  test(`${adapter.engineId}: generates a sample whose canonical maze has a walkable path from start to goal`, () => {
    // Deliberately not asserting canonicalMaze.width/height === sampleSpec's
    // requested width/height: neither engine guarantees an exact match (see
    // each adapter's own spatialLoad capability note) -- only that a real,
    // non-empty, connected board comes back.
    const result = adapter.generateSample(sampleSpec);
    expect(result.canonicalMaze.width).toBeGreaterThan(0);
    expect(result.canonicalMaze.height).toBeGreaterThan(0);
    const metrics = analyzeMazeV2CanonicalMaze(result.canonicalMaze);
    expect(metrics.route.shortestPathLength).toBeGreaterThan(0);
    expect(result.generationDurationMs).toBeGreaterThanOrEqual(0);
  });

  test(`${adapter.engineId}: is deterministic for the same spec`, () => {
    const a = adapter.generateSample(sampleSpec);
    const b = adapter.generateSample(sampleSpec);
    expect(analyzeMazeV2CanonicalMaze(a.canonicalMaze).metricFingerprint)
      .toBe(analyzeMazeV2CanonicalMaze(b.canonicalMaze).metricFingerprint);
  });
};

describe('legacy-runtime adapter', () => {
  exerciseAdapterContract(createMazeV2LegacyRuntimeAdapter());
});

describe('src/domain/maze adapter', () => {
  exerciseAdapterContract(createMazeV2DomainMazeAdapter());

  test('reports no wrap topology support, matching the engine having no wrap concept at all', () => {
    const adapter = createMazeV2DomainMazeAdapter();
    const wrapCapability = adapter.capabilities.find((c) => c.axis === 'wrapPressure');
    expect(wrapCapability?.status).toBe('unsupported');
    const result = adapter.generateSample(sampleSpec);
    expect(result.canonicalMaze.wrapPairs).toEqual([]);
  });
});
