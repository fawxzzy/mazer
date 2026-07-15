import {
  resolveLegacyNavigationTarget,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';

export const LEGACY_DIRECTIONAL_INTENT_LANE_SHIFT_TILE_LIMIT = 1;

export const LEGACY_CARDINAL_DIRECTIONS = [
  'up',
  'right',
  'down',
  'left'
] as const;

export type LegacyCardinalDirection = (typeof LEGACY_CARDINAL_DIRECTIONS)[number];

export type LegacyDirectionalIntentDecision =
  | 'idle'
  | 'requested'
  | 'continued'
  | 'queued-turn'
  | 'assisted-lane-shift'
  | 'stopped-assistance-disabled'
  | 'stopped-at-assist-limit'
  | 'stopped-awaiting-queued-direction'
  | 'stopped-at-dead-end';

export interface LegacyDirectionalIntentDiagnostics {
  activeDirection: LegacyCardinalDirection | null;
  assistedLaneShiftCount: number;
  assistedLaneShiftTileLimit: number;
  lastDecision: LegacyDirectionalIntentDecision;
  queuedDirection: LegacyCardinalDirection | null;
  requestedDirections: LegacyCardinalDirection[];
}

export interface LegacyDirectionalIntentStep {
  decision: LegacyDirectionalIntentDecision;
  deltaX: number;
  deltaY: number;
  direction: LegacyCardinalDirection | null;
  moved: boolean;
  target: LegacyPoint | null;
}

export interface LegacyDirectionalIntentStepOptions {
  assistedLaneShiftEnabled?: boolean;
}

const DIRECTION_DELTAS: Record<LegacyCardinalDirection, LegacyPoint> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};

const ORTHOGONAL_DIRECTIONS: Record<LegacyCardinalDirection, readonly LegacyCardinalDirection[]> = {
  up: ['left', 'right'],
  right: ['up', 'down'],
  down: ['left', 'right'],
  left: ['up', 'down']
};

const uniqueDirections = (
  directions: readonly LegacyCardinalDirection[]
): LegacyCardinalDirection[] => {
  const unique: LegacyCardinalDirection[] = [];
  for (const direction of directions) {
    if (!unique.includes(direction)) {
      unique.push(direction);
    }
  }
  return unique.slice(0, 2);
};

const directionsEqual = (
  left: readonly LegacyCardinalDirection[],
  right: readonly LegacyCardinalDirection[]
): boolean => left.length === right.length && left.every((direction, index) => direction === right[index]);

export const resolveLegacyCardinalDirectionDelta = (
  direction: LegacyCardinalDirection
): LegacyPoint => ({ ...DIRECTION_DELTAS[direction] });

export const resolveLegacyCardinalDirectionsFromVector = (
  deltaX: number,
  deltaY: number
): LegacyCardinalDirection[] => {
  const directions: LegacyCardinalDirection[] = [];
  if (deltaX > 0) {
    directions.push('right');
  } else if (deltaX < 0) {
    directions.push('left');
  }
  if (deltaY > 0) {
    directions.push('down');
  } else if (deltaY < 0) {
    directions.push('up');
  }
  return directions;
};

export class LegacyDirectionalIntentResolver {
  private activeDirection: LegacyCardinalDirection | null = null;

  private assistedLaneShiftCount = 0;

  private assistedLaneShiftPendingResume = false;

  private lastDecision: LegacyDirectionalIntentDecision = 'idle';

  private queuedDirection: LegacyCardinalDirection | null = null;

  private requestedDirections: LegacyCardinalDirection[] = [];

  request(directions: readonly LegacyCardinalDirection[]): LegacyDirectionalIntentDiagnostics {
    const requestedDirections = uniqueDirections(directions);
    if (directionsEqual(requestedDirections, this.requestedDirections)) {
      return this.getDiagnostics();
    }

    this.requestedDirections = requestedDirections;
    this.assistedLaneShiftCount = 0;
    this.assistedLaneShiftPendingResume = false;
    this.lastDecision = requestedDirections.length > 0 ? 'requested' : 'idle';

    const preferredDirection = requestedDirections[0] ?? null;
    if (preferredDirection === null) {
      this.activeDirection = null;
      this.queuedDirection = null;
      return this.getDiagnostics();
    }

    if (this.activeDirection === null) {
      this.activeDirection = preferredDirection;
      this.queuedDirection = requestedDirections.find((direction) => direction !== preferredDirection) ?? null;
      return this.getDiagnostics();
    }

    if (preferredDirection !== this.activeDirection) {
      this.queuedDirection = preferredDirection;
      return this.getDiagnostics();
    }

    this.queuedDirection = requestedDirections.find((direction) => direction !== this.activeDirection) ?? null;
    return this.getDiagnostics();
  }

