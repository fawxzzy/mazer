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

/** Same words as the Guide rows (touch: drag anywhere; keys: arrows or WASD; the star is the goal). */
export const LEGACY_CONTROL_HINT_COPY_TOUCH = 'Drag anywhere to move. Reach the star.';
export const LEGACY_CONTROL_HINT_COPY_KEYS = 'Arrow keys or WASD to move. Reach the star.';

/** Auto-fade if the player never moves, so the line cannot linger. The hint is then considered seen. */
export const LEGACY_CONTROL_HINT_MAX_VISIBLE_MS = 12000;
export const LEGACY_CONTROL_HINT_FADE_MS = 400;
/** A touch/mouse drag shorter than this is a tap, not a move. */
export const LEGACY_CONTROL_HINT_DRAG_THRESHOLD_PX = 8;

export const resolveLegacyControlHintCopy = (coarsePointer: boolean): string => (
  coarsePointer ? LEGACY_CONTROL_HINT_COPY_TOUCH : LEGACY_CONTROL_HINT_COPY_KEYS
);

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
