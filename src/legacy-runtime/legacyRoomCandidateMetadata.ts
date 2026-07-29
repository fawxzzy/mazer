import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';
import type { LegacyProgressionDifficultyBand } from './legacyProgression';

export const LEGACY_ROOM_CANDIDATE_METADATA_CONTRACT_VERSION = 'legacy-room-candidate-metadata-v1' as const;
export const LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES = 2 as const;
export const LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE = 1 as const;

export interface LegacyRoomCandidate {
  footprintHeight: typeof LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES;
  footprintWidth: typeof LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES;
  solutionPathIndex: number;
  topLeft: LegacyPoint;
}

export interface LegacyRoomCandidateMetadata {
  band: 'architect' | 'mythic';
  candidate: LegacyRoomCandidate;
  candidateCount: typeof LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE;
  contractVersion: typeof LEGACY_ROOM_CANDIDATE_METADATA_CONTRACT_VERSION;
  evaluatedCandidateCount: number;
  roomsEnabled: false;
  source: 'existing-floor-metadata-only';
}

interface RankedLegacyRoomCandidate extends LegacyRoomCandidate {
  orderX: number;
  orderY: number;
}

const pointKey = (point: LegacyPoint): string => `${point.x},${point.y}`;

const pointsMatch = (left: LegacyPoint, right: LegacyPoint): boolean => (
  left.x === right.x && left.y === right.y
);

const isEligibleBand = (
  band: LegacyProgressionDifficultyBand
): band is LegacyRoomCandidateMetadata['band'] => (
  band === 'architect' || band === 'mythic'
);

const buildFootprint = (x: number, y: number): LegacyPoint[] => [
  { x, y },
  { x: x + 1, y },
  { x, y: y + 1 },
  { x: x + 1, y: y + 1 }
];

export const createLegacyRoomCandidateMetadata = (
  maze: Pick<LegacyMazeSnapshot, 'goal' | 'grid' | 'size' | 'solutionPath' | 'start'>,
  band: LegacyProgressionDifficultyBand,
  excludedPoint: LegacyPoint | null = null
): LegacyRoomCandidateMetadata | null => {
  if (!isEligibleBand(band)) {
    return null;
  }

  const maximumEligibleSolutionPathIndex = maze.solutionPath.length - 3;
  if (maximumEligibleSolutionPathIndex < 2) {
    return null;
  }

  const solutionPathIndexByPoint = new Map(
    maze.solutionPath.map((point, index) => [pointKey(point), index])
  );
  const candidates: RankedLegacyRoomCandidate[] = [];

  for (let y = 1; y < maze.size - 2; y += 1) {
    for (let x = 1; x < maze.size - 2; x += 1) {
      const footprint = buildFootprint(x, y);
      if (!footprint.every((point) => maze.grid[point.y]?.[point.x] === true)) {
        continue;
      }
      if (footprint.some((point) => pointsMatch(point, maze.start) || pointsMatch(point, maze.goal))) {
        continue;
      }
      if (excludedPoint && footprint.some((point) => pointsMatch(point, excludedPoint))) {
        continue;
      }

      const eligibleSolutionPathIndices = footprint
        .map((point) => solutionPathIndexByPoint.get(pointKey(point)))
        .filter((index): index is number => (
          index !== undefined
          && index >= 2
          && index <= maximumEligibleSolutionPathIndex
        ));
      if (eligibleSolutionPathIndices.length === 0) {
        continue;
      }

      candidates.push({
        footprintHeight: LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES,
        footprintWidth: LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES,
        orderX: x,
        orderY: y,
        solutionPathIndex: Math.min(...eligibleSolutionPathIndices),
        topLeft: { x, y }
      });
    }
  }

  candidates.sort((left, right) => (
    left.solutionPathIndex - right.solutionPathIndex
    || left.orderY - right.orderY
    || left.orderX - right.orderX
  ));
  const selected = candidates[0];
  if (!selected) {
    return null;
  }

  return {
    band,
    candidate: {
      footprintHeight: selected.footprintHeight,
      footprintWidth: selected.footprintWidth,
      solutionPathIndex: selected.solutionPathIndex,
      topLeft: { ...selected.topLeft }
    },
    candidateCount: LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE,
    contractVersion: LEGACY_ROOM_CANDIDATE_METADATA_CONTRACT_VERSION,
    evaluatedCandidateCount: candidates.length,
    roomsEnabled: false,
    source: 'existing-floor-metadata-only'
  };
};
