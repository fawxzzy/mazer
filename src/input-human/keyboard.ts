import {
  type HumanInputDropReason,
  isMovementActionKind,
  type KeyboardInputLike,
  type HumanInputAction,
  type HumanInputActionKind
} from './actions.ts';

export interface HumanInputRepeatGateOptions {
  moveRepeatMinIntervalMs?: number;
}

export interface HumanInputRepeatGateDecision {
  accepted: boolean;
  reason: HumanInputDropReason | null;
}

export interface HumanInputRepeatGateSnapshot {
  acceptedCount: number;
  droppedCount: number;
  mergedCount: number;
  lastAcceptedActionKind: HumanInputActionKind | null;
  lastAcceptedAtMs: number | null;
  lastDroppedActionKind: HumanInputActionKind | null;
  lastDroppedReason: HumanInputDropReason | null;
  lastDroppedAtMs: number | null;
}

const KEYBOARD_CODE_TO_ACTION: Record<string, HumanInputActionKind> = {
  ArrowUp: 'move_up',
  ArrowDown: 'move_down',
  ArrowLeft: 'move_left',
  ArrowRight: 'move_right',
  KeyW: 'move_up',
  KeyS: 'move_down',
  KeyA: 'move_left',
  KeyD: 'move_right',
  KeyP: 'pause',
  Space: 'pause',
  KeyT: 'toggle_thoughts'
};

const KEYBOARD_KEY_TO_ACTION: Record<string, HumanInputActionKind> = {
  arrowup: 'move_up',
  arrowdown: 'move_down',
  arrowleft: 'move_left',
  arrowright: 'move_right',
  w: 'move_up',
  s: 'move_down',
  a: 'move_left',
  d: 'move_right',
  p: 'pause',
  ' ': 'pause',
  t: 'toggle_thoughts'
};

const normalizeKey = (value: string | null | undefined): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value === ' ' ? ' ' : value.trim().toLowerCase();
};

export const resolveHumanKeyboardActionKind = (
  event: KeyboardInputLike
): HumanInputActionKind | null => {
  const code = typeof event.code === 'string' ? event.code.trim() : '';
  if (code.length > 0 && KEYBOARD_CODE_TO_ACTION[code]) {
    return KEYBOARD_CODE_TO_ACTION[code];
  }

  const normalizedKey = normalizeKey(event.key);
  return KEYBOARD_KEY_TO_ACTION[normalizedKey] ?? null;
};

export const resolveHumanKeyboardAction = (
  event: KeyboardInputLike,
  nowMs = Date.now()
): HumanInputAction | null => {
  const kind = resolveHumanKeyboardActionKind(event);
  if (!kind) {
    return null;
  }

  return {
    kind,
    source: 'keyboard',
    atMs: Number.isFinite(event.timeStamp) ? Math.max(0, Math.round(event.timeStamp ?? nowMs)) : nowMs,
    repeat: event.repeat === true,
    key: typeof event.code === 'string' && event.code.trim().length > 0
      ? event.code.trim()
      : typeof event.key === 'string' && event.key.trim().length > 0
        ? event.key.trim()
        : kind
  };
};

export class HumanInputRepeatGate {
  private readonly moveRepeatMinIntervalMs: number;

  private readonly lastAcceptedAtMs = new Map<HumanInputActionKind, number>();

  private lastAcceptedMovementAtMs: number | null = null;

  private acceptedCount = 0;

  private droppedCount = 0;

  private mergedCount = 0;

  private lastAcceptedActionKind: HumanInputActionKind | null = null;

  private lastAcceptedAtMsValue: number | null = null;

  private lastDroppedActionKind: HumanInputActionKind | null = null;

  private lastDroppedReason: HumanInputDropReason | null = null;

  private lastDroppedAtMs: number | null = null;

  constructor(options: HumanInputRepeatGateOptions = {}) {
    this.moveRepeatMinIntervalMs = Math.max(42, Math.round(options.moveRepeatMinIntervalMs ?? 112));
  }

  inspect(
    action: HumanInputAction,
    nowMs = action.atMs ?? Date.now(),
    options: HumanInputRepeatGateOptions = {}
  ): HumanInputRepeatGateDecision {
    const acceptedAtMs = Number.isFinite(nowMs) ? Math.max(0, Math.round(nowMs)) : Date.now();
    const movementAction = isMovementActionKind(action.kind);
    const lastAcceptedAt = movementAction
      ? this.lastAcceptedMovementAtMs
      : this.lastAcceptedAtMs.get(action.kind) ?? null;
    const moveRepeatMinIntervalMs = Math.max(
      42,
      Math.round(options.moveRepeatMinIntervalMs ?? this.moveRepeatMinIntervalMs)
    );

    if (!action.repeat) {
      this.acceptedCount += 1;
      this.lastAcceptedAtMs.set(action.kind, acceptedAtMs);
      if (movementAction) {
        this.lastAcceptedMovementAtMs = acceptedAtMs;
      }
      this.lastAcceptedActionKind = action.kind;
      this.lastAcceptedAtMsValue = acceptedAtMs;
      return {
        accepted: true,
        reason: null
      };
    }

    if (!movementAction) {
      this.droppedCount += 1;
      this.lastDroppedActionKind = action.kind;
      this.lastDroppedReason = 'repeat_blocked';
      this.lastDroppedAtMs = acceptedAtMs;
      return {
        accepted: false,
        reason: 'repeat_blocked'
      };
    }

    if (lastAcceptedAt !== null && (acceptedAtMs - lastAcceptedAt) < moveRepeatMinIntervalMs) {
      this.mergedCount += 1;
      this.lastDroppedActionKind = action.kind;
      this.lastDroppedReason = 'repeat_merged';
      this.lastDroppedAtMs = acceptedAtMs;
      return {
        accepted: false,
        reason: 'repeat_merged'
      };
    }

    this.acceptedCount += 1;
    this.lastAcceptedAtMs.set(action.kind, acceptedAtMs);
    this.lastAcceptedMovementAtMs = acceptedAtMs;
    this.lastAcceptedActionKind = action.kind;
    this.lastAcceptedAtMsValue = acceptedAtMs;
    return {
      accepted: true,
      reason: null
    };
  }

  accept(
    action: HumanInputAction,
    nowMs = action.atMs ?? Date.now(),
    options: HumanInputRepeatGateOptions = {}
  ): boolean {
    return this.inspect(action, nowMs, options).accepted;
  }

  getSnapshot(): HumanInputRepeatGateSnapshot {
    return {
      acceptedCount: this.acceptedCount,
      droppedCount: this.droppedCount,
      mergedCount: this.mergedCount,
      lastAcceptedActionKind: this.lastAcceptedActionKind,
      lastAcceptedAtMs: this.lastAcceptedAtMsValue,
      lastDroppedActionKind: this.lastDroppedActionKind,
      lastDroppedReason: this.lastDroppedReason,
      lastDroppedAtMs: this.lastDroppedAtMs
    };
  }

  reset(): void {
    this.lastAcceptedAtMs.clear();
    this.lastAcceptedMovementAtMs = null;
    this.acceptedCount = 0;
    this.droppedCount = 0;
    this.mergedCount = 0;
    this.lastAcceptedActionKind = null;
    this.lastAcceptedAtMsValue = null;
    this.lastDroppedActionKind = null;
    this.lastDroppedReason = null;
    this.lastDroppedAtMs = null;
  }
}

export const resolveHumanInputActionKindFromKeyboard = resolveHumanKeyboardActionKind;
