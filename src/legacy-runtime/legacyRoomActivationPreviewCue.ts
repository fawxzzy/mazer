import type {
  LegacyRoomCandidateRouteOpeningEdge,
  LegacyRoomCandidateSideClosureEdge
} from './legacyRoomCandidateMetadata';
import {
  createLegacyRoomActivationPlan,
  type LegacyRoomActivationPlan
} from './legacyRoomActivationPlan';

export const LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_CONTRACT_VERSION =
  'legacy-room-activation-preview-cue-v1' as const;
export const LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_MAXIMUM_PER_MAZE = 1 as const;

export interface LegacyRoomActivationPreviewCue {
  band: LegacyRoomActivationPlan['band'];
  blockedEdges: LegacyRoomCandidateSideClosureEdge[];
  contractVersion: typeof LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_CONTRACT_VERSION;
  cueCount: 1;
  maximumRoomPreviewCuesPerMaze: typeof LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_MAXIMUM_PER_MAZE;
  roomsEnabled: false;
  routeOpeningEdges: LegacyRoomCandidateRouteOpeningEdge[];
  source: 'room-activation-plan-v1-feasibility-only';
}

const cloneSideClosureEdge = (
  edge: LegacyRoomCandidateSideClosureEdge
): LegacyRoomCandidateSideClosureEdge => ({
  inside: { ...edge.inside },
  kind: edge.kind,
  outside: { ...edge.outside },
  side: edge.side
});

const cloneRouteOpeningEdge = (
  edge: LegacyRoomCandidateRouteOpeningEdge
): LegacyRoomCandidateRouteOpeningEdge => ({
  inside: { ...edge.inside },
  kind: edge.kind,
  outside: { ...edge.outside },
  side: edge.side
});

export const createLegacyRoomActivationPreviewCue = (
  mazeValue: unknown,
  metadataValue: unknown
): LegacyRoomActivationPreviewCue | null => {
  const plan = createLegacyRoomActivationPlan(mazeValue, metadataValue);
  if (
    plan === null
    || !plan.feasible
    || !plan.routeOpeningsPreserved
    || !plan.startGoalReachable
    || plan.roomsEnabled !== false
  ) {
    return null;
  }

  return {
    band: plan.band,
    blockedEdges: plan.blockedEdges.map(cloneSideClosureEdge),
    contractVersion: LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_CONTRACT_VERSION,
    cueCount: 1,
    maximumRoomPreviewCuesPerMaze: LEGACY_ROOM_ACTIVATION_PREVIEW_CUE_MAXIMUM_PER_MAZE,
    roomsEnabled: false,
    routeOpeningEdges: plan.routeOpeningEdges.map(cloneRouteOpeningEdge),
    source: 'room-activation-plan-v1-feasibility-only'
  };
};
