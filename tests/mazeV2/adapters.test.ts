import { describe, expect, test } from 'vitest';
import { createMazeV2LegacyRuntimeAdapter } from '../../src/domain/mazeV2/adapters/legacyRuntimeAdapter';
import { createMazeV2DomainMazeAdapter } from '../../src/domain/mazeV2/adapters/domainMazeAdapter';
import { analyzeMazeV2CanonicalMaze } from '../../src/domain/mazeV2/canonicalAnalyzer';
import type { MazeV2ComparisonSampleSpec, MazeV2EngineAdapter } from '../../src/domain/mazeV2/adapters/types';

const sampleSpec: MazeV2ComparisonSampleSpec = {
  label: 'unit-test-small',
  level: 5,
  lane: 'raw-carving',
  targetComplexity: 40,
  width: 16,
  height: 16,
  seed: 4242
};
const productionLaneSpec: MazeV2ComparisonSampleSpec = { ...sampleSpec, lane: 'production-pipeline' };

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

  test(`${adapter.engineId}: generates a raw-carving-lane sample whose canonical maze has a walkable path from start to goal`, () => {
    // Deliberately not asserting canonicalMaze.width/height === sampleSpec's
    // requested width/height: neither engine guarantees an exact match (see
    // each adapter's own spatialLoad capability note) -- only that a real,
    // non-empty, connected board comes back. realizedWidth/realizedHeight
    // are the honest field for that, and must always be positive.
    expect(adapter.assessSupport(sampleSpec)).toEqual({ status: 'supported', reason: null });
    const result = adapter.generateSample(sampleSpec);
    expect(result.support.status).toBe('supported');
    expect(result.canonicalMaze.width).toBeGreaterThan(0);
    expect(result.canonicalMaze.height).toBeGreaterThan(0);
    expect(result.realizedWidth).toBeGreaterThan(0);
    expect(result.realizedHeight).toBeGreaterThan(0);
    const metrics = analyzeMazeV2CanonicalMaze(result.canonicalMaze, result.shortcutProvenance);
    expect(metrics.route.shortestPathLength).toBeGreaterThan(0);
    expect(result.generationDurationMs).toBeGreaterThanOrEqual(0);
  });

  test(`${adapter.engineId}: generates a production-pipeline-lane sample whose canonical maze has a walkable path from start to goal`, () => {
    const result = adapter.generateSample(productionLaneSpec);
    expect(result.support.status).toBe('supported');
    expect(result.canonicalMaze.width).toBeGreaterThan(0);
    expect(result.canonicalMaze.height).toBeGreaterThan(0);
    const metrics = analyzeMazeV2CanonicalMaze(result.canonicalMaze, result.shortcutProvenance);
    expect(metrics.route.shortestPathLength).toBeGreaterThan(0);
  });

  test(`${adapter.engineId}: reports real shortcut provenance, not a hardcoded value`, () => {
    const result = adapter.generateSample(sampleSpec);
    // Both current adapters can report a real shortcutCount (legacy-runtime
    // via maze.shortcutsCreated/shortcutStats, domain-maze via
    // episode.shortcutsCreated) -- PR D's whole point is that this must
    // come from the engine's own generation result, never be silently
    // hardcoded to a fixed value regardless of what the engine actually
    // did. A non-null, non-negative count is the observable proxy for that
    // here; the exact value is intentionally not asserted since it's a
    // real generator output, not a fixture.
    expect(result.shortcutProvenance).not.toBeNull();
    expect(result.shortcutProvenance?.shortcutCount).toBeGreaterThanOrEqual(0);
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

  test('PR D regression: honors requested width/height instead of a fixed board scale', () => {
    // Before PR D, this adapter held board scale fixed regardless of
    // spec.width/height, so a "small" and "large" recipe silently produced
    // the identical board for this engine -- the original convergence
    // findings document openly flagged this as a real gap. A genuinely
    // larger requested board must now produce a genuinely larger realized
    // one.
    const adapter = createMazeV2LegacyRuntimeAdapter();
    const small = adapter.generateSample({ ...sampleSpec, width: 20, height: 20, seed: 111 });
    const large = adapter.generateSample({ ...sampleSpec, width: 80, height: 80, seed: 111 });
    expect(large.realizedWidth).toBeGreaterThan(small.realizedWidth);
    expect(large.realizedHeight).toBeGreaterThan(small.realizedHeight);
  });

  test('maps rectangular requests with area-preserving geometric-mean scale while keeping square behavior unchanged', () => {
    const adapter = createMazeV2LegacyRuntimeAdapter();
    const wide = adapter.generateSample({ ...sampleSpec, width: 60, height: 20, seed: 111 });
    const tall = adapter.generateSample({ ...sampleSpec, width: 20, height: 60, seed: 111 });
    const square = adapter.generateSample({ ...sampleSpec, width: 20, height: 20, seed: 111 });

    expect(wide.engineNotes.requestedScale).toBe(35);
    expect(wide.engineNotes.requestedAspectRatio).toBe(3);
    expect(tall.engineNotes.requestedScale).toBe(35);
    expect(tall.engineNotes.requestedAspectRatio).toBeCloseTo(1 / 3);
    expect([wide.realizedWidth, wide.realizedHeight]).toEqual([61, 25]);
    expect([tall.realizedWidth, tall.realizedHeight]).toEqual([25, 61]);
    expect(wide.realizedWidth).toBe(tall.realizedHeight);
    expect(wide.realizedHeight).toBe(tall.realizedWidth);

    const requestedArea = 60 * 20;
    expect(Math.abs((Number(wide.engineNotes.requestedScale) ** 2) - requestedArea))
      .toBeLessThanOrEqual(35);

    expect(square.engineNotes.requestedScale).toBe(20);
    expect(square.engineNotes.requestedAspectRatio).toBe(1);
    expect([square.realizedWidth, square.realizedHeight]).toEqual([25, 25]);
  });

  test('PR D regression: raw-carving lane examines exactly one candidate (no search)', () => {
    const adapter = createMazeV2LegacyRuntimeAdapter();
    const result = adapter.generateSample({ ...sampleSpec, lane: 'raw-carving', targetComplexity: 95 });
    expect(result.engineNotes.requestedSeed).toBe(result.engineNotes.selectedSeed);
    expect(result.engineNotes.searchedCandidateCount).toBe(1);
  });
});

