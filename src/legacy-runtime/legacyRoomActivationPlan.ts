import type { LegacyMazeSnapshot, LegacyPoint } from './legacyMaze';
import {
  LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES,
  LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE,
  LEGACY_ROOM_CANDIDATE_MAX_PERIMETER_OPENINGS,
  LEGACY_ROOM_CANDIDATE_MAX_ROUTE_INTERIOR_TILES,
  LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES,
  LEGACY_ROOM_CANDIDATE_METADATA_CONTRACT_VERSION,
  LEGACY_ROOM_CANDIDATE_MIN_PERIMETER_OPENINGS,
  LEGACY_ROOM_CANDIDATE_ROUTE_OPENING_COUNT,
  LEGACY_ROOM_CANDIDATE_ROUTE_THRESHOLD_COUNT,
  type LegacyRoomCandidateMetadata,
  type LegacyRoomCandidatePerimeterOpening,
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

const INVALID_DATA_PROPERTY = Symbol('invalid-data-property');

const isObjectRecord = (value: unknown): value is object => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
);

const hasCanonicalRuntimeRepresentation = (
  value: unknown,
  seen = new WeakSet<object>()
): boolean => {
  if (
    value === null
    || value === undefined
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) {
    return true;
  }
  if (typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return false;
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor
      || !('value' in lengthDescriptor)
      || !Number.isInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) {
      return false;
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== lengthDescriptor.value + 1
      || keys.some((key) => (
        key !== 'length'
        && (typeof key !== 'string' || !/^\d+$/.test(key) || Number(key) >= lengthDescriptor.value)
      ))
    ) {
      return false;
    }
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (!descriptor || !('value' in descriptor) || !hasCanonicalRuntimeRepresentation(descriptor.value, seen)) {
        return false;
      }
    }
    return true;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !hasCanonicalRuntimeRepresentation(descriptor.value, seen)) {
      return false;
    }
  }
  return true;
};

const hasCloneableCanonicalRuntimeRepresentation = (value: unknown): boolean => {
  if (!hasCanonicalRuntimeRepresentation(value)) {
    return false;
  }
  structuredClone(value);
  return true;
};

const readOwnDataProperty = (value: object, key: PropertyKey): unknown | typeof INVALID_DATA_PROPERTY => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : INVALID_DATA_PROPERTY;
};

const readOwnArray = (value: unknown): unknown[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isInteger(lengthDescriptor.value)) {
    return null;
  }
  const output: unknown[] = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const item = readOwnDataProperty(value, index);
    if (item === INVALID_DATA_PROPERTY) {
      return null;
    }
    output.push(item);
  }
  return output;
};

const readPoint = (value: unknown): LegacyPoint | null => {
  if (!isObjectRecord(value)) {
    return null;
  }
  const x = readOwnDataProperty(value, 'x');
  const y = readOwnDataProperty(value, 'y');
  return typeof x === 'number' && Number.isInteger(x) && typeof y === 'number' && Number.isInteger(y)
    ? { x, y }
    : null;
};

const clonePoint = (point: LegacyPoint): LegacyPoint => ({ ...point });

const pointKey = (point: LegacyPoint): string => `${point.x},${point.y}`;

const pointsMatch = (left: LegacyPoint, right: LegacyPoint): boolean => (
  left.x === right.x && left.y === right.y
);

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

