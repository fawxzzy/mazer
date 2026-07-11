import { isWalkableTile, movePoint, resolveLegacyNavigationTarget, type LegacyMazeSnapshot, type LegacyPoint } from './legacyMaze';

export const LEGACY_PLAY_TRAIL_FADE_TAIL = 16;
export const LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS = 50;
export const LEGACY_POINTER_MOVE_MIN_DRAG_PX = 18;
export const LEGACY_POINTER_DIAGONAL_RATIO = 0.55;

export interface LegacyPlayMoveFlags {
  down: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
}

export interface LegacyPlayStepInput {
  deltaX: number;
  deltaY: number;
  maze: LegacyMazeSnapshot;
  player: LegacyPoint;
  toggleTrailFade: boolean;
  trail: LegacyPoint[];
  trailFadeTail?: number;
}

export interface LegacyPlayStepResult {
  moved: boolean;
  player: LegacyPoint;
  reachedGoal: boolean;
  trail: LegacyPoint[];
}

export interface LegacyPlayDiagonalSequenceInput extends LegacyPlayStepInput {
  maxSteps?: number;
}

export interface LegacyPlayDiagonalSequencePlan {
  moved: boolean;
  reachedGoal: boolean;
  steps: Array<{ deltaX: number; deltaY: number }>;
}

export interface LegacyPointerMoveInput {
  boardBounds?: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  };
  endX: number;
  endY: number;
  playerScreenX: number;
  playerScreenY: number;
  startX: number;
  startY: number;
  tileSize: number;
}

export interface LegacyPlayPointerLike {
  id?: number;
  identifier?: number | null;
  pointerId?: number | null;
  x: number;
  y: number;
}

export interface LegacyPlayPointerStart {
  id: number;
  identifier: number | null;
  pointerId: number | null;
  x: number;
  y: number;
}

const copyPoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });
const normalizeDelta = (delta: number): number => Math.sign(delta);
const normalizePointerIdentity = (value: number | null | undefined): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);
const resolveScreenDeltaMoveVector = (
  deltaX: number,
  deltaY: number
): { deltaX: number; deltaY: number } => {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX < 1 && absY < 1) {
    return { deltaX: 0, deltaY: 0 };
  }

  const majorAxis = Math.max(absX, absY);
  const minorAxis = Math.min(absX, absY);
  const keepDiagonal = minorAxis >= majorAxis * LEGACY_POINTER_DIAGONAL_RATIO;

  return {
    deltaX: keepDiagonal || absX >= absY ? Math.sign(deltaX) : 0,
    deltaY: keepDiagonal || absY > absX ? Math.sign(deltaY) : 0
  };
};

export const createLegacyPlayMoveFlags = (): LegacyPlayMoveFlags => ({
  down: false,
  left: false,
  right: false,
  up: false
});

export const resolveLegacyPlayMoveVector = (
  flags: LegacyPlayMoveFlags
): { deltaX: number; deltaY: number } => ({
  deltaX: (flags.right ? 1 : 0) - (flags.left ? 1 : 0),
  deltaY: (flags.down ? 1 : 0) - (flags.up ? 1 : 0)
});

export const resolveLegacyPointerMoveVector = ({
  boardBounds,
  endX,
  endY,
  playerScreenX,
  playerScreenY,
  startX,
  startY,
  tileSize
}: LegacyPointerMoveInput): { deltaX: number; deltaY: number } => {
  if (boardBounds && !isPointInsideLegacyBoardBounds(startX, startY, boardBounds)) {
    return { deltaX: 0, deltaY: 0 };
  }

  const dragDeltaX = endX - startX;
  const dragDeltaY = endY - startY;
  const dragDistance = Math.hypot(dragDeltaX, dragDeltaY);
  const minimumDragDistance = Math.max(LEGACY_POINTER_MOVE_MIN_DRAG_PX, tileSize * 0.35);

  if (dragDistance >= minimumDragDistance) {
    return resolveScreenDeltaMoveVector(dragDeltaX, dragDeltaY);
  }

  return resolveScreenDeltaMoveVector(endX - playerScreenX, endY - playerScreenY);
};

export const createLegacyPlayPointerStart = (pointer: LegacyPlayPointerLike): LegacyPlayPointerStart => ({
  id: normalizePointerIdentity(pointer.id) ?? 0,
  identifier: normalizePointerIdentity(pointer.identifier),
  pointerId: normalizePointerIdentity(pointer.pointerId),
  x: pointer.x,
  y: pointer.y
});