describe('src/domain/maze adapter', () => {
  exerciseAdapterContract(createMazeV2DomainMazeAdapter());

  test('raw-carving lane disables candidate search with an exact one-attempt ceiling', () => {
    const adapter = createMazeV2DomainMazeAdapter();
    const result = adapter.generateSample({ ...sampleSpec, lane: 'raw-carving', targetComplexity: 95 });
    expect(result.engineNotes.requestedSeed).toBe(result.engineNotes.selectedSeed);
    expect(result.engineNotes.maxAttempts).toBe(1);
    expect(result.engineNotes.candidateSearch).toBe('disabled');
  });

  test('reports no wrap topology support, matching the engine having no wrap concept at all', () => {
    const adapter = createMazeV2DomainMazeAdapter();
    const wrapCapability = adapter.capabilities.find((c) => c.axis === 'wrapPressure');
    expect(wrapCapability?.status).toBe('unsupported');
    for (const lane of ['raw-carving', 'production-pipeline'] as const) {
      const spec = { ...sampleSpec, lane, requireWrap: true };
      const support = adapter.assessSupport(spec);
      expect(support.status).toBe('unsupported');
      expect(support.reason).toContain('wrap');
      expect(() => adapter.generateSample(spec)).toThrow('Unsupported domain-maze sample reached generation');
    }
  });

  test('classifies rectangular production-pipeline requests as unsupported instead of silently measuring a square substitute', () => {
    const adapter = createMazeV2DomainMazeAdapter();
    const spec = { ...productionLaneSpec, width: 60, height: 20 };
    const support = adapter.assessSupport(spec);
    expect(support.status).toBe('unsupported');
    expect(support.reason).toContain('rectangular');
    expect(() => adapter.generateSample(spec)).toThrow('Unsupported domain-maze sample reached generation');
  });
});