const readMaze = (value: unknown): LegacyRoomActivationPlanMaze | null => {
  if (!isObjectRecord(value)) {
    return null;
  }
  const size = readOwnDataProperty(value, 'size');
  const gridValue = readOwnDataProperty(value, 'grid');
  const solutionPathValue = readOwnDataProperty(value, 'solutionPath');
  const start = readPoint(readOwnDataProperty(value, 'start'));
  const goal = readPoint(readOwnDataProperty(value, 'goal'));
  const gridRows = readOwnArray(gridValue);
  const solutionPathValues = readOwnArray(solutionPathValue);
  if (
    typeof size !== 'number'
    || !Number.isInteger(size)
    || size <= 0
    || gridRows === null
    || gridRows.length !== size
    || solutionPathValues === null
    || solutionPathValues.length === 0
    || start === null
    || goal === null
  ) {
    return null;
  }
  const grid: boolean[][] = [];
  for (const rowValue of gridRows) {
    const row = readOwnArray(rowValue);
    if (row === null || row.length !== size || !row.every((cell) => typeof cell === 'boolean')) {
      return null;
    }
    grid.push(row as boolean[]);
  }
  const solutionPath: LegacyPoint[] = [];
  for (const pointValue of solutionPathValues) {
    const point = readPoint(pointValue);
    if (point === null || !isFloorPoint(grid, point)) {
      return null;
    }
    solutionPath.push(point);
  }
  if (
    !isFloorPoint(grid, start)
    || !isFloorPoint(grid, goal)
    || !pointsMatch(solutionPath[0]!, start)
    || !pointsMatch(solutionPath[solutionPath.length - 1]!, goal)
  ) {
    return null;
  }
  return { goal, grid, size, solutionPath, start };
};

const readCandidate = (value: unknown): LegacyRoomCandidateMetadata['candidate'] | null => {
  if (!isObjectRecord(value)) {
    return null;
  }
  const footprintHeight = readOwnDataProperty(value, 'footprintHeight');
  const footprintWidth = readOwnDataProperty(value, 'footprintWidth');
  const solutionPathIndex = readOwnDataProperty(value, 'solutionPathIndex');
  const topLeft = readPoint(readOwnDataProperty(value, 'topLeft'));
  if (
    footprintHeight !== LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES
    || footprintWidth !== LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES
    || typeof solutionPathIndex !== 'number'
    || !Number.isInteger(solutionPathIndex)
    || topLeft === null
  ) {
    return null;
  }
  return { footprintHeight, footprintWidth, solutionPathIndex, topLeft };
};

const SIDES = new Set(['top', 'right', 'bottom', 'left']);

const readPerimeterOpening = (value: unknown): LegacyRoomCandidatePerimeterOpening | null => {
  if (!isObjectRecord(value)) {
    return null;
  }
  const inside = readPoint(readOwnDataProperty(value, 'inside'));
  const outside = readPoint(readOwnDataProperty(value, 'outside'));
  const kind = readOwnDataProperty(value, 'kind');
  const side = readOwnDataProperty(value, 'side');
  if (
    inside === null
    || outside === null
    || (kind !== 'route-enter' && kind !== 'route-exit' && kind !== 'side')
    || typeof side !== 'string'
    || !SIDES.has(side)
  ) {
    return null;
  }
  return {
    inside,
    kind,
    outside,
    side: side as LegacyRoomCandidatePerimeterOpening['side']
  };
};

const readRouteThreshold = (
  value: unknown
): LegacyRoomCandidateMetadata['routeThresholds'][number] | null => {
  if (!isObjectRecord(value)) {
    return null;
  }
  const from = readPoint(readOwnDataProperty(value, 'from'));
  const to = readPoint(readOwnDataProperty(value, 'to'));
  const fromSolutionPathIndex = readOwnDataProperty(value, 'fromSolutionPathIndex');
  const toSolutionPathIndex = readOwnDataProperty(value, 'toSolutionPathIndex');
  const kind = readOwnDataProperty(value, 'kind');
  if (
    from === null
    || to === null
    || typeof fromSolutionPathIndex !== 'number'
    || !Number.isInteger(fromSolutionPathIndex)
    || typeof toSolutionPathIndex !== 'number'
    || !Number.isInteger(toSolutionPathIndex)
    || (kind !== 'enter' && kind !== 'exit')
  ) {
    return null;
  }
  return { from, fromSolutionPathIndex, kind, to, toSolutionPathIndex };
};

