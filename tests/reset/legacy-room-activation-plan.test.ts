import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  LEGACY_ROOM_ACTIVATION_PLAN_CONTRACT_VERSION,
  createLegacyRoomActivationPlan
} from '../../src/legacy-runtime/legacyRoomActivationPlan';
import {
  LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES,
  createLegacyRoomCandidateMetadata,
  type LegacyRoomCandidateMetadata
} from '../../src/legacy-runtime/legacyRoomCandidateMetadata';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { createLegacyStaticSlowTileState } from '../../src/legacy-runtime/legacyStaticSlowTile';

const bands = [
  { band: 'architect' as const, scale: 71, targetComplexity: 132 },
  { band: 'mythic' as const, scale: 96, targetComplexity: 180 }
];

const createFixture = (bandIndex = 0, seed = 1) => {
  const { band, scale, targetComplexity } = bands[bandIndex]!;
  const profile = resolveLegacyMazeGenerationProfileForProgression(targetComplexity);
  const maze = createLegacyRuntimeMazeForMode('play', scale, seed, profile);
  const slowTile = createLegacyStaticSlowTileState(maze, band);
  const metadata = createLegacyRoomCandidateMetadata(
    maze,
    band,
    slowTile.placement?.point ?? null
  );
  expect(metadata).not.toBeNull();
  return { band, maze, metadata: metadata!, seed, slowTile };
};

const buildCorpusFixtures = () => bands.flatMap((_, bandIndex) => (
  Array.from({ length: 100 }, (_, seedIndex) => createFixture(bandIndex, seedIndex + 1))
));

const buildCorpusProjection = (fixtures: ReturnType<typeof buildCorpusFixtures>) => (
  fixtures.map(({ band, maze, metadata, seed, slowTile }) => {
    const mazeBefore = JSON.stringify(maze);
    const metadataBefore = JSON.stringify(metadata);
    const plan = createLegacyRoomActivationPlan(maze, metadata);

    expect(plan, `${band} seed ${seed}`).not.toBeNull();
    expect(plan).toMatchObject({
      band,
      contractVersion: LEGACY_ROOM_ACTIVATION_PLAN_CONTRACT_VERSION,
      feasible: true,
      maximumSimulatedSideClosureEdges: LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES,
      roomsEnabled: false,
      routeOpeningsPreserved: true,
      source: 'room-candidate-v7-feasibility-only',
      sourceMetadataContractVersion: 'legacy-room-candidate-metadata-v7',
      startGoalReachable: true
    });
    expect(plan!.blockedEdges).toHaveLength(metadata.sideClosureCount);
    expect(plan!.blockedEdges.length).toBeLessThanOrEqual(
      LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES
    );
    expect(plan!.routeOpeningEdges).toEqual(metadata.routeOpeningEdges);
    expect(plan!.topologyView).toEqual({
      goal: maze.goal,
      grid: maze.grid,
      solutionPath: maze.solutionPath,
      start: maze.start
    });
    expect(plan!.topologyView.grid).not.toBe(maze.grid);
    expect(plan!.topologyView.solutionPath).not.toBe(maze.solutionPath);
    expect(JSON.stringify(maze)).toBe(mazeBefore);
    expect(JSON.stringify(metadata)).toBe(metadataBefore);
    expect(slowTile.placement?.point ?? null).not.toEqual(metadata.candidate.topLeft);

    return {
      band,
      blockedEdges: plan!.blockedEdges,
      feasible: plan!.feasible,
      routeOpeningEdges: plan!.routeOpeningEdges,
      seed
    };
  })
);

const expectRejectedWithoutThrow = (
  maze: unknown,
  metadata: unknown,
  label: string
) => {
  let result: ReturnType<typeof createLegacyRoomActivationPlan> | undefined;
  expect(() => {
    result = createLegacyRoomActivationPlan(maze, metadata);
  }, label).not.toThrow();
  expect(result, label).toBeNull();
};

