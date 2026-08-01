import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import {
  LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_CONTRACT_VERSION,
  LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_MAXIMUM_PER_MAZE,
  createLegacyRoomActivationPreviewCue
} from '../../src/legacy-runtime/legacyRoomActivationPreviewCue';
import { createLegacyRoomCandidateMetadata } from '../../src/legacy-runtime/legacyRoomCandidateMetadata';
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
  return { band, maze, metadata: metadata!, seed };
};

const buildCorpusFixtures = () => bands.flatMap((_, bandIndex) => (
  Array.from({ length: 100 }, (_, seedIndex) => createFixture(bandIndex, seedIndex + 1))
));

const buildCorpusProjection = (fixtures: ReturnType<typeof buildCorpusFixtures>) => (
  fixtures.map(({ band, maze, metadata, seed }) => {
    const mazeBefore = JSON.stringify(maze);
    const metadataBefore = JSON.stringify(metadata);
    const cue = createLegacyRoomActivationPreviewCue(maze, metadata);

    expect(cue, `${band} seed ${seed}`).toMatchObject({
      band,
      contractVersion: LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_CONTRACT_VERSION,
      cueCount: 1,
      maximumRoomPreviewCuesPerMaze: LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_MAXIMUM_PER_MAZE,
      roomsEnabled: false,
      source: 'room-activation-plan-v1-feasibility-only'
    });
    expect(cue!.blockedEdges).toEqual(metadata.sideClosureEdges);
    expect(cue!.routeOpeningEdges).toEqual(metadata.routeOpeningEdges);
    expect(JSON.stringify(maze)).toBe(mazeBefore);
    expect(JSON.stringify(metadata)).toBe(metadataBefore);

    return { band, cue, seed };
  })
);

describe('legacy room activation preview cue', () => {
  test('emits one deterministic cue across two complete Architect and Mythic corpus passes', () => {
    const fixtures = buildCorpusFixtures();
    const firstPass = JSON.stringify(buildCorpusProjection(fixtures));
    const secondPass = JSON.stringify(buildCorpusProjection(fixtures));
    expect(secondPass).toBe(firstPass);
  }, 120_000);

  test('returns null without throwing for absent malformed and ineligible inputs', () => {
    const { maze, metadata } = createFixture();
    const ineligibleMetadata = { ...metadata, band: 'tutorial' };
    const cases: Array<[string, unknown, unknown]> = [
      ['absent maze', null, metadata],
      ['absent metadata', maze, null],
      ['malformed maze', { ...maze, grid: undefined }, metadata],
      ['malformed metadata', maze, { ...metadata, routeOpeningEdges: undefined }],
      ['ineligible band', maze, ineligibleMetadata]
    ];

    for (const [label, mazeValue, metadataValue] of cases) {
      expect(
        () => createLegacyRoomActivationPreviewCue(mazeValue, metadataValue),
        label
      ).not.toThrow();
      expect(createLegacyRoomActivationPreviewCue(mazeValue, metadataValue), label).toBeNull();
    }
  });

  test('deep-clones every emitted edge without mutating inputs or later results', () => {
    const { maze, metadata } = createFixture(1, 7);
    const mazeBefore = structuredClone(maze);
    const metadataBefore = structuredClone(metadata);
    const cue = createLegacyRoomActivationPreviewCue(maze, metadata)!;

    if (cue.blockedEdges[0]) {
      cue.blockedEdges[0].inside.x += 100;
      cue.blockedEdges[0].outside.y += 100;
    }
    cue.routeOpeningEdges[0]!.inside.x += 100;
    cue.routeOpeningEdges[0]!.outside.y += 100;

    expect(maze).toEqual(mazeBefore);
    expect(metadata).toEqual(metadataBefore);
    expect(createLegacyRoomActivationPreviewCue(maze, metadata)).toMatchObject({
      blockedEdges: metadata.sideClosureEdges,
      routeOpeningEdges: metadata.routeOpeningEdges
    });
  });

  test('remains source-only with no scene renderer or diagnostics consumer', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(
      resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'),
      'utf8'
    );

    expect(menuSceneSource).not.toContain('createLegacyRoomActivationPreviewCue');
    expect(diagnosticsSource).not.toContain('LegacyRoomActivationPreviewCue');
  });
});