const readMetadata = (value: unknown): LegacyRoomCandidateMetadata | null => {
  if (!isObjectRecord(value)) {
    return null;
  }
  const band = readOwnDataProperty(value, 'band');
  const candidate = readCandidate(readOwnDataProperty(value, 'candidate'));
  const candidateCount = readOwnDataProperty(value, 'candidateCount');
  const contractVersion = readOwnDataProperty(value, 'contractVersion');
  const evaluatedCandidateCount = readOwnDataProperty(value, 'evaluatedCandidateCount');
  const perimeterOpeningCount = readOwnDataProperty(value, 'perimeterOpeningCount');
  const perimeterOpeningValues = readOwnArray(readOwnDataProperty(value, 'perimeterOpenings'));
  const routeInteriorTileCount = readOwnDataProperty(value, 'routeInteriorTileCount');
  const routeOpeningCount = readOwnDataProperty(value, 'routeOpeningCount');
  const routeOpeningValues = readOwnArray(readOwnDataProperty(value, 'routeOpeningEdges'));
  const routeThresholdValues = readOwnArray(readOwnDataProperty(value, 'routeThresholds'));
  const roomsEnabled = readOwnDataProperty(value, 'roomsEnabled');
  const sideClosureCount = readOwnDataProperty(value, 'sideClosureCount');
  const sideClosureValues = readOwnArray(readOwnDataProperty(value, 'sideClosureEdges'));
  const source = readOwnDataProperty(value, 'source');
  if (
    (band !== 'architect' && band !== 'mythic')
    || candidate === null
    || candidateCount !== LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE
    || contractVersion !== LEGACY_ROOM_CANDIDATE_METADATA_CONTRACT_VERSION
    || typeof evaluatedCandidateCount !== 'number'
    || !Number.isInteger(evaluatedCandidateCount)
    || evaluatedCandidateCount < 1
    || typeof perimeterOpeningCount !== 'number'
    || !Number.isInteger(perimeterOpeningCount)
    || perimeterOpeningCount < LEGACY_ROOM_CANDIDATE_MIN_PERIMETER_OPENINGS
    || perimeterOpeningCount > LEGACY_ROOM_CANDIDATE_MAX_PERIMETER_OPENINGS
    || perimeterOpeningValues === null
    || perimeterOpeningValues.length !== perimeterOpeningCount
    || typeof routeInteriorTileCount !== 'number'
    || !Number.isInteger(routeInteriorTileCount)
    || routeInteriorTileCount < 1
    || routeInteriorTileCount > LEGACY_ROOM_CANDIDATE_MAX_ROUTE_INTERIOR_TILES
    || routeOpeningCount !== LEGACY_ROOM_CANDIDATE_ROUTE_OPENING_COUNT
    || routeOpeningValues === null
    || routeOpeningValues.length !== routeOpeningCount
    || routeThresholdValues === null
    || routeThresholdValues.length !== LEGACY_ROOM_CANDIDATE_ROUTE_THRESHOLD_COUNT
    || roomsEnabled !== false
    || typeof sideClosureCount !== 'number'
    || !Number.isInteger(sideClosureCount)
    || sideClosureCount < 0
    || sideClosureCount > LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES
    || sideClosureValues === null
    || sideClosureValues.length !== sideClosureCount
    || sideClosureCount !== perimeterOpeningCount - LEGACY_ROOM_CANDIDATE_ROUTE_OPENING_COUNT
    || source !== 'existing-floor-metadata-only'
  ) {
    return null;
  }
  const perimeterOpenings = perimeterOpeningValues.map(readPerimeterOpening);
  const routeOpeningEdges = routeOpeningValues.map(readPerimeterOpening);
  const sideClosureEdges = sideClosureValues.map(readPerimeterOpening);
  const routeThresholds = routeThresholdValues.map(readRouteThreshold);
  if (
    perimeterOpenings.some((opening) => opening === null)
    || routeOpeningEdges.some((opening) => (
      opening === null || (opening.kind !== 'route-enter' && opening.kind !== 'route-exit')
    ))
    || sideClosureEdges.some((opening) => opening === null || opening.kind !== 'side')
    || routeThresholds.some((threshold) => threshold === null)
  ) {
    return null;
  }
  return {
    band,
    candidate,
    candidateCount,
    contractVersion,
    evaluatedCandidateCount,
    perimeterOpeningCount,
    perimeterOpenings: perimeterOpenings as LegacyRoomCandidateMetadata['perimeterOpenings'],
    routeInteriorTileCount,
    routeOpeningCount,
    routeOpeningEdges: routeOpeningEdges as LegacyRoomCandidateMetadata['routeOpeningEdges'],
    routeThresholds: routeThresholds as LegacyRoomCandidateMetadata['routeThresholds'],
    roomsEnabled,
    sideClosureCount,
    sideClosureEdges: sideClosureEdges as LegacyRoomCandidateMetadata['sideClosureEdges'],
    source
  };
};

