export const HUMAN_INPUT_ACTION_KINDS = [
  'move_up',
  'move_up_right',
  'move_down',
  'move_down_right',
  'move_left',
  'move_down_left',
  'move_right',
  'move_up_left',
  'pause',
  'restart_attempt',
  'toggle_thoughts'
] as const;

export const HUMAN_MOVEMENT_ACTION_KINDS = [
  'move_up',
  'move_up_right',
  'move_down',
  'move_down_right',
  'move_left',
  'move_down_left',
  'move_right',
  'move_up_left'
] as const;

export type HumanInputActionKind = (typeof HUMAN_INPUT_ACTION_KINDS)[number];
export type HumanMovementActionKind = (typeof HUMAN_MOVEMENT_ACTION_KINDS)[number];
export type RuntimeMode = 'watch' | 'play';
export type HumanInputSource = 'keyboard' | 'touch' | 'ai';
export type HumanInputDropReason =
  | 'repeat_blocked'
  | 'repeat_merged'
  | 'queue_full'
  | 'queue_merged'
  | 'watch_ignored'
  | 'touch_deadzone'
  | 'touch_duplicate';

export interface KeyboardInputLike {
  code?: string | null;
  key?: string | null;
  repeat?: boolean;
  timeStamp?: number;
}

export interface HumanInputAction {
  kind: HumanInputActionKind;
  source: HumanInputSource;
  atMs?: number;
  repeat?: boolean;
  key?: string;
  repeatIndex?: number;
}

export interface HumanInputTimingSnapshot {
  acceptedCount: number;
  droppedCount: number;
  mergedCount: number;
  lastAcceptedActionKind: HumanInputActionKind | null;
  lastAcceptedSource: HumanInputSource | null;
  lastAcceptedAtMs: number | null;
  lastConsumedAtMs: number | null;
  lastDroppedActionKind: HumanInputActionKind | null;
  lastDroppedReason: HumanInputDropReason | null;
  lastDroppedAtMs: number | null;
}

export const isHumanInputActionKind = (value: unknown): value is HumanInputActionKind => (
  typeof value === 'string' && (HUMAN_INPUT_ACTION_KINDS as readonly string[]).includes(value)
);

export const isMovementActionKind = (
  value: HumanInputActionKind | null | undefined
): value is HumanMovementActionKind => (
  typeof value === 'string'
  && (HUMAN_MOVEMENT_ACTION_KINDS as readonly string[]).includes(value)
);

export interface HumanMovementVector {
  deltaX: number;
  deltaY: number;
}

export const resolveHumanMovementActionVector = (
  control: HumanMovementActionKind
): HumanMovementVector => {
  switch (control) {
    case 'move_up':
      return { deltaX: 0, deltaY: -1 };
    case 'move_up_right':
      return { deltaX: 1, deltaY: -1 };
    case 'move_right':
      return { deltaX: 1, deltaY: 0 };
    case 'move_down_right':
      return { deltaX: 1, deltaY: 1 };
    case 'move_down':
      return { deltaX: 0, deltaY: 1 };
    case 'move_down_left':
      return { deltaX: -1, deltaY: 1 };
    case 'move_left':
      return { deltaX: -1, deltaY: 0 };
    case 'move_up_left':
      return { deltaX: -1, deltaY: -1 };
    default:
      return control satisfies never;
  }
};

export const resolveHumanMovementActionFromVector = (
  deltaX: number,
  deltaY: number
): HumanMovementActionKind | null => {
  if (deltaX === 0 && deltaY < 0) {
    return 'move_up';
  }
  if (deltaX > 0 && deltaY < 0) {
    return 'move_up_right';
  }
  if (deltaX > 0 && deltaY === 0) {
    return 'move_right';
  }
  if (deltaX > 0 && deltaY > 0) {
    return 'move_down_right';
  }
  if (deltaX === 0 && deltaY > 0) {
    return 'move_down';
  }
  if (deltaX < 0 && deltaY > 0) {
    return 'move_down_left';
  }
  if (deltaX < 0 && deltaY === 0) {
    return 'move_left';
  }
  if (deltaX < 0 && deltaY < 0) {
    return 'move_up_left';
  }
  return null;
};

export const resolveHumanMovementActionFromPriorityStack = (
  controls: readonly HumanMovementActionKind[],
  limit = 2
): HumanMovementActionKind | null => {
  let deltaX = 0;
  let deltaY = 0;

  for (const control of controls.slice(0, Math.max(1, Math.round(limit)))) {
    const vector = resolveHumanMovementActionVector(control);
    if (deltaX === 0 && vector.deltaX !== 0) {
      deltaX = vector.deltaX;
    }
    if (deltaY === 0 && vector.deltaY !== 0) {
      deltaY = vector.deltaY;
    }
    if (deltaX !== 0 && deltaY !== 0) {
      break;
    }
  }

  return resolveHumanMovementActionFromVector(deltaX, deltaY);
};

export const resolveHumanMovementPriorityCandidates = (
  controls: readonly HumanMovementActionKind[],
  limit = 2
): HumanMovementActionKind[] => {
  const candidateLimit = Math.max(1, Math.round(limit));
  const candidates: HumanMovementActionKind[] = [];

  for (const control of controls) {
    if (candidates.includes(control)) {
      continue;
    }

    candidates.push(control);
    if (candidates.length >= candidateLimit) {
      break;
    }
  }

  return candidates;
};
