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