export const isSameLegacyPlayPointer = (
  start: LegacyPlayPointerStart,
  pointer: LegacyPlayPointerLike
): boolean => {
  const pointerId = normalizePointerIdentity(pointer.pointerId);
  if (start.pointerId !== null && pointerId !== null) {
    return start.pointerId === pointerId;
  }

  const identifier = normalizePointerIdentity(pointer.identifier);
  if (start.identifier !== null && identifier !== null) {
    return start.identifier === identifier;
  }

  return start.id === (normalizePointerIdentity(pointer.id) ?? 0);
};

export const isPointInsideLegacyBoardBounds = (
  x: number,
  y: number,
  bounds: { bottom: number; left: number; right: number; top: number }
): boolean => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;

export const resolveLegacyPlayCollisionDelta = (
  maze: LegacyMazeSnapshot,
  player: LegacyPoint,
  deltaX: number,
  deltaY: number
): { deltaX: number; deltaY: number } => {
  const normalizedDeltaX = normalizeDelta(deltaX);
  const normalizedDeltaY = normalizeDelta(deltaY);
  const gatedDeltaX = normalizedDeltaX !== 0 && resolveLegacyNavigationTarget(maze, player, normalizedDeltaX, 0)
    ? normalizedDeltaX
    : 0;
  const gatedDeltaY = normalizedDeltaY !== 0 && resolveLegacyNavigationTarget(maze, player, 0, normalizedDeltaY)
    ? normalizedDeltaY
    : 0;

  if (gatedDeltaX === 0 && gatedDeltaY === 0) {
    return { deltaX: 0, deltaY: 0 };
  }

  const finalTarget = resolveLegacyNavigationTarget(maze, player, gatedDeltaX, gatedDeltaY) ?? movePoint(player, gatedDeltaX, gatedDeltaY);
  if (!isWalkableTile(maze, finalTarget)) {
    return { deltaX: 0, deltaY: 0 };
  }

  return { deltaX: gatedDeltaX, deltaY: gatedDeltaY };
};

export const advanceLegacyPlayStep = ({
  deltaX,
  deltaY,
  maze,
  player,
  toggleTrailFade,
  trail,
  trailFadeTail = LEGACY_PLAY_TRAIL_FADE_TAIL
}: LegacyPlayStepInput): LegacyPlayStepResult => {
  const gatedDelta = resolveLegacyPlayCollisionDelta(maze, player, deltaX, deltaY);
  if (gatedDelta.deltaX === 0 && gatedDelta.deltaY === 0) {
    return {
      moved: false,
      player: copyPoint(player),
      reachedGoal: false,
      trail: trail.map(copyPoint)
    };
  }

  const next = resolveLegacyNavigationTarget(maze, player, gatedDelta.deltaX, gatedDelta.deltaY)
    ?? movePoint(player, gatedDelta.deltaX, gatedDelta.deltaY);
  const nextPlayer = copyPoint(next);
  const nextTrail = [...trail.map(copyPoint), copyPoint(nextPlayer)];
  const boundedTrail = toggleTrailFade && nextTrail.length > trailFadeTail
    ? nextTrail.slice(nextTrail.length - trailFadeTail)
    : nextTrail;

  return {
    moved: true,
    player: nextPlayer,
    reachedGoal: nextPlayer.x === maze.goal.x && nextPlayer.y === maze.goal.y,
    trail: boundedTrail
  };
};

