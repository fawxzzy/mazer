/**
 * MAZER-FLOW-001: the one-line "how to move" hint on level 1.
 *
 * Pure rules only (no DOM, no Phaser): what the line says, when a new player sees it, and which input counts as
 * "the first move". The DOM presenter is src/render/legacyControlHintOverlay.ts. The hint is a one-time tutorial
 * token kept per DEVICE (the tutorial ack store, scoped to the fixed id `device`), never in the account database.
 */
import type { TutorialRegistry, TutorialToken } from '../tutorial/tutorialRegistry.ts';

export const LEGACY_CONTROL_HINT_DEVICE_ID = 'device';

export const LEGACY_CONTROL_HINT_TOKEN: TutorialToken = Object.freeze({
  id: 'level-1.controls',
  trigger: Object.freeze({ kind: 'first-occurrence', event: 'level-1-play' } as const),
  repeat: 'once',
  revision: 1,
  order: 0,
  copy: Object.freeze({
    titleKey: 'hint.level1.controls.title',
    bodyKey: 'hint.level1.controls.body',
    continueKey: 'hint.level1.controls.continue'
  })
});

export const LEGACY_CONTROL_HINT_REGISTRY: TutorialRegistry = Object.freeze({
  schemaVersion: 1,
  tokens: Object.freeze([LEGACY_CONTROL_HINT_TOKEN])
});

/**
 * Two short lines max: line 1 how to move (worded for the input the player actually uses), line 2 the goal.
 * Same words as the Guide Move and Goal rows. Each line fits 320 px at 13 px.
 */
export const LEGACY_CONTROL_HINT_GOAL_LINE = 'Reach the star to clear the maze.';
export const LEGACY_CONTROL_HINT_MOVE_TOUCH = 'Touch and drag anywhere to move.';
export const LEGACY_CONTROL_HINT_MOVE_MOUSE = 'Click and drag, or use arrows / WASD.';
export const LEGACY_CONTROL_HINT_MOVE_KEYS = 'Arrow keys or WASD to move.';
/** True on every device, shown before any input is seen on a device that may be a computer. */
export const LEGACY_CONTROL_HINT_MOVE_NEUTRAL = 'Drag anywhere, or use arrows / WASD.';

export const LEGACY_CONTROL_HINT_COPY_TOUCH = `${LEGACY_CONTROL_HINT_MOVE_TOUCH}\n${LEGACY_CONTROL_HINT_GOAL_LINE}`;
export const LEGACY_CONTROL_HINT_COPY_MOUSE = `${LEGACY_CONTROL_HINT_MOVE_MOUSE}\n${LEGACY_CONTROL_HINT_GOAL_LINE}`;
export const LEGACY_CONTROL_HINT_COPY_KEYS = `${LEGACY_CONTROL_HINT_MOVE_KEYS}\n${LEGACY_CONTROL_HINT_GOAL_LINE}`;
export const LEGACY_CONTROL_HINT_COPY_NEUTRAL = `${LEGACY_CONTROL_HINT_MOVE_NEUTRAL}\n${LEGACY_CONTROL_HINT_GOAL_LINE}`;

/**
 * First-time cards slice 9 (spec section 8 item 1, `?lab=firsttime` only): the hint as a card names the goal the way
 * the board draws it and the Guide Goal row says it ("twin stars"). The flag-off line above is unchanged until the flag
 * ships for players; then the old line goes.
 */
export const LEGACY_CONTROL_HINT_CARD_GOAL_LINE = 'Reach the twin stars to clear the maze.';
export const LEGACY_CONTROL_HINT_CARD_COPY_TOUCH = `${LEGACY_CONTROL_HINT_MOVE_TOUCH}\n${LEGACY_CONTROL_HINT_CARD_GOAL_LINE}`;
export const LEGACY_CONTROL_HINT_CARD_COPY_MOUSE = `${LEGACY_CONTROL_HINT_MOVE_MOUSE}\n${LEGACY_CONTROL_HINT_CARD_GOAL_LINE}`;
export const LEGACY_CONTROL_HINT_CARD_COPY_KEYS = `${LEGACY_CONTROL_HINT_MOVE_KEYS}\n${LEGACY_CONTROL_HINT_CARD_GOAL_LINE}`;
export const LEGACY_CONTROL_HINT_CARD_COPY_NEUTRAL = `${LEGACY_CONTROL_HINT_MOVE_NEUTRAL}\n${LEGACY_CONTROL_HINT_CARD_GOAL_LINE}`;

/** Auto-fade if the player never moves, so the line cannot linger. The hint is then considered seen. */
export const LEGACY_CONTROL_HINT_MAX_VISIBLE_MS = 12000;
export const LEGACY_CONTROL_HINT_FADE_MS = 400;
/** A touch/mouse drag shorter than this is a tap, not a move. */
export const LEGACY_CONTROL_HINT_DRAG_THRESHOLD_PX = 8;

