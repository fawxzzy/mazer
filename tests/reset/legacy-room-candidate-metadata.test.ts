import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import {
  LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES,
  LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE,
  createLegacyRoomCandidateMetadata
} from '../../src/legacy-runtime/legacyRoomCandidateMetadata';
import { createLegacyStaticSlowTileState } from '../../src/legacy-runtime/legacyStaticSlowTile';

const footprintPoints = (topLeft: { x: number; y: number }): Array<{ x: number; y: number }> => [
  { ...topLeft },
  { x: topLeft.x + 1, y: topLeft.y },
  { x: topLeft.x, y: topLeft.y + 1 },
  { x: topLeft.x + 1, y: topLeft.y + 1 }
];

describe('legacy room-candidate metadata', () => {
  test('emits one deterministic state-neutral candidate across the fixed Architect/Mythic corpus', () => {
    const bands = [
      { band: 'architect' as const, targetComplexity: 132, scale: 71, minimumEvaluated: 2 },
      { band: 'mythic' as const, targetComplexity: 180, scale: 96, minimumEvaluated: 3 }
    ];
    const seeds = Array.from({ length: 20 }, (_, index) => index + 1);

    for (const { band, minimumEvaluated, scale, targetComplexity } of bands) {
      const generationProfile = resolveLegacyMazeGenerationProfileForProgression(targetComplexity);
      let observedMinimum = Number.POSITIVE_INFINITY;

      for (const seed of seeds) {
        const maze = createLegacyRuntimeMazeForMode('play', scale, seed, generationProfile);
        const slowTile = createLegacyStaticSlowTileState(maze, band);
        const before = JSON.stringify(maze);
        const first = createLegacyRoomCandidateMetadata(
          maze,
          band,
          slowTile.placement?.point ?? null
        );
        const second = createLegacyRoomCandidateMetadata(
          maze,
          band,
          slowTile.placement?.point ?? null
        );

        expect(first, `${band} seed ${seed}`).not.toBeNull();
        expect(first).toEqual(second);
        expect(first).toMatchObject({
          band,
          candidateCount: LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE,
          contractVersion: 'legacy-room-candidate-metadata-v1',
          roomsEnabled: false,
          source: 'existing-floor-metadata-only'
        });
        expect(first!.candidate).toMatchObject({
          footprintHeight: LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES,
          footprintWidth: LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES
        });

        const footprint = footprintPoints(first!.candidate.topLeft);
        expect(footprint.every((point) => maze.grid[point.y]?.[point.x] === true)).toBe(true);
        expect(footprint).not.toContainEqual(maze.start);
        expect(footprint).not.toContainEqual(maze.goal);
        expect(footprint).not.toContainEqual(slowTile.placement?.point);
        expect(first!.candidate.solutionPathIndex).toBeGreaterThanOrEqual(2);
        expect(first!.candidate.solutionPathIndex).toBeLessThanOrEqual(maze.solutionPath.length - 3);
        expect(footprint).toContainEqual(maze.solutionPath[first!.candidate.solutionPathIndex]);
        expect(JSON.stringify(maze)).toBe(before);

        observedMinimum = Math.min(observedMinimum, first!.evaluatedCandidateCount);
      }

      expect(observedMinimum).toBe(minimumEvaluated);
    }
  }, 30_000);

  test('keeps Tutorial through Navigator ineligible', () => {
    const maze = createLegacyRuntimeMazeForMode(
      'play',
      71,
      1,
      resolveLegacyMazeGenerationProfileForProgression(132)
    );

    for (const band of ['tutorial', 'starter', 'explorer', 'navigator'] as const) {
      expect(createLegacyRoomCandidateMetadata(maze, band)).toBeNull();
    }
  });

  test('wires metadata to play diagnostics without a render or gameplay consumer', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(
      resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'),
      'utf8'
    );

    expect(menuSceneSource).toContain('private playRoomCandidateMetadata: LegacyRoomCandidateMetadata | null = null;');
    expect(menuSceneSource).toContain('this.playRoomCandidateMetadata = createLegacyRoomCandidateMetadata(');
    expect(menuSceneSource).toContain('roomCandidate: this.playRoomCandidateMetadata');
    expect(diagnosticsSource).toContain("contractVersion: 'legacy-room-candidate-metadata-v1';");
    expect(menuSceneSource).not.toContain('drawLegacyRoomCandidate');
    expect(menuSceneSource).not.toContain('applyLegacyRoomCandidate');
  });
});
