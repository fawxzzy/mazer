import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';
import {
  LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES,
  LEGACY_ROOM_CANDIDATE_METADATA_CONTRACT_VERSION,
  LEGACY_ROOM_CANDIDATE_ROUTE_OPENING_COUNT,
  type LegacyRoomCandidateMetadata,
  type LegacyRoomCandidateRouteOpeningEdge,
  type LegacyRoomCandidateSideClosureEdge
} from './legacyRoomCandidateMetadata';

export const LEGACY_ROOM_ACTIVATION_PLAN_CONTRACT_VERSION = 'legacy-room-activation-plan-v1' as const;

type LegacyRoomActivationPlanMaze = Pick<
  LegacyMazeSnapshot,
  'goal' | 'grid' | 'size' | 'solutionPath' | 'start'
>;

export interface LegacyRoomActivationTopologyView {
  goal: LegacyPoint;
  grid: boolean[][];
  solutionPath: LegacyPoint[];
  start: LegacyPoint;
}

export interface LegacyRoomActivationPlan {
  band: LegacyRoomCandidateMetadata['band'];
  blockedEdges: LegacyRoomCandidateSideClosureEdge[];
  contractVersion: typeof LEGACY_ROOM_ACTIVATION_PLAN_CONTRACT_VERSION;
  feasible: boolean;
  maximumSimulatedSideClosureEdges: typeof LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES;
  roomsEnabled: false;
  routeOpeningEdges: LegacyRoomCandidateRouteOpeningEdge[];
  routeOpeningsPreserved: boolean;
  source: 'room-candidate-v7-feasibility-only';
  sourceMetadataContractVersion: typeof LEGACY_ROOM_CANDIDATE_METADATA_CONTRACT_VERSION;
  startGoalReachable: boolean;
  topologyView: LegacyRoomActivationTopologyView;
}

const CARDINAL_OFFSETS: ReadonlyArray<LegacyPoint> = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
];

const clonePoint = (point: LegacyPoint): LegacyPoint => ({ ...point });

const pointKey = (point: LegacyPoint): string => `${point.x},${point.y}`;

const edgeKey = (left: LegacyPoint, right: LegacyPoint): string => {
  const leftKey = pointKey(left);
  const rightKey = pointKey(right);
  return leftKey < rightKey ? `${leftKey}|${rightKey}` : `${rightKey}|${leftKey}`;
};

const isCardinalEdge = (inside: LegacyPoint, outside: LegacyPoint): boolean => (
  Math.abs(inside.x - outside.x) + Math.abs(inside.y - outside.y) === 1
);

const isFloorPoint = (grid: boolean[][], point: LegacyPoint): boolean => (
  Number.isInteger(point.x)
  && Number.isInteger(point.y)
  && grid[point.y]?.[point.x] === true
);

const cloneSideClosureEdge = (
  edge: LegacyRoomCandidateSideClosureEdge
): LegacyRoomCandidateSideClosureEdge => ({
  inside: clonePoint(edge.inside),
  kind: 'side',
  outside: clonePoint(edge.outside),
  side: edge.side
});

const cloneRouteOpeningEdge = (
  edge: LegacyRoomCandidateRouteOpeningEdge
): LegacyRoomCandidateRouteOpeningEdge => ({
  inside: clonePoint(edge.inside),
  kind: edge.kind,
  outside: clonePoint(edge.outside),
  side: edge.side
});

const cloneTopologyView = (maze: LegacyRoomActivationPlanMaze): LegacyRoomActivationTopologyView => ({
  goal: clonePoint(maze.goal),
  grid: maze.grid.map((row) => [...row]),
  solutionPath: maze.solutionPath.map(clonePoint),
  start: clonePoint(maze.start)
});

const hasValidMazeShape = (maze: LegacyRoomActivationPlanMaze): boolean => (
  Number.isInteger(maze.size)
  && maze.size > 0
  && maze.grid.length === maze.size
  && maze.grid.every((row) => row.length === maze.size)
  && isFloorPoint(maze.grid, maze.start)
  && isFloorPoint(maze.grid, maze.goal)
);

const reachesGoal = (
  topology: LegacyRoomActivationTopologyView,
  blockedEdgeKeys: ReadonlySet<string>
): boolean => {
  const queue: LegacyPoint[] = [clonePoint(topology.start)];
  const visited = new Set([pointKey(topology.start)]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (pointKey(current) === pointKey(topology.goal)) {
      return true;
    }

    for (const offset of CARDINAL_OFFSETS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const nextKey = pointKey(next);
      if (
        visited.has(nextKey)
        || !isFloorPoint(topology.grid, next)
        || blockedEdgeKeys.has(edgeKey(current, next))
      ) {
        continue;
      }
      visited.add(nextKey);
      queue.push(next);
    }
  }

  return false;
};

export const createLegacyRoomActivationPlan = (
  maze: LegacyRoomActivationPlanMaze,
  metadata: LegacyRoomCandidateMetadata | null
): LegacyRoomActivationPlan | null => {
  if (
    metadata === null
    || metadata.contractVersion !== LEGACY_ROOM_CANDIDATE_METADATA_CONTRACT_VERSION
    || metadata.roomsEnabled !== false
    || metadata.source !== 'existing-floor-metadata-only'
    || !hasValidMazeShape(maze)
    || metadata.sideClosureCount !== metadata.sideClosureEdges.length
    || metadata.sideClosureEdges.length > LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES
    || metadata.routeOpeningCount !== LEGACY_ROOM_CANDIDATE_ROUTE_OPENING_COUNT
    || metadata.routeOpeningCount !== metadata.routeOpeningEdges.length
  ) {
    return null;
  }

  const blockedEdges = metadata.sideClosureEdges.map(cloneSideClosureEdge);
  const routeOpeningEdges = metadata.routeOpeningEdges.map(cloneRouteOpeningEdge);
  const blockedEdgeKeys = new Set(blockedEdges.map((edge) => edgeKey(edge.inside, edge.outside)));
  const validBlockedEdges = (
    blockedEdgeKeys.size === blockedEdges.length
    && blockedEdges.every((edge) => (
      edge.kind === 'side'
      && isCardinalEdge(edge.inside, edge.outside)
      && isFloorPoint(maze.grid, edge.inside)
      && isFloorPoint(maze.grid, edge.outside)
    ))
  );
  const routeOpeningsPreserved = routeOpeningEdges.every((edge) => (
    (edge.kind === 'route-enter' || edge.kind === 'route-exit')
    && isCardinalEdge(edge.inside, edge.outside)
    && isFloorPoint(maze.grid, edge.inside)
    && isFloorPoint(maze.grid, edge.outside)
    && !blockedEdgeKeys.has(edgeKey(edge.inside, edge.outside))
  ));
  if (!validBlockedEdges) {
    return null;
  }

  const topologyView = cloneTopologyView(maze);
  const startGoalReachable = reachesGoal(topologyView, blockedEdgeKeys);
  return {
    band: metadata.band,
    blockedEdges,
    contractVersion: LEGACY_ROOM_ACTIVATION_PLAN_CONTRACT_VERSION,
    feasible: routeOpeningsPreserved && startGoalReachable,
    maximumSimulatedSideClosureEdges: LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES,
    roomsEnabled: false,
    routeOpeningEdges,
    routeOpeningsPreserved,
    source: 'room-candidate-v7-feasibility-only',
    sourceMetadataContractVersion: LEGACY_ROOM_CANDIDATE_METADATA_CONTRACT_VERSION,
    startGoalReachable,
    topologyView
  };
};