/** The kind of input a copy variant is worded for. `neutral` = true everywhere (no input seen yet on a possible computer). */
export type LegacyControlHintInput = 'touch' | 'mouse' | 'keys' | 'neutral';
/** An input kind actually observed from a real event. */
export type LegacyControlHintObservedInput = 'touch' | 'mouse' | 'keys';

/** Everything the presenter can observe about the device; every field is optional so a missing API means "no evidence". */
export interface LegacyControlHintDeviceFacts {
  /** matchMedia('(pointer: coarse)') */
  readonly coarsePointer?: boolean;
  /** matchMedia('(pointer: fine)') */
  readonly finePointer?: boolean;
  /** matchMedia('(hover: hover)') */
  readonly hoverCapable?: boolean;
  /** Installed / home-screen display mode (display-mode: standalone, or navigator.standalone). */
  readonly standalone?: boolean;
  readonly userAgent?: string;
  /** navigator.maxTouchPoints; a hybrid laptop reports > 0 but is not touch-only, so it is not used as touch proof. */
  readonly maxTouchPoints?: number;
  /** The most recent real input (pointerType on pointerdown, trusted keydown), or null before any. */
  readonly lastInput?: LegacyControlHintObservedInput | null;
}

const MOBILE_UA = /iPhone|iPad|iPod|Android|Mobile|CriOS|FxiOS/i;

export const isLegacyControlHintMobileUserAgent = (userAgent: string | undefined): boolean => (
  typeof userAgent === 'string' && MOBILE_UA.test(userAgent)
);

/** Pointer events map to an input kind: touch and pen count as touch; a mouse is a mouse. */
export const classifyLegacyControlHintPointer = (pointerType: string): LegacyControlHintObservedInput | null => {
  if (pointerType === 'touch' || pointerType === 'pen') return 'touch';
  if (pointerType === 'mouse') return 'mouse';
  return null;
};

/**
 * The hint follows the input the player ACTUALLY uses: the last real input wins (touch, mouse or key), so a
 * hybrid or a computer that drags gets matching wording. Before any input, touch is the default; the neutral
 * line is used only on a device that positively looks like a computer (fine pointer with hover, not mobile, not
 * standalone, no coarse primary pointer), which may be driven by mouse or keys.
 */
export const resolveLegacyControlHintInput = (facts: LegacyControlHintDeviceFacts): LegacyControlHintInput => {
  if (facts.lastInput === 'touch' || facts.lastInput === 'mouse' || facts.lastInput === 'keys') return facts.lastInput;
  const touchDevice = facts.coarsePointer === true
    || facts.standalone === true
    || isLegacyControlHintMobileUserAgent(facts.userAgent);
  if (touchDevice) return 'touch';
  return facts.finePointer === true && facts.hoverCapable === true ? 'neutral' : 'touch';
};

export const resolveLegacyControlHintCopy = (input: LegacyControlHintInput): string => {
  switch (input) {
    case 'keys': return LEGACY_CONTROL_HINT_COPY_KEYS;
    case 'mouse': return LEGACY_CONTROL_HINT_COPY_MOUSE;
    case 'neutral': return LEGACY_CONTROL_HINT_COPY_NEUTRAL;
    default: return LEGACY_CONTROL_HINT_COPY_TOUCH;
  }
};

/** The card's body (flag on): the same move line, then the twin-stars goal line. */
export const resolveLegacyControlHintCardCopy = (input: LegacyControlHintInput): string => {
  switch (input) {
    case 'keys': return LEGACY_CONTROL_HINT_CARD_COPY_KEYS;
    case 'mouse': return LEGACY_CONTROL_HINT_CARD_COPY_MOUSE;
    case 'neutral': return LEGACY_CONTROL_HINT_CARD_COPY_NEUTRAL;
    default: return LEGACY_CONTROL_HINT_CARD_COPY_TOUCH;
  }
};

export interface LegacyControlHintFacts {
  readonly mode: string;
  readonly overlay: string;
  /** Displayed player level, or null when unknown. */
  readonly level: number | null;
  readonly acknowledged: boolean;
}

export const shouldShowLegacyControlHint = (facts: LegacyControlHintFacts): boolean => (
  !facts.acknowledged && facts.mode === 'play' && facts.overlay === 'none' && facts.level === 1
);

const MOVE_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'
]);

export const isLegacyControlHintMoveKey = (key: string): boolean => MOVE_KEYS.has(key);

export const isLegacyControlHintDrag = (dxPx: number, dyPx: number): boolean => (
  Math.hypot(dxPx, dyPx) >= LEGACY_CONTROL_HINT_DRAG_THRESHOLD_PX
);

/** Fade length: instant under reduced motion (no animation), a short fade otherwise. */
export const resolveLegacyControlHintFadeMs = (reducedMotion: boolean): number => (
  reducedMotion ? 0 : LEGACY_CONTROL_HINT_FADE_MS
);