const hasValidMazeShape = (maze: LegacyRoomActivationPlanMaze): boolean => (
  Number.isInteger(maze.size)
  && maze.size > 0
  && maze.grid.length === maze.size
  && maze.grid.every((row) => row.length === maze.size)
  && isFloorPoint(maze.grid, maze.start)
  && isFloorPoint(maze.grid, maze.goal)
);

const buildFootprint = (topLeft: LegacyPoint): LegacyPoint[] => [
  clonePoint(topLeft),
  { x: topLeft.x + 1, y: topLeft.y },
  { x: topLeft.x, y: topLeft.y + 1 },
  { x: topLeft.x + 1, y: topLeft.y + 1 }
];

const openingsMatch = (
  left: LegacyRoomCandidatePerimeterOpening,
  right: LegacyRoomCandidatePerimeterOpening
): boolean => (
  left.kind === right.kind
  && left.side === right.side
  && pointsMatch(left.inside, right.inside)
  && pointsMatch(left.outside, right.outside)
);

const openingListsMatch = (
  left: LegacyRoomCandidatePerimeterOpening[],
  right: LegacyRoomCandidatePerimeterOpening[]
): boolean => (
  left.length === right.length
  && left.every((opening, index) => openingsMatch(opening, right[index]!))
);

const createExpectedPerimeterOpenings = (
  maze: LegacyRoomActivationPlanMaze,
  metadata: LegacyRoomCandidateMetadata
): LegacyRoomCandidatePerimeterOpening[] => {
  const { x, y } = metadata.candidate.topLeft;
  const perimeterEdges: Array<Omit<LegacyRoomCandidatePerimeterOpening, 'kind'>> = [
    { inside: { x, y }, outside: { x, y: y - 1 }, side: 'top' },
    { inside: { x: x + 1, y }, outside: { x: x + 1, y: y - 1 }, side: 'top' },
    { inside: { x: x + 1, y }, outside: { x: x + 2, y }, side: 'right' },
    {
      inside: { x: x + 1, y: y + 1 },
      outside: { x: x + 2, y: y + 1 },
      side: 'right'
    },
    {
      inside: { x: x + 1, y: y + 1 },
      outside: { x: x + 1, y: y + 2 },
      side: 'bottom'
    },
    { inside: { x, y: y + 1 }, outside: { x, y: y + 2 }, side: 'bottom' },
    { inside: { x, y: y + 1 }, outside: { x: x - 1, y: y + 1 }, side: 'left' },
    { inside: { x, y }, outside: { x: x - 1, y }, side: 'left' }
  ];

  return perimeterEdges.flatMap(({ inside, outside, side }) => {
    if (!isFloorPoint(maze.grid, outside)) {
      return [];
    }
    const matchingThreshold = metadata.routeThresholds.find((threshold) => (
      (
        threshold.kind === 'enter'
        && pointsMatch(threshold.from, outside)
        && pointsMatch(threshold.to, inside)
      )
      || (
        threshold.kind === 'exit'
        && pointsMatch(threshold.from, inside)
        && pointsMatch(threshold.to, outside)
      )
    ));
    return [{
      inside: clonePoint(inside),
      kind: matchingThreshold
        ? `route-${matchingThreshold.kind}` as LegacyRoomCandidatePerimeterOpening['kind']
        : 'side',
      outside: clonePoint(outside),
      side
    }];
  });
};

