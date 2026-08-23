import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { createLegacyRoomCandidateMetadata } from '../../src/legacy-runtime/legacyRoomCandidateMetadata';
import {
  LEGACY_ROOM_ACTIVATION_PREVIEW_EDGES_CONTRACT_VERSION,
  LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_MAXIMUM_SEGMENTS_PER_MAZE,
  LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_REQUIRED_ROUTE_OPEN_SEGMENTS,
  createLegacyRoomActivationPreviewEdges
} from '../../src/legacy-runtime/legacyRoomActivationPreviewEdges';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import { createLegacyStaticSlowTileState } from '../../src/legacy-runtime/legacyStaticSlowTile';

// targetComplexity doubled (in real-level terms) from what used to reach
// each band -- resolveLegacyProgressionDifficultyProfile now halves the
// real level before picking a band, so it takes twice the real level to
// reach the same band. scale (the band's own targetScale) is unchanged.
const bands = [
  { band: 'architect' as const, scale: 71, targetComplexity: 256 },
  { band: 'mythic' as const, scale: 96, targetComplexity: 352 }
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
  return { band, maze, metadata: metadata!, seed };
};

const buildCorpusFixtures = () => bands.flatMap((_, bandIndex) => (
  Array.from({ length: 100 }, (_, seedIndex) => createFixture(bandIndex, seedIndex + 1))
));

const buildCorpusProjection = (fixtures: ReturnType<typeof buildCorpusFixtures>) => (
  fixtures.map(({ band, maze, metadata, seed }) => {
    const mazeBefore = JSON.stringify(maze);
    const metadataBefore = JSON.stringify(metadata);
    const previewEdges = createLegacyRoomActivationPreviewEdges(maze, metadata);

    expect(previewEdges, `${band} seed ${seed}`).toMatchObject({
      band,
      contractVersion: LEGACY_ROOM_ACTIVATION_PREVIEW_EDGES_CONTRACT_VERSION,
      maximumPreviewEdgeSegmentsPerMaze:
        LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_MAXIMUM_SEGMENTS_PER_MAZE,
      previewEdgeSegmentCount: 2 + metadata.sideClosureEdges.length,
      requiredRouteOpenSegments:
        LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_REQUIRED_ROUTE_OPEN_SEGMENTS,
      roomsEnabled: false,
      source: 'room-activation-preview-cue-v1'
    });
    expect(previewEdges!.segments).toHaveLength(2 + metadata.sideClosureEdges.length);
    expect(previewEdges!.segments).toEqual([
      ...metadata.routeOpeningEdges.map((edge, segmentIndex) => ({
        inside: edge.inside,
        outside: edge.outside,
        role: 'route-open',
        segmentIndex,
        side: edge.side,
        sourceKind: edge.kind
      })),
      ...metadata.sideClosureEdges.map((edge, blockedIndex) => ({
        inside: edge.inside,
        outside: edge.outside,
        role: 'blocked',
        segmentIndex: metadata.routeOpeningEdges.length + blockedIndex,
        side: edge.side,
        sourceKind: edge.kind
      }))
    ]);
    expect(previewEdges!.segments.slice(0, 2).every((segment) => segment.role === 'route-open'))
      .toBe(true);
    expect(previewEdges!.segments.slice(2).every((segment) => segment.role === 'blocked'))
      .toBe(true);
    expect(previewEdges!.segments.every((segment) => (
      Math.abs(segment.inside.x - segment.outside.x)
      + Math.abs(segment.inside.y - segment.outside.y)
    ) === 1)).toBe(true);
    expect(JSON.stringify(maze)).toBe(mazeBefore);
    expect(JSON.stringify(metadata)).toBe(metadataBefore);

    return { band, previewEdges, seed };
  })
);

describe('legacy room activation preview edges', () => {
  test('emits at most four ordered segments across two deterministic 200-fixture passes', () => {
    const fixtures = buildCorpusFixtures();
    const firstPass = JSON.stringify(buildCorpusProjection(fixtures));
    const secondPass = JSON.stringify(buildCorpusProjection(fixtures));
    expect(secondPass).toBe(firstPass);
  }, 120_000);

  test('returns null without throwing or echoing absent malformed ineligible and infeasible inputs', () => {
    const { maze, metadata } = createFixture();
    const blockedRouteOpening = structuredClone(metadata);
    blockedRouteOpening.sideClosureEdges = [
      ...blockedRouteOpening.sideClosureEdges,
      {
        inside: { ...blockedRouteOpening.routeOpeningEdges[0]!.inside },
        kind: 'side',
        outside: { ...blockedRouteOpening.routeOpeningEdges[0]!.outside },
        side: blockedRouteOpening.routeOpeningEdges[0]!.side
      }
    ];
    blockedRouteOpening.sideClosureCount = blockedRouteOpening.sideClosureEdges.length;
    const cases: Array<[string, unknown, unknown]> = [
      ['absent maze', null, metadata],
      ['absent metadata', maze, null],
      ['malformed maze', { ...maze, grid: undefined }, metadata],
      ['malformed metadata', maze, { ...metadata, routeOpeningEdges: undefined }],
      ['ineligible band', maze, { ...metadata, band: 'tutorial' }],
      ['infeasible blocked route opening', maze, blockedRouteOpening]
    ];

    for (const [label, mazeValue, metadataValue] of cases) {
      let result: unknown = Symbol('not-called');
      expect(() => {
        result = createLegacyRoomActivationPreviewEdges(mazeValue, metadataValue);
      }, label).not.toThrow();
      expect(result, label).toBeNull();
      if (mazeValue !== null) {
        expect(result, label).not.toBe(mazeValue);
      }
      if (metadataValue !== null) {
        expect(result, label).not.toBe(metadataValue);
      }
    }
  });

  test('deep-clones every emitted point and edge without mutating inputs or later results', () => {
    const { maze, metadata } = createFixture(1, 7);
    const mazeBefore = structuredClone(maze);
    const metadataBefore = structuredClone(metadata);
    const first = createLegacyRoomActivationPreviewEdges(maze, metadata)!;
    const secondBefore = createLegacyRoomActivationPreviewEdges(maze, metadata)!;

    expect(first.segments[0]!.inside).not.toBe(metadata.routeOpeningEdges[0]!.inside);
    expect(first.segments[0]!.outside).not.toBe(metadata.routeOpeningEdges[0]!.outside);
    first.segments[0]!.inside.x += 100;
    first.segments[0]!.outside.y += 100;
    first.segments.reverse();

    expect(maze).toEqual(mazeBefore);
    expect(metadata).toEqual(metadataBefore);
    expect(createLegacyRoomActivationPreviewEdges(maze, metadata)).toEqual(secondBefore);
  });

  test('remains source-only with no scene renderer or diagnostics consumer', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(
      resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'),
      'utf8'
    );

    expect(menuSceneSource).not.toContain('createLegacyRoomActivationPreviewEdges');
    expect(diagnosticsSource).not.toContain('LegacyRoomActivationPreviewEdges');
  });
});