describe('legacy room activation feasibility plan', () => {
  test('is deterministic across two complete Architect and Mythic corpus passes', () => {
    const fixtures = buildCorpusFixtures();
    const firstPass = JSON.stringify(buildCorpusProjection(fixtures));
    const secondPass = JSON.stringify(buildCorpusProjection(fixtures));
    expect(secondPass).toBe(firstPass);
  }, 120_000);

  test('deep-clones emitted topology, edge, and point data without mutating source state', () => {
    const { maze, metadata } = createFixture(1, 7);
    const mazeBefore = structuredClone(maze);
    const metadataBefore = structuredClone(metadata);
    const plan = createLegacyRoomActivationPlan(maze, metadata)!;

    plan.topologyView.grid[plan.topologyView.start.y]![plan.topologyView.start.x] = false;
    plan.topologyView.start.x += 100;
    plan.topologyView.goal.y += 100;
    plan.topologyView.solutionPath[0]!.x += 100;
    if (plan.blockedEdges[0]) {
      plan.blockedEdges[0].inside.x += 100;
      plan.blockedEdges[0].outside.y += 100;
    }
    plan.routeOpeningEdges[0]!.inside.x += 100;
    plan.routeOpeningEdges[0]!.outside.y += 100;

    expect(maze).toEqual(mazeBefore);
    expect(metadata).toEqual(metadataBefore);
  });

  test('rejects absent metadata and closure plans beyond the exact bound', () => {
    const { maze, metadata } = createFixture();
    expect(createLegacyRoomActivationPlan(maze, null)).toBeNull();
    for (const band of ['tutorial', 'starter', 'explorer', 'navigator'] as const) {
      expect(createLegacyRoomActivationPlan(
        maze,
        createLegacyRoomCandidateMetadata(maze, band)
      )).toBeNull();
    }

    const firstEdge = metadata.sideClosureEdges[0] ?? {
      inside: { ...metadata.routeOpeningEdges[0]!.inside },
      kind: 'side' as const,
      outside: { ...metadata.routeOpeningEdges[0]!.outside },
      side: metadata.routeOpeningEdges[0]!.side
    };
    const overBound = structuredClone(metadata) as LegacyRoomCandidateMetadata;
    overBound.sideClosureEdges = [
      structuredClone(firstEdge),
      structuredClone(firstEdge),
      structuredClone(firstEdge)
    ];
    overBound.sideClosureCount = overBound.sideClosureEdges.length;
    expect(createLegacyRoomActivationPlan(maze, overBound)).toBeNull();
  });

  test('returns null without throwing for malformed, incomplete, and ineligible runtime shapes', () => {
    const { maze, metadata } = createFixture(1, 9);
    const incompleteMetadata = {
      band: metadata.band,
      contractVersion: metadata.contractVersion,
      roomsEnabled: false,
      routeOpeningCount: metadata.routeOpeningCount,
      routeOpeningEdges: structuredClone(metadata.routeOpeningEdges),
      sideClosureCount: metadata.sideClosureCount,
      sideClosureEdges: structuredClone(metadata.sideClosureEdges),
      source: metadata.source
    };
    const cases: Array<{ label: string; maze: unknown; metadata: unknown }> = [
      {
        label: 'missing maze grid',
        maze: { ...maze, grid: undefined },
        metadata
      },
      {
        label: 'null solution path',
        maze: { ...maze, solutionPath: null },
        metadata
      },
      {
        label: 'missing side closure edges',
        maze,
        metadata: { ...metadata, sideClosureEdges: undefined }
      },
      {
        label: 'ineligible runtime band',
        maze,
        metadata: { ...metadata, band: 'tutorial' }
      },
      { label: 'incomplete v7-like metadata', maze, metadata: incompleteMetadata }
    ];
    for (const runtimeCase of cases) {
      expectRejectedWithoutThrow(runtimeCase.maze, runtimeCase.metadata, runtimeCase.label);
    }
  });

  test('rejects accessors before reading their values or nested point data', () => {
    const { maze, metadata } = createFixture(0, 11);
    const mazeWithThrowingGrid = { ...maze };
    Object.defineProperty(mazeWithThrowingGrid, 'grid', {
      enumerable: true,
      get: () => { throw new Error('grid accessor must not escape'); }
    });
    const metadataWithBandAccessor = { ...metadata };
    Object.defineProperty(metadataWithBandAccessor, 'band', {
      enumerable: true,
      get: () => 'architect'
    });
    const metadataWithNestedAccessor = structuredClone(metadata);
    Object.defineProperty(metadataWithNestedAccessor.routeOpeningEdges[0]!.inside, 'x', {
      enumerable: true,
      get: () => metadata.routeOpeningEdges[0]!.inside.x
    });

    expectRejectedWithoutThrow(mazeWithThrowingGrid, metadata, 'throwing grid accessor');
    expectRejectedWithoutThrow(maze, metadataWithBandAccessor, 'band accessor');
    expectRejectedWithoutThrow(maze, metadataWithNestedAccessor, 'nested point accessor');
  });

  test('binds route openings and side closures to the exact ordered v7 perimeter subsets', () => {
    const { maze, metadata } = createFixture(1, 13);
    const duplicateEnter = structuredClone(metadata);
    duplicateEnter.routeOpeningEdges[1]!.kind = 'route-enter';
    expectRejectedWithoutThrow(maze, duplicateEnter, 'duplicate route-enter');

    const reorderedPerimeter = structuredClone(metadata);
    reorderedPerimeter.perimeterOpenings.reverse();
    expectRejectedWithoutThrow(maze, reorderedPerimeter, 'reordered perimeter');

    let twoClosureFixture: ReturnType<typeof createFixture> | null = null;
    for (let seed = 1; seed <= 100 && twoClosureFixture === null; seed += 1) {
      const fixture = createFixture(1, seed);
      if (fixture.metadata.sideClosureEdges.length === 2) {
        twoClosureFixture = fixture;
      }
    }
    expect(twoClosureFixture).not.toBeNull();
    const reorderedClosures = structuredClone(twoClosureFixture!.metadata);
    reorderedClosures.sideClosureEdges.reverse();
    expectRejectedWithoutThrow(
      twoClosureFixture!.maze,
      reorderedClosures,
      'reordered side closures'
    );
  });

  test('remains a source-only plan with no scene or runtime consumer', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(
      resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'),
      'utf8'
    );

    expect(menuSceneSource).not.toContain('createLegacyRoomActivationPlan');
    expect(diagnosticsSource).not.toContain('LegacyRoomActivationPlan');
  });
});