const metadataMatchesMaze = (
  maze: LegacyRoomActivationPlanMaze,
  metadata: LegacyRoomCandidateMetadata
): boolean => {
  const footprint = buildFootprint(metadata.candidate.topLeft);
  const footprintKeys = new Set(footprint.map(pointKey));
  const eligibleSolutionPathIndices = maze.solutionPath
    .map((point, index) => footprintKeys.has(pointKey(point)) ? index : null)
    .filter((index): index is number => (
      index !== null && index >= 2 && index <= maze.solutionPath.length - 3
    ));
  if (
    !footprint.every((point) => isFloorPoint(maze.grid, point))
    || footprint.some((point) => pointsMatch(point, maze.start) || pointsMatch(point, maze.goal))
    || eligibleSolutionPathIndices.length === 0
    || metadata.candidate.solutionPathIndex !== Math.min(...eligibleSolutionPathIndices)
  ) {
    return false;
  }

  const [enter, exit] = metadata.routeThresholds;
  const thresholdsMatchMaze = (
    enter.kind === 'enter'
    && exit.kind === 'exit'
    && enter.toSolutionPathIndex === enter.fromSolutionPathIndex + 1
    && exit.toSolutionPathIndex === exit.fromSolutionPathIndex + 1
    && pointsMatch(maze.solutionPath[enter.fromSolutionPathIndex] ?? { x: -1, y: -1 }, enter.from)
    && pointsMatch(maze.solutionPath[enter.toSolutionPathIndex] ?? { x: -1, y: -1 }, enter.to)
    && pointsMatch(maze.solutionPath[exit.fromSolutionPathIndex] ?? { x: -1, y: -1 }, exit.from)
    && pointsMatch(maze.solutionPath[exit.toSolutionPathIndex] ?? { x: -1, y: -1 }, exit.to)
    && !footprintKeys.has(pointKey(enter.from))
    && footprintKeys.has(pointKey(enter.to))
    && footprintKeys.has(pointKey(exit.from))
    && !footprintKeys.has(pointKey(exit.to))
    && metadata.routeInteriorTileCount === (
      exit.fromSolutionPathIndex - enter.toSolutionPathIndex + 1
    )
  );
  if (!thresholdsMatchMaze) {
    return false;
  }

  const expectedPerimeterOpenings = createExpectedPerimeterOpenings(maze, metadata);
  const expectedRouteOpeningEdges = expectedPerimeterOpenings.filter(
    (opening) => opening.kind !== 'side'
  );
  const expectedSideClosureEdges = expectedPerimeterOpenings.filter(
    (opening) => opening.kind === 'side'
  );
  return (
    openingListsMatch(metadata.perimeterOpenings, expectedPerimeterOpenings)
    && openingListsMatch(metadata.routeOpeningEdges, expectedRouteOpeningEdges)
    && openingListsMatch(metadata.sideClosureEdges, expectedSideClosureEdges)
    && expectedRouteOpeningEdges.filter((edge) => edge.kind === 'route-enter').length === 1
    && expectedRouteOpeningEdges.filter((edge) => edge.kind === 'route-exit').length === 1
  );
};

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
  mazeValue: unknown,
  metadataValue: unknown
): LegacyRoomActivationPlan | null => {
  try {
    if (
      !hasCloneableCanonicalRuntimeRepresentation(mazeValue)
      || !hasCloneableCanonicalRuntimeRepresentation(metadataValue)
    ) {
      return null;
    }
    const maze = readMaze(mazeValue);
    const metadata = readMetadata(metadataValue);
    if (
      maze === null
      || metadata === null
      || !hasValidMazeShape(maze)
      || !metadataMatchesMaze(maze, metadata)
    ) {
      return null;
    }

    const blockedEdges = metadata.sideClosureEdges.map(cloneSideClosureEdge);
    const routeOpeningEdges = metadata.routeOpeningEdges.map(cloneRouteOpeningEdge);
    const blockedEdgeKeys = new Set(blockedEdges.map((edge) => edgeKey(edge.inside, edge.outside)));
    const validBlockedEdges = (
      blockedEdgeKeys.size === blockedEdges.length
      && blockedEdges.every((edge) => (
        isCardinalEdge(edge.inside, edge.outside)
        && isFloorPoint(maze.grid, edge.inside)
        && isFloorPoint(maze.grid, edge.outside)
      ))
    );
    const routeOpeningsPreserved = routeOpeningEdges.every((edge) => (
      isCardinalEdge(edge.inside, edge.outside)
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
  } catch {
    return null;
  }
};