export const resolveLegacyPlayDiagonalSequenceSteps = ({
  deltaX,
  deltaY,
  maxSteps,
  maze,
  player,
  toggleTrailFade,
  trail,
  trailFadeTail = LEGACY_PLAY_TRAIL_FADE_TAIL
}: LegacyPlayDiagonalSequenceInput): LegacyPlayDiagonalSequencePlan => {
  const normalizedX = normalizeDelta(deltaX);
  const normalizedY = normalizeDelta(deltaY);
  if (normalizedX === 0 || normalizedY === 0) {
    const singleStep = advanceLegacyPlayStep({
      deltaX: normalizedX,
      deltaY: normalizedY,
      maze,
      player,
      toggleTrailFade,
      trail,
      trailFadeTail
    });
    return {
      moved: singleStep.moved,
      reachedGoal: singleStep.reachedGoal,
      steps: singleStep.moved ? [{ deltaX: normalizedX, deltaY: normalizedY }] : []
    };
  }

  const horizontal = { deltaX: normalizedX, deltaY: 0 };
  const vertical = { deltaX: 0, deltaY: normalizedY };
  const stepLimit = Math.max(1, Math.round(maxSteps ?? maze.size * 2));
  let currentPlayer = copyPoint(player);
  let currentTrail = trail.map(copyPoint);
  let reachedGoal = false;
  const steps: Array<{ deltaX: number; deltaY: number }> = [];
  let preferHorizontalFirst = true;

  const resolveOrder = (
    order: Array<{ deltaX: number; deltaY: number }>,
    remainingSteps: number
  ): {
    movedCount: number;
    player: LegacyPoint;
    reachedGoal: boolean;
    steps: Array<{ deltaX: number; deltaY: number }>;
    trail: LegacyPoint[];
  } => {
    let orderPlayer = copyPoint(currentPlayer);
    let orderTrail = currentTrail.map(copyPoint);
    let orderReachedGoal = false;
    let movedCount = 0;
    const orderSteps: Array<{ deltaX: number; deltaY: number }> = [];

    for (const delta of order) {
      const next = advanceLegacyPlayStep({
        deltaX: delta.deltaX,
        deltaY: delta.deltaY,
        maze,
        player: orderPlayer,
        toggleTrailFade,
        trail: orderTrail,
        trailFadeTail
      });
      if (!next.moved) {
        continue;
      }

      movedCount += 1;
      orderSteps.push({ deltaX: delta.deltaX, deltaY: delta.deltaY });
      orderPlayer = next.player;
      orderTrail = next.trail;
      orderReachedGoal = next.reachedGoal;
      if (orderReachedGoal || movedCount >= remainingSteps) {
        break;
      }
    }

    return {
      movedCount,
      player: orderPlayer,
      reachedGoal: orderReachedGoal,
      steps: orderSteps,
      trail: orderTrail
    };
  };

  while (steps.length < stepLimit && !reachedGoal) {
    const remainingSteps = stepLimit - steps.length;
    const firstOrder = preferHorizontalFirst ? [horizontal, vertical] : [vertical, horizontal];
    const secondOrder = preferHorizontalFirst ? [vertical, horizontal] : [horizontal, vertical];
    const firstResult = resolveOrder(firstOrder, remainingSteps);
    const secondResult = resolveOrder(secondOrder, remainingSteps);
    const chosen = secondResult.movedCount > firstResult.movedCount ? secondResult : firstResult;
    if (chosen.movedCount === 0) {
      break;
    }

    steps.push(...chosen.steps);
    currentPlayer = chosen.player;
    currentTrail = chosen.trail;
    reachedGoal = chosen.reachedGoal;
    preferHorizontalFirst = !preferHorizontalFirst;
  }

  return {
    moved: steps.length > 0,
    reachedGoal,
    steps
  };
};

export const advanceLegacyPlayDiagonalSequence = ({
  deltaX,
  deltaY,
  maxSteps,
  maze,
  player,
  toggleTrailFade,
  trail,
  trailFadeTail = LEGACY_PLAY_TRAIL_FADE_TAIL
}: LegacyPlayDiagonalSequenceInput): LegacyPlayStepResult => {
  const plan = resolveLegacyPlayDiagonalSequenceSteps({
    deltaX,
    deltaY,
    maxSteps,
    maze,
    player,
    toggleTrailFade,
    trail,
    trailFadeTail
  });
  let currentPlayer = copyPoint(player);
  let currentTrail = trail.map(copyPoint);
  let reachedGoal = false;

  for (const step of plan.steps) {
    const next = advanceLegacyPlayStep({
      deltaX: step.deltaX,
      deltaY: step.deltaY,
      maze,
      player: currentPlayer,
      toggleTrailFade,
      trail: currentTrail,
      trailFadeTail
    });
    if (!next.moved) {
      break;
    }

    currentPlayer = next.player;
    currentTrail = next.trail;
    reachedGoal = next.reachedGoal;
    if (reachedGoal) {
      break;
    }
  }

  return {
    moved: plan.moved,
    player: currentPlayer,
    reachedGoal,
    trail: currentTrail
  };
};
