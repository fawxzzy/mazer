import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import {
  LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES,
  LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE,
  LEGACY_ROOM_CANDIDATE_MAX_ROUTE_INTERIOR_TILES,
  LEGACY_ROOM_CANDIDATE_ROUTE_THRESHOLD_COUNT,
  createLegacyRoomCandidateMetadata
} from '../../src/legacy-runtime/legacyRoomCandidateMetadata';
import { createLegacyStaticSlowTileState } from '../../src/legacy-runtime/legacyStaticSlowTile';

const footprintPoints = (topLeft: { x: number; y: number }): Array<{ x: number; y: number }> => [
  { ...topLeft },
  { x: topLeft.x + 1, y: topLeft.y },
  { x: topLeft.x, y: topLeft.y + 1 },
  { x: topLeft.x + 1, y: topLeft.y + 1 }
];

const pointKey = (point: { x: number; y: number }): string => `${point.x},${point.y}`;

const sha256 = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

describe('legacy room-candidate metadata', () => {
  test('preserves candidate identity and emits exactly two deterministic route thresholds', () => {
    const bands = [
      { band: 'architect' as const, targetComplexity: 132, scale: 71, minimumEvaluated: 2 },
      { band: 'mythic' as const, targetComplexity: 180, scale: 96, minimumEvaluated: 3 }
    ];
    const seeds = Array.from({ length: 20 }, (_, index) => index + 1);
    const passes = Array.from({ length: 2 }, () => {
      const rows = [];

      for (const { band, minimumEvaluated, scale, targetComplexity } of bands) {
        const generationProfile = resolveLegacyMazeGenerationProfileForProgression(targetComplexity);
        let observedMinimum = Number.POSITIVE_INFINITY;

        for (const seed of seeds) {
          const maze = createLegacyRuntimeMazeForMode('play', scale, seed, generationProfile);
          const slowTile = createLegacyStaticSlowTileState(maze, band);
          const before = JSON.stringify(maze);
          const metadata = createLegacyRoomCandidateMetadata(
            maze,
            band,
            slowTile.placement?.point ?? null
          );

          expect(metadata, `${band} seed ${seed}`).not.toBeNull();
          expect(metadata).toMatchObject({
            band,
            candidateCount: LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE,
            contractVersion: 'legacy-room-candidate-metadata-v3',
            roomsEnabled: false,
            source: 'existing-floor-metadata-only'
          });
          expect(metadata!.candidate).toMatchObject({
            footprintHeight: LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES,
            footprintWidth: LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES
          });

          const footprint = footprintPoints(metadata!.candidate.topLeft);
          const footprintKeys = new Set(footprint.map(pointKey));
          const expectedThresholds = maze.solutionPath.flatMap((to, toSolutionPathIndex) => {
            if (toSolutionPathIndex === 0) {
              return [];
            }
            const fromSolutionPathIndex = toSolutionPathIndex - 1;
            const from = maze.solutionPath[fromSolutionPathIndex]!;
            const fromInside = footprintKeys.has(pointKey(from));
            const toInside = footprintKeys.has(pointKey(to));
            return fromInside === toInside
              ? []
              : [{
                  from,
                  fromSolutionPathIndex,
                  kind: toInside ? 'enter' as const : 'exit' as const,
                  to,
                  toSolutionPathIndex
                }];
          });

          expect(footprint.every((point) => maze.grid[point.y]?.[point.x] === true)).toBe(true);
          expect(footprint).not.toContainEqual(maze.start);
          expect(footprint).not.toContainEqual(maze.goal);
          expect(footprint).not.toContainEqual(slowTile.placement?.point);
          expect(metadata!.candidate.solutionPathIndex).toBeGreaterThanOrEqual(2);
          expect(metadata!.candidate.solutionPathIndex).toBeLessThanOrEqual(maze.solutionPath.length - 3);
          expect(footprint).toContainEqual(maze.solutionPath[metadata!.candidate.solutionPathIndex]);
          expect(expectedThresholds).toHaveLength(LEGACY_ROOM_CANDIDATE_ROUTE_THRESHOLD_COUNT);
          expect(metadata!.routeThresholds).toEqual(expectedThresholds);
          expect(metadata!.routeThresholds.map((threshold) => threshold.kind)).toEqual(['enter', 'exit']);
          expect(metadata!.routeThresholds.every((threshold) => (
            Math.abs(threshold.from.x - threshold.to.x)
            + Math.abs(threshold.from.y - threshold.to.y)
          ) === 1)).toBe(true);
          const expectedRouteInterior = maze.solutionPath.slice(
            metadata!.routeThresholds[0].toSolutionPathIndex,
            metadata!.routeThresholds[1].fromSolutionPathIndex + 1
          );
          expect(expectedRouteInterior).toHaveLength(metadata!.routeInteriorTileCount);
          expect(expectedRouteInterior.every((point) => footprintKeys.has(pointKey(point)))).toBe(true);
          expect(metadata!.routeInteriorTileCount).toBeGreaterThanOrEqual(1);
          expect(metadata!.routeInteriorTileCount)
            .toBeLessThanOrEqual(LEGACY_ROOM_CANDIDATE_MAX_ROUTE_INTERIOR_TILES);
          expect(JSON.stringify(maze)).toBe(before);

          observedMinimum = Math.min(observedMinimum, metadata!.evaluatedCandidateCount);
          rows.push({
            band,
            candidate: metadata!.candidate,
            candidateCount: metadata!.candidateCount,
            evaluatedCandidateCount: metadata!.evaluatedCandidateCount,
            pressurePoint: slowTile.placement?.point ?? null,
            routeInteriorTileCount: metadata!.routeInteriorTileCount,
            roomsEnabled: metadata!.roomsEnabled,
            routeThresholds: metadata!.routeThresholds,
            seed,
            size: maze.size,
            source: metadata!.source
          });
        }

        expect(observedMinimum).toBe(minimumEvaluated);
      }

      return rows;
    });

    expect(passes[0]).toEqual(passes[1]);
    expect(sha256(passes[0].map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      candidate: row.candidate,
      candidateCount: row.candidateCount,
      evaluatedCandidateCount: row.evaluatedCandidateCount,
      roomsEnabled: row.roomsEnabled,
      source: row.source,
      pressurePoint: row.pressurePoint
    }))))
      .toBe('0f5d7d2d9a4131049e1d571664c3430cd99b0b3ebfd32a5983bc4201c02db8b4');
    expect(sha256(passes[0].map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      routeThresholds: row.routeThresholds
    }))))
      .toBe('d5cd000adc68fe242ff5b4f9060ecf10061045bd699716ab489e871a8d92d8bd');
    expect(sha256(passes[0].map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      routeInteriorTileCount: row.routeInteriorTileCount
    }))))
      .toBe('9981185146657b2752d84bc37541858326c85396612ae6ebfd61e93d620c7e46');
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
    expect(diagnosticsSource).toContain("contractVersion: 'legacy-room-candidate-metadata-v3';");
    expect(menuSceneSource)
      .toContain('routeInteriorTileCount: this.playRoomCandidateMetadata.routeInteriorTileCount');
    expect(menuSceneSource).toContain('routeThresholds: this.playRoomCandidateMetadata.routeThresholds.map(');
    expect(menuSceneSource).not.toContain('drawLegacyRoomCandidate');
    expect(menuSceneSource).not.toContain('applyLegacyRoomCandidate');
    expect(menuSceneSource).not.toContain('drawLegacyRoomRouteThreshold');
    expect(menuSceneSource).not.toContain('applyLegacyRoomRouteThreshold');
  });
});
