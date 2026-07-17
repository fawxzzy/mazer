import {
  resolveLegacyNavigationTarget,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';

export const LEGACY_DIRECTIONAL_INTENT_LANE_SHIFT_TILE_LIMIT = 1;
export const LEGACY_ANALOG_DIRECTION_EPSILON = 0.001;

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
  | 'steered-turn'
  | 'assisted-lane-shift'
  | 'stopped-assistance-disabled'
  | 'stopped-at-assist-limit'
  | 'stopped-awaiting-queued-direction'
  | 'stopped-at-dead-end';

export interface LegacyDirectionalIntentDiagnostics {
  activeDirection: LegacyCardinalDirection | null;
  analogVector: { x: number; y: number } | null;
  assistedLaneShiftCount: number;
  assistedLaneShiftTileLimit: number;
  inputMode: 'analog' | 'discrete';
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

type LegacyQueuedDirectionRole = 'turn' | 'fallback';

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

export const resolveLegacyAnalogCardinalDirectionsFromVector = (
  deltaX: number,
  deltaY: number
): LegacyCardinalDirection[] => {
  const axes: Array<{ direction: LegacyCardinalDirection; magnitude: number; order: number }> = [];
  if (Math.abs(deltaX) > LEGACY_ANALOG_DIRECTION_EPSILON) {
    axes.push({
      direction: deltaX > 0 ? 'right' : 'left',
      magnitude: Math.abs(deltaX),
      order: 0
    });
  }
  if (Math.abs(deltaY) > LEGACY_ANALOG_DIRECTION_EPSILON) {
    axes.push({
      direction: deltaY > 0 ? 'down' : 'up',
      magnitude: Math.abs(deltaY),
      order: 1
    });
  }
  axes.sort((left, right) => {
    const magnitudeDelta = right.magnitude - left.magnitude;
    return Math.abs(magnitudeDelta) <= 0.000_001 ? left.order - right.order : magnitudeDelta;
  });
  return axes.map((axis) => axis.direction);
};

const resolveLegacyAnalogDirectionScore = (
  direction: LegacyCardinalDirection,
  vector: { x: number; y: number }
): number => {
  const delta = DIRECTION_DELTAS[direction];
  return (delta.x * vector.x) + (delta.y * vector.y);
};

export class LegacyDirectionalIntentResolver {
  private activeDirection: LegacyCardinalDirection | null = null;

  private analogVector: { x: number; y: number } | null = null;

  private assistedLaneShiftCount = 0;

  private assistedLaneShiftPendingResume = false;

  private lastDecision: LegacyDirectionalIntentDecision = 'idle';

  private inputMode: 'analog' | 'discrete' = 'discrete';

  private queuedDirection: LegacyCardinalDirection | null = null;

  private queuedDirectionRole: LegacyQueuedDirectionRole | null = null;

  private requestedDirections: LegacyCardinalDirection[] = [];

  request(directions: readonly LegacyCardinalDirection[]): LegacyDirectionalIntentDiagnostics {
    const wasDiscrete = this.inputMode === 'discrete';
    this.inputMode = 'discrete';
    this.analogVector = null;
    const requestedDirections = uniqueDirections(directions);
    if (wasDiscrete && directionsEqual(requestedDirections, this.requestedDirections)) {
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
      this.queuedDirectionRole = null;
      return this.getDiagnostics();
    }

    const secondaryDirection = requestedDirections.find((direction) => direction !== preferredDirection) ?? null;

    if (this.activeDirection === null) {
      this.activeDirection = preferredDirection;
      this.queuedDirection = secondaryDirection;
      this.queuedDirectionRole = secondaryDirection === null ? null : 'fallback';
      return this.getDiagnostics();
    }

    if (preferredDirection !== this.activeDirection) {
      this.queuedDirection = preferredDirection;
      this.queuedDirectionRole = 'turn';
      return this.getDiagnostics();
    }

    this.queuedDirection = secondaryDirection;
    this.queuedDirectionRole = secondaryDirection === null ? null : 'fallback';
    return this.getDiagnostics();
  }

  synchronize(directions: readonly LegacyCardinalDirection[]): LegacyDirectionalIntentDiagnostics {
    this.inputMode = 'discrete';
    this.analogVector = null;
    const requestedDirections = uniqueDirections(directions);
    this.requestedDirections = requestedDirections;
    if (requestedDirections.length === 0) {
      this.reset();
      return this.getDiagnostics();
    }

    if (this.activeDirection === null) {
      this.activeDirection = requestedDirections[0] ?? null;
      this.assistedLaneShiftCount = 0;
      this.assistedLaneShiftPendingResume = false;
    }
    const preferredDirection = requestedDirections[0] ?? null;
    const secondaryDirection = requestedDirections.find((direction) => direction !== preferredDirection) ?? null;
    if (preferredDirection !== null && preferredDirection !== this.activeDirection) {
      this.queuedDirection = preferredDirection;
      this.queuedDirectionRole = 'turn';
    } else {
      this.queuedDirection = secondaryDirection;
      this.queuedDirectionRole = secondaryDirection === null ? null : 'fallback';
    }
    this.lastDecision = 'requested';
    return this.getDiagnostics();
  }

  requestAnalog(deltaX: number, deltaY: number): LegacyDirectionalIntentDiagnostics {
    const magnitude = Math.hypot(deltaX, deltaY);
    if (!Number.isFinite(magnitude) || magnitude <= LEGACY_ANALOG_DIRECTION_EPSILON) {
      this.reset();
      return this.getDiagnostics();
    }

    const nextVector = {
      x: deltaX / magnitude,
      y: deltaY / magnitude
    };
    const unchanged = this.inputMode === 'analog'
      && this.analogVector !== null
      && Math.max(
        Math.abs(this.analogVector.x - nextVector.x),
        Math.abs(this.analogVector.y - nextVector.y)
      ) < 0.008;
    if (unchanged) {
      return this.getDiagnostics();
    }

    const previousPrimaryDirection = this.requestedDirections[0] ?? null;
    const nextRequestedDirections = resolveLegacyAnalogCardinalDirectionsFromVector(nextVector.x, nextVector.y);
    const dominantDirectionChanged = this.inputMode !== 'analog'
      || previousPrimaryDirection !== (nextRequestedDirections[0] ?? null);
    this.inputMode = 'analog';
    this.analogVector = nextVector;
    this.requestedDirections = nextRequestedDirections;
    this.queuedDirection = null;
    this.queuedDirectionRole = null;
    if (dominantDirectionChanged) {
      this.assistedLaneShiftCount = 0;
      this.assistedLaneShiftPendingResume = false;
    }
    this.lastDecision = 'requested';
    if (this.activeDirection === null) {
      this.activeDirection = this.requestedDirections[0] ?? null;
    }
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

    if (this.inputMode === 'analog' && this.analogVector !== null) {
      return this.stepAnalog(maze, legalTargets, options);
    }

    if (this.queuedDirection !== null && this.queuedDirectionRole === 'turn') {
      const queuedTarget = legalTargets.get(this.queuedDirection) ?? null;
      if (queuedTarget !== null) {
        this.activeDirection = this.queuedDirection;
        const fallbackDirection = this.requestedDirections.find((direction) => direction !== this.activeDirection) ?? null;
        this.queuedDirection = fallbackDirection;
        this.queuedDirectionRole = fallbackDirection === null ? null : 'fallback';
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

    if (this.queuedDirection !== null && this.queuedDirectionRole === 'turn') {
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
    const orthogonalDirections = this.queuedDirectionRole === 'fallback' && this.queuedDirection !== null
      ? ORTHOGONAL_DIRECTIONS[heldDirection].filter((direction) => direction === this.queuedDirection)
      : ORTHOGONAL_DIRECTIONS[heldDirection];
    const laneShiftCandidates = orthogonalDirections.flatMap((direction) => {
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
      analogVector: this.analogVector === null ? null : { ...this.analogVector },
      assistedLaneShiftCount: this.assistedLaneShiftCount,
      assistedLaneShiftTileLimit: LEGACY_DIRECTIONAL_INTENT_LANE_SHIFT_TILE_LIMIT,
      inputMode: this.inputMode,
      lastDecision: this.lastDecision,
      queuedDirection: this.queuedDirection,
      requestedDirections: [...this.requestedDirections]
    };
  }

  reset(): void {
    this.activeDirection = null;
    this.analogVector = null;
    this.assistedLaneShiftCount = 0;
    this.assistedLaneShiftPendingResume = false;
    this.lastDecision = 'idle';
    this.inputMode = 'discrete';
    this.queuedDirection = null;
    this.queuedDirectionRole = null;
    this.requestedDirections = [];
  }

  private stepAnalog(
    maze: Pick<LegacyMazeSnapshot, 'grid'>,
    legalTargets: ReadonlyMap<LegacyCardinalDirection, LegacyPoint>,
    options: LegacyDirectionalIntentStepOptions
  ): LegacyDirectionalIntentStep {
    const vector = this.analogVector;
    if (vector === null) {
      return this.createStopStep('idle');
    }

    const desiredDirections = resolveLegacyAnalogCardinalDirectionsFromVector(vector.x, vector.y);
    const heldDirection = desiredDirections[0] ?? null;
    const directDirection = desiredDirections.find((direction) => legalTargets.has(direction)) ?? null;
    if (
      heldDirection !== null
      && directDirection !== null
      && directDirection !== heldDirection
      && options.assistedLaneShiftEnabled !== false
      && !this.assistedLaneShiftPendingResume
    ) {
      const directTarget = legalTargets.get(directDirection)!;
      const heldDelta = DIRECTION_DELTAS[heldDirection];
      if (resolveLegacyNavigationTarget(maze, directTarget, heldDelta.x, heldDelta.y) !== null) {
        this.activeDirection = heldDirection;
        this.assistedLaneShiftCount += 1;
        this.assistedLaneShiftPendingResume = true;
        return this.createMoveStep('assisted-lane-shift', directDirection, directTarget);
      }
    }
    if (directDirection !== null) {
      const decision = this.activeDirection === null || this.activeDirection === directDirection
        ? 'continued'
        : 'steered-turn';
      this.activeDirection = directDirection;
      this.assistedLaneShiftPendingResume = false;
      return this.createMoveStep(decision, directDirection, legalTargets.get(directDirection)!);
    }

    if (heldDirection === null) {
      return this.createStopStep('idle');
    }
    this.activeDirection = heldDirection;
    if (options.assistedLaneShiftEnabled === false) {
      return this.createStopStep('stopped-assistance-disabled');
    }
    if (this.assistedLaneShiftPendingResume) {
      return this.createStopStep('stopped-at-assist-limit');
    }

    const heldDelta = DIRECTION_DELTAS[heldDirection];
    const laneShiftCandidates = ORTHOGONAL_DIRECTIONS[heldDirection]
      .map((direction) => ({
        direction,
        score: resolveLegacyAnalogDirectionScore(direction, vector),
        target: legalTargets.get(direction) ?? null
      }))
      .filter((candidate): candidate is { direction: LegacyCardinalDirection; score: number; target: LegacyPoint } => {
        if (candidate.target === null) {
          return false;
        }
        return resolveLegacyNavigationTarget(
          maze,
          candidate.target,
          heldDelta.x,
          heldDelta.y
        ) !== null;
      })
      .sort((left, right) => right.score - left.score);
    const laneShift = laneShiftCandidates[0] ?? null;
    if (laneShift === null) {
      return this.createStopStep('stopped-at-dead-end');
    }

    this.assistedLaneShiftCount += 1;
    this.assistedLaneShiftPendingResume = true;
    return this.createMoveStep('assisted-lane-shift', laneShift.direction, laneShift.target);
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