  synchronize(directions: readonly LegacyCardinalDirection[]): LegacyDirectionalIntentDiagnostics {
    const requestedDirections = uniqueDirections(directions);
    this.requestedDirections = requestedDirections;
    if (requestedDirections.length === 0) {
      this.reset();
      return this.getDiagnostics();
    }

    if (this.activeDirection === null || !requestedDirections.includes(this.activeDirection)) {
      this.activeDirection = requestedDirections[0] ?? null;
      this.assistedLaneShiftCount = 0;
      this.assistedLaneShiftPendingResume = false;
    }
    if (this.queuedDirection !== null && !requestedDirections.includes(this.queuedDirection)) {
      this.queuedDirection = null;
    }
    if (this.queuedDirection === this.activeDirection) {
      this.queuedDirection = null;
    }
    if (this.queuedDirection === null) {
      this.queuedDirection = requestedDirections.find((direction) => direction !== this.activeDirection) ?? null;
    }
    this.lastDecision = 'requested';
    return this.getDiagnostics();
  }

  step(
    maze: Pick<LegacyMazeSnapshot, 'grid'>,
    player: LegacyPoint,
    options: LegacyDirectionalIntentStepOptions = {}
  ): LegacyDirectionalIntentStep {
    const legalTargets = new Map<LegacyCardinalDirection, LegacyPoint>();
    for (const direction of LEGACY_CARDINAL_DIRECTIONS) {
      const delta = DIRECTION_DELTAS[direction];
      const target = resolveLegacyNavigationTarget(maze, player, delta.x, delta.y);
      if (target !== null) {
        legalTargets.set(direction, target);
      }
    }

    if (this.queuedDirection !== null) {
      const queuedTarget = legalTargets.get(this.queuedDirection) ?? null;
      if (queuedTarget !== null) {
        this.activeDirection = this.queuedDirection;
        this.queuedDirection = null;
        this.assistedLaneShiftCount = 0;
        this.assistedLaneShiftPendingResume = false;
        return this.createMoveStep('queued-turn', this.activeDirection, queuedTarget);
      }
    }

    if (this.activeDirection === null) {
      return this.createStopStep('idle');
    }

    const activeTarget = legalTargets.get(this.activeDirection) ?? null;
    if (activeTarget !== null) {
      this.assistedLaneShiftPendingResume = false;
      return this.createMoveStep('continued', this.activeDirection, activeTarget);
    }

    if (this.queuedDirection !== null) {
      return this.createStopStep('stopped-awaiting-queued-direction');
    }

    if (options.assistedLaneShiftEnabled === false) {
      return this.createStopStep('stopped-assistance-disabled');
    }

    if (this.assistedLaneShiftPendingResume) {
      return this.createStopStep('stopped-at-assist-limit');
    }

    const heldDirection = this.activeDirection;
    const heldDelta = DIRECTION_DELTAS[heldDirection];
    const laneShiftCandidates = ORTHOGONAL_DIRECTIONS[heldDirection].flatMap((direction) => {
      const target = legalTargets.get(direction) ?? null;
      if (target === null) {
        return [];
      }

      const resumedTarget = resolveLegacyNavigationTarget(
        maze,
        target,
        heldDelta.x,
        heldDelta.y
      );
      return resumedTarget === null ? [] : [{ direction, target }];
    });
    if (laneShiftCandidates.length === 0) {
      return this.createStopStep('stopped-at-dead-end');
    }
    // If both sides qualify, prefer the stable orthogonal ordering. A held cardinal
    // direction should never feel dead merely because a one-tile opening exists on
    // both sides; the move remains bounded and the held lane must resume next.
    const laneShift = laneShiftCandidates[0]!;
    this.assistedLaneShiftCount += 1;
    this.assistedLaneShiftPendingResume = true;
    return this.createMoveStep('assisted-lane-shift', laneShift.direction, laneShift.target);
  }

  getDiagnostics(): LegacyDirectionalIntentDiagnostics {
    return {
      activeDirection: this.activeDirection,
      assistedLaneShiftCount: this.assistedLaneShiftCount,
      assistedLaneShiftTileLimit: LEGACY_DIRECTIONAL_INTENT_LANE_SHIFT_TILE_LIMIT,
      lastDecision: this.lastDecision,
      queuedDirection: this.queuedDirection,
      requestedDirections: [...this.requestedDirections]
    };
  }

  reset(): void {
    this.activeDirection = null;
    this.assistedLaneShiftCount = 0;
    this.assistedLaneShiftPendingResume = false;
    this.lastDecision = 'idle';
    this.queuedDirection = null;
    this.requestedDirections = [];
  }

  private createMoveStep(
    decision: LegacyDirectionalIntentDecision,
    direction: LegacyCardinalDirection,
    target: LegacyPoint
  ): LegacyDirectionalIntentStep {
    const delta = DIRECTION_DELTAS[direction];
    this.lastDecision = decision;
    return {
      decision,
      deltaX: delta.x,
      deltaY: delta.y,
      direction,
      moved: true,
      target: { ...target }
    };
  }

  private createStopStep(decision: LegacyDirectionalIntentDecision): LegacyDirectionalIntentStep {
    this.lastDecision = decision;
    return {
      decision,
      deltaX: 0,
      deltaY: 0,
      direction: null,
      moved: false,
      target: null
    };
  }
}
