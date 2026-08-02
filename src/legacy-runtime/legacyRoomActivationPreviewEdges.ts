import type { LegacyPoint } from './legacyMaze';
import {
  createLegacyRoomActivationPreviewCue,
  type LegacyRoomActivationPreviewCue
} from './legacyRoomActivationPreviewCue';

export const LEGACY_ROOM_ACTIVATION_PREVIEW_EDGES_CONTRACT_VERSION =
  'legacy-room-activation-preview-edges-v1' as const;
export const LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_MAXIMUM_SEGMENTS_PER_MAZE = 4 as const;
export const LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_REQUIRED_ROUTE_OPEN_SEGMENTS = 2 as const;
export const LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_MAXIMUM_BLOCKED_SEGMENTS = 2 as const;

type LegacyRoomActivationPreviewSourceEdge = (
  LegacyRoomActivationPreviewCue['routeOpeningEdges'][number]
  | LegacyRoomActivationPreviewCue['blockedEdges'][number]
);

export interface LegacyRoomActivationPreviewEdgeSegment {
  inside: LegacyPoint;
  outside: LegacyPoint;
  role: 'route-open' | 'blocked';
  segmentIndex: number;
  side: LegacyRoomActivationPreviewSourceEdge['side'];
  sourceKind: LegacyRoomActivationPreviewSourceEdge['kind'];
}

export interface LegacyRoomActivationPreviewEdges {
  band: LegacyRoomActivationPreviewCue['band'];
  contractVersion: typeof LEGACY_ROOM_ACTIVATION_PREVIEW_EDGES_CONTRACT_VERSION;
  maximumPreviewEdgeSegmentsPerMaze:
    typeof LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_MAXIMUM_SEGMENTS_PER_MAZE;
  previewEdgeSegmentCount: number;
  requiredRouteOpenSegments:
    typeof LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_REQUIRED_ROUTE_OPEN_SEGMENTS;
  roomsEnabled: false;
  segments: LegacyRoomActivationPreviewEdgeSegment[];
  source: 'room-activation-preview-cue-v1';
}

const cloneSegment = (
  edge: LegacyRoomActivationPreviewSourceEdge,
  role: LegacyRoomActivationPreviewEdgeSegment['role'],
  segmentIndex: number
): LegacyRoomActivationPreviewEdgeSegment => ({
  inside: { ...edge.inside },
  outside: { ...edge.outside },
  role,
  segmentIndex,
  side: edge.side,
  sourceKind: edge.kind
});

export const createLegacyRoomActivationPreviewEdges = (
  mazeValue: unknown,
  metadataValue: unknown
): LegacyRoomActivationPreviewEdges | null => {
  try {
    const cue = createLegacyRoomActivationPreviewCue(mazeValue, metadataValue);
    if (
      cue === null
      || cue.routeOpeningEdges.length
        !== LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_REQUIRED_ROUTE_OPEN_SEGMENTS
      || cue.blockedEdges.length
        > LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_MAXIMUM_BLOCKED_SEGMENTS
    ) {
      return null;
    }

    const routeOpenSegments = cue.routeOpeningEdges.map((edge, segmentIndex) => (
      cloneSegment(edge, 'route-open', segmentIndex)
    ));
    const blockedSegments = cue.blockedEdges.map((edge, blockedIndex) => (
      cloneSegment(edge, 'blocked', routeOpenSegments.length + blockedIndex)
    ));
    const segments = [...routeOpenSegments, ...blockedSegments];
    if (segments.length > LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_MAXIMUM_SEGMENTS_PER_MAZE) {
      return null;
    }

    return {
      band: cue.band,
      contractVersion: LEGACY_ROOM_ACTIVATION_PREVIEW_EDGES_CONTRACT_VERSION,
      maximumPreviewEdgeSegmentsPerMaze:
        LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_MAXIMUM_SEGMENTS_PER_MAZE,
      previewEdgeSegmentCount: segments.length,
      requiredRouteOpenSegments:
        LEGACY_ROOM_ACTIVATION_PREVIEW_EDGE_REQUIRED_ROUTE_OPEN_SEGMENTS,
      roomsEnabled: false,
      segments,
      source: 'room-activation-preview-cue-v1'
    };
  } catch {
    return null;
  }
};
