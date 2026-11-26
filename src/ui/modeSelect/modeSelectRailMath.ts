/**
 * Pure geometry and input rules for the mode-select rail (look D, src/ui/modeSelect/modeSelectRail.ts). No DOM: the
 * rail reads element boxes and hands plain numbers in, so every rule here is unit tested
 * (tests/reset/legacy-mode-select-rail-math.test.ts).
 */

export interface ModeSelectRailItemBox {
  /** Left edge of the item inside the scrolled track, css px. */
  readonly left: number;
  readonly width: number;
}

/**
 * Signed distance of an item's centre from the rail's centre, in item widths: 0 = centred, -1 = one item to the left,
 * +1 = one item to the right. Drives the perspective turn (--d) and the fade/depth (--ad, the absolute value capped at 2).
 */
export const resolveModeSelectRailDepth = (box: ModeSelectRailItemBox, scrollLeft: number, railWidth: number): number => {
  const width = box.width > 0 ? box.width : 1;
  return (box.left + (width / 2) - (scrollLeft + (railWidth / 2))) / width;
};

/** Index of the item whose centre is nearest the rail centre (ties go to the lower index). 0 for an empty list. */
export const resolveModeSelectRailNearestIndex = (
  boxes: readonly ModeSelectRailItemBox[],
  scrollLeft: number,
  railWidth: number
): number => {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  boxes.forEach((box, index) => {
    const distance = Math.abs(box.left + (box.width / 2) - (scrollLeft + (railWidth / 2)));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
};

/** scrollLeft that puts `box` dead centre in a rail `railWidth` wide (never negative). */
export const resolveModeSelectRailScrollFor = (box: ModeSelectRailItemBox, railWidth: number): number => (
  Math.max(0, box.left + (box.width / 2) - (railWidth / 2))
);

/**
 * Edge room on each side of the track so the first and last item can centre: half the free width beside one item,
 * minus that item's own side margin. Whole css px (WebKit sized a cqw-padded max-content track short, see the
 * 2026-11-25 options-page note).
 */
export const resolveModeSelectRailEdgePad = (railWidth: number, itemWidth: number, itemMargin: number): number => (
  Math.max(0, Math.round(((railWidth - itemWidth) / 2) - itemMargin))
);

export const clampModeSelectIndex = (index: number, count: number): number => (
  count <= 0 ? 0 : Math.min(count - 1, Math.max(0, Math.round(index)))
);

export type ModeSelectRailKeyAction =
  | { readonly kind: 'move'; readonly to: number }
  | { readonly kind: 'play' }
  | { readonly kind: 'back' }
  | { readonly kind: 'none' };

/**
 * What a key does on the selector, wherever focus sits inside it: arrows step one mode, Home/End jump to the ends,
 * Enter plays the centred mode (the layer starts it only when it is playable), Escape is the standard back action.
 * Space is left to the focused button (native activation), so it is not mapped here.
 */
export const resolveModeSelectRailKeyAction = (key: string, current: number, count: number): ModeSelectRailKeyAction => {
  switch (key) {
    case 'ArrowRight':
      return { kind: 'move', to: clampModeSelectIndex(current + 1, count) };
    case 'ArrowLeft':
      return { kind: 'move', to: clampModeSelectIndex(current - 1, count) };
    case 'Home':
      return { kind: 'move', to: 0 };
    case 'End':
      return { kind: 'move', to: clampModeSelectIndex(count - 1, count) };
    case 'Enter':
      return { kind: 'play' };
    case 'Escape':
      return { kind: 'back' };
    default:
      return { kind: 'none' };
  }
};

/**
 * Enter / Space held down: the OS auto-repeat is ignored (not even a focused button's native activation), so a held
 * key cannot start a mode the player never chose. The old canvas selector ignored repeats the same way.
 */
export const isModeSelectHeldActivationKey = (key: string, repeat: boolean): boolean => (
  repeat && (key === 'Enter' || key === ' ')
);

/**
 * How long before a click its press began, in ms. A DOM click lands on release (touchend), but the selector's open
 * guard has to be measured from the press, as the old canvas pointerdown path was, so a slow double-tap on the menu's
 * Play is still caught. Keyboard clicks (`fromPointer` false) and clicks with no recorded press count as age 0.
 */
export const resolveModeSelectPressAgeMs = (clickAtMs: number, pressStartedAtMs: number | null, fromPointer: boolean): number => (
  !fromPointer || pressStartedAtMs === null ? 0 : Math.max(0, clickAtMs - pressStartedAtMs)
);

/** A vertical mouse wheel steps one mode per notch: the accumulated delta must pass this many css px. */
export const MODE_SELECT_WHEEL_STEP_PX = 40;
/** After a wheel step, further wheel input is ignored this long (trackpad inertia would otherwise skip every mode). */
export const MODE_SELECT_WHEEL_COOLDOWN_MS = 260;

export interface ModeSelectWheelState {
  readonly accumulated: number;
  readonly lockedUntilMs: number;
}

export const INITIAL_MODE_SELECT_WHEEL_STATE: ModeSelectWheelState = Object.freeze({ accumulated: 0, lockedUntilMs: 0 });

/**
 * Folds one wheel event into the state. Returns the step to take (-1, 0 or +1) and the next state. Only the dominant
 * vertical axis is handled here; a horizontal trackpad swipe scrolls the rail natively (and snaps).
 */
export const reduceModeSelectWheel = (
  state: ModeSelectWheelState,
  deltaY: number,
  nowMs: number
): { readonly step: -1 | 0 | 1; readonly state: ModeSelectWheelState } => {
  if (nowMs < state.lockedUntilMs) {
    return { state: { accumulated: 0, lockedUntilMs: state.lockedUntilMs }, step: 0 };
  }
  const accumulated = state.accumulated + deltaY;
  if (Math.abs(accumulated) < MODE_SELECT_WHEEL_STEP_PX) {
    return { state: { accumulated, lockedUntilMs: state.lockedUntilMs }, step: 0 };
  }
  return {
    state: { accumulated: 0, lockedUntilMs: nowMs + MODE_SELECT_WHEEL_COOLDOWN_MS },
    step: accumulated > 0 ? 1 : -1
  };
};

/** A mouse press that travels further than this is a drag (it scrolls the rail and cancels the click). */
export const MODE_SELECT_DRAG_THRESHOLD_PX = 4;
