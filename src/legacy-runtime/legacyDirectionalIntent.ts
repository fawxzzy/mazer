import {
  resolveLegacyNavigationTarget,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from './legacyMaze';

export const LEGACY_DIRECTIONAL_INTENT_ASSISTED_TURN_LIMIT = 4;

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
  | 'assisted-corner'
  | 'stopped-awaiting-queued-direction'
  | 'stopped-at-dead-end'
  | 'stopped-at-intersection'
  | 'stopped-at-assist-limit';

export interface LegacyDirectionalIntentDiagnostics {
  activeDirection: LegacyCardinalDirection | null;
  assistedTurnCount: number;
  assistedTurnLimit: number;
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

const DIRECTION_DELTAS: Record<LegacyCardinalDirection, LegacyPoint> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
};

const OPPOSITE_DIRECTIONS: Record<LegacyCardinalDirection, LegacyCardinalDirection> = {
  up: 'down',
  right: 'left',
  down: 'up',
  left: 'right'
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

  private assistedTurnCount = 0;

  private lastDecision: LegacyDirectionalIntentDecision = 'idle';

  private queuedDirection: LegacyCardinalDirection | null = null;

  private requestedDirections: LegacyCardinalDirection[] = [];

  request(directions: readonly LegacyCardinalDirection[]): LegacyDirectionalIntentDiagnostics {
    const requestedDirections = uniqueDirections(directions);
    if (directionsEqual(requestedDirections, this.requestedDirections)) {
      return this.getDiagnostics();
    }

    this.requestedDirections = requestedDirections;
    this.assistedTurnCount = 0;
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
      this.assistedTurnCount = 0;
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
    player: LegacyPoint
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
        this.assistedTurnCount = 0;
        return this.createMoveStep('queued-turn', this.activeDirection, queuedTarget);
      }
    }

    if (this.activeDirection === null) {
      return this.createStopStep('idle');
    }

    const activeTarget = legalTargets.get(this.activeDirection) ?? null;
    if (activeTarget !== null) {
      return this.createMoveStep('continued', this.activeDirection, activeTarget);
    }

    if (this.queuedDirection !== null) {
      return this.createStopStep('stopped-awaiting-queued-direction');
    }

    const reverseDirection = OPPOSITE_DIRECTIONS[this.activeDirection];
    const forwardContinuations = LEGACY_CARDINAL_DIRECTIONS.filter((direction) => (
      direction !== reverseDirection && legalTargets.has(direction)
    ));
    if (forwardContinuations.length === 0) {
      return this.createStopStep('stopped-at-dead-end');
    }
    if (forwardContinuations.length > 1) {
      return this.createStopStep('stopped-at-intersection');
    }
    if (this.assistedTurnCount >= LEGACY_DIRECTIONAL_INTENT_ASSISTED_TURN_LIMIT) {
      return this.createStopStep('stopped-at-assist-limit');
    }

    const assistedDirection = forwardContinuations[0]!;
    const assistedTarget = legalTargets.get(assistedDirection)!;
    this.activeDirection = assistedDirection;
    this.assistedTurnCount += 1;
    return this.createMoveStep('assisted-corner', assistedDirection, assistedTarget);
  }

  getDiagnostics(): LegacyDirectionalIntentDiagnostics {
    return {
      activeDirection: this.activeDirection,
      assistedTurnCount: this.assistedTurnCount,
      assistedTurnLimit: LEGACY_DIRECTIONAL_INTENT_ASSISTED_TURN_LIMIT,
      lastDecision: this.lastDecision,
      queuedDirection: this.queuedDirection,
      requestedDirections: [...this.requestedDirections]
    };
  }

  reset(): void {
    this.activeDirection = null;
    this.assistedTurnCount = 0;
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
