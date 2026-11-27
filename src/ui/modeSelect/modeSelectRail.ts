import { createMazerButton } from '../dom/MazerButton';
import {
  INITIAL_MODE_SELECT_WHEEL_STATE,
  MODE_SELECT_DRAG_THRESHOLD_PX,
  clampModeSelectIndex,
  isModeSelectHeldActivationKey,
  reduceModeSelectWheel,
  resolveModeSelectRailDepth,
  resolveModeSelectRailEdgePad,
  resolveModeSelectRailKeyAction,
  resolveModeSelectRailNearestIndex,
  resolveModeSelectRailScrollFor,
  resolveModeSelectPressAgeMs,
  type ModeSelectWheelState
} from './modeSelectRailMath';

/**
 * The game-mode selector, look D "Depth and parallax" (owner pick 2026-11-25 from game-mode-options.html). Real DOM on
 * the shipping tokens, fonts and kit button; the maze pictures are Chip tiles as DOM boxes. No container: the cards
 * float over the dimmed menu canvas, neighbours peek in from both edges and turn on a perspective as they pass, the
 * star field behind moves slower than the rail.
 *
 * Input: native touch scroll with snap (touch swipe), mouse drag, vertical wheel (one mode per notch), arrow keys /
 * Home / End, a tap on a neighbour centres it, a tap on the centred playable card plays it. Every listener is removed
 * on destroy() (one AbortController) and the ResizeObserver is disconnected.
 *
 * Structural item type, so this module stays free of game-runtime imports (legacyModeSelectPlan.ts items fit it).
 */
export interface ModeSelectRailItem {
  readonly id: string;
  readonly label: string;
  readonly playable: boolean;
  readonly tagline: string;
  readonly stats: readonly { readonly label: string; readonly value: string }[];
  readonly art: readonly string[];
}

export interface ModeSelectRailOptions {
  readonly items: readonly ModeSelectRailItem[];
  readonly initialIndex: number;
  readonly title: string;
  readonly backLabel: string;
  readonly comingSoonLabel: string;
  readonly resolvePlay: (item: ModeSelectRailItem | undefined) => { readonly label: string; readonly disabled: boolean };
  /** Parallax and the perspective turn off, scrolling jumps instead of gliding. */
  readonly reducedMotion: boolean;
  /**
   * The centred playable mode should start (Play, Enter, or a tap on the centred card). `pressAgeMs`: how long before
   * this call the press began (0 for keys), so the caller's open guard can be measured from the press.
   */
  readonly onPlay: (index: number, pressAgeMs: number) => void;
  /** Back to menu (the button or Escape); `pressAgeMs` as for onPlay. */
  readonly onBack: (pressAgeMs: number) => void;
  /** The centred entry changed. */
  readonly onSelect?: (index: number) => void;
  /** After every measure: the rail's scroll position in css px (drives the far layer's parallax). */
  readonly onScroll?: (scrollLeft: number) => void;
  readonly doc?: Document;
  readonly now?: () => number;
}

export interface ModeSelectRailHandle {
  /** The whole selector surface (kicker, rail, tagline, chips, Play, Back), ready to place in a layer. */
  readonly root: HTMLElement;
  readonly rail: HTMLElement;
  readonly play: HTMLButtonElement;
  readonly back: HTMLButtonElement;
  /** Index of the centred entry. */
  index: () => number;
  /** Centres an entry (smooth unless reduced motion or `instant`). */
  select: (index: number, instant?: boolean) => void;
  /** Applies a key as the selector would (the layer calls this for keys anywhere inside it). True when handled. */
  handleKey: (event: KeyboardEvent) => boolean;
  /** A vertical wheel anywhere on the selector steps one mode per notch (the layer forwards it). */
  handleWheel: (event: WheelEvent) => void;
  /** Reduced motion changed while the selector is up: scrolling jumps instead of gliding from now on. */
  setReducedMotion: (reducedMotion: boolean) => void;
  /** Re-reads sizes and re-centres the current entry (layout changed). */
  remeasure: () => void;
  destroy: () => void;
}

const TILE_KIND: Readonly<Record<string, string>> = {
  '#': 'wall', S: 'start', E: 'end', t: 'trail', g: 'gate', x: 'hazard', '.': 'path'
};

const make = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] => {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The maze picture: a CSS grid of Chip tiles (corridor fill, lit rim), never an image, SVG or canvas. */
export const createModeSelectArt = (doc: Document, rows: readonly string[]): HTMLElement => {
  const art = make(doc, 'span', 'mms-art');
  art.style.setProperty('--mms-cols', String(rows[0]?.length ?? 1));
  art.setAttribute('aria-hidden', 'true');
  for (const row of rows) {
    for (const cell of row) art.append(make(doc, 'i', `mms-tile mms-tile--${TILE_KIND[cell] ?? 'path'}`));
  }
  return art;
};

export const createModeSelectRail = (options: ModeSelectRailOptions): ModeSelectRailHandle => {
  const doc = options.doc ?? document;
  const win = doc.defaultView ?? window;
  const now = options.now ?? (() => win.performance.now());
  const { items: modes } = options;
  let reducedMotion = options.reducedMotion;
  const controller = new AbortController();
  const { signal } = controller;

  const root = make(doc, 'div', 'mms-stack');
  const kicker = make(doc, 'p', 'mms-kicker mazer-sheet-title', options.title);
  kicker.id = 'mms-title';
  const rail = make(doc, 'div', 'mms-rail');
  rail.tabIndex = 0;
  rail.setAttribute('role', 'listbox');
  rail.setAttribute('aria-labelledby', 'mms-title');
  rail.setAttribute('aria-orientation', 'horizontal');
  const track = make(doc, 'div', 'mms-track');
  const tagline = make(doc, 'p', 'mms-tagline');
  tagline.setAttribute('aria-live', 'polite');
  const chips = make(doc, 'div', 'mms-chips');
  const actions = make(doc, 'div', 'mms-actions');
  const play = createMazerButton({ className: 'mms-play', label: options.resolvePlay(modes[0]).label, tone: 'primary' }, doc);
  play.dataset.modeSelectPlay = 'true';
  const back = createMazerButton({ className: 'mms-back', label: options.backLabel, tone: 'secondary' }, doc);
  back.dataset.modeSelectBack = 'true';

  const items = modes.map((mode, index) => {
    const item = make(doc, 'button', `mms-item${mode.playable ? '' : ' is-locked'}`);
    item.type = 'button';
    item.tabIndex = -1;
    item.id = `mms-item-${mode.id}`;
    item.dataset.index = String(index);
    item.dataset.modeId = mode.id;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.setAttribute('aria-disabled', String(!mode.playable));
    item.append(createModeSelectArt(doc, mode.art), make(doc, 'span', 'mms-name', mode.label));
    if (!mode.playable) item.append(make(doc, 'span', 'mms-sub', options.comingSoonLabel));
    return item;
  });
  track.append(...items);
  rail.append(track);
  actions.append(play, back);
  root.append(kicker, rail, tagline, chips, actions);

  let current = -1;
  let destroyed = false;

  const apply = (index: number): void => {
    if (index === current || modes.length === 0) return;
    current = index;
    const mode = modes[index]!;
    items.forEach((item, i) => {
      item.setAttribute('aria-selected', String(i === index));
      item.classList.toggle('is-active', i === index);
    });
    tagline.textContent = mode.tagline;
    chips.replaceChildren(...mode.stats.map((stat) => make(doc, 'span', 'mms-chip', `${stat.label} ${stat.value}`)));
    const action = options.resolvePlay(mode);
    play.textContent = action.label;
    play.disabled = action.disabled;
    rail.setAttribute('aria-activedescendant', items[index]!.id);
    options.onSelect?.(index);
  };

  const boxes = () => items.map((item) => ({ left: item.offsetLeft, width: item.offsetWidth }));

  const measure = (): void => {
    if (destroyed || items.length === 0) return;
    const railWidth = rail.clientWidth;
    const first = items[0]!;
    const margin = Number.parseFloat(win.getComputedStyle(first).marginLeft) || 0;
    track.style.setProperty('--mms-pad', `${resolveModeSelectRailEdgePad(railWidth, first.offsetWidth, margin)}px`);
    const scrollLeft = rail.scrollLeft;
    items.forEach((item) => {
      const depth = resolveModeSelectRailDepth({ left: item.offsetLeft, width: item.offsetWidth }, scrollLeft, railWidth);
      item.style.setProperty('--d', depth.toFixed(3));
      item.style.setProperty('--ad', Math.min(2, Math.abs(depth)).toFixed(3));
    });
    options.onScroll?.(scrollLeft);
    apply(resolveModeSelectRailNearestIndex(boxes(), scrollLeft, railWidth));
  };

  const scrollToIndex = (index: number, instant = false): void => {
    if (items.length === 0) return;
    const item = items[clampModeSelectIndex(index, items.length)]!;
    const left = resolveModeSelectRailScrollFor({ left: item.offsetLeft, width: item.offsetWidth }, rail.clientWidth);
    rail.scrollTo({ behavior: instant || reducedMotion ? 'auto' : 'smooth', left });
  };

  let frame = 0;
  rail.addEventListener('scroll', () => {
    if (frame !== 0) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
  }, { passive: true, signal });

  // Mouse drag (touch and pen scroll natively). Past the threshold it scrolls the rail and cancels the click after it.
  let drag: { x: number; left: number; moved: boolean } | null = null;
  rail.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { left: rail.scrollLeft, moved: false, x: event.clientX };
  }, { signal });
  win.addEventListener('pointermove', (event) => {
    if (drag === null) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > MODE_SELECT_DRAG_THRESHOLD_PX) {
      drag.moved = true;
      rail.classList.add('is-dragging');
    }
    if (drag.moved) rail.scrollLeft = drag.left - dx;
  }, { signal });
  const endDrag = (): void => {
    if (drag === null) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      // is-dragging stays on through the click that follows the release; then snap comes back and the rail settles.
      win.setTimeout(() => {
        if (destroyed) return;
        rail.classList.remove('is-dragging');
        measure();
        scrollToIndex(current);
      }, 0);
    }
  };
  win.addEventListener('pointerup', endDrag, { signal });
  win.addEventListener('pointercancel', endDrag, { signal });
  rail.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
  // The cards are not focus stops (tabIndex -1): a click on one must leave focus on the rail, which owns the arrow keys
  // and draws the focus ring on the centred card only.
  rail.addEventListener('mousedown', (event) => {
    if ((event.target as Element | null)?.closest?.('.mms-item')) event.preventDefault();
  }, { signal });

  // When the press behind the next click began (pointerdown anywhere on the selector, captured before the drag code).
  let pressStartedAt: number | null = null;
  root.addEventListener('pointerdown', () => { pressStartedAt = now(); }, { capture: true, signal });
  root.addEventListener('pointercancel', () => { pressStartedAt = null; }, { capture: true, signal });
  // A keyboard-made click has detail 0; a pointer click counts its press from the pointerdown.
  const pressAge = (event: MouseEvent): number => {
    const age = resolveModeSelectPressAgeMs(now(), pressStartedAt, event.detail > 0);
    pressStartedAt = null;
    return age;
  };

  rail.addEventListener('click', (event) => {
    if (rail.classList.contains('is-dragging')) return;
    const hit = (event.target as Element | null)?.closest?.('.mms-item') as HTMLElement | null | undefined;
    if (hit === null || hit === undefined) return;
    const index = Number(hit.dataset.index);
    if (doc.activeElement !== rail) rail.focus({ preventScroll: true });
    if (index !== current) {
      scrollToIndex(index);
      return;
    }
    // The centred card: a playable mode plays, a locked one stays put (its card and the Play button say Coming soon).
    if (modes[index]?.playable === true) options.onPlay(index, pressAge(event));
  }, { signal });

  play.addEventListener('click', (event) => {
    if (current >= 0 && modes[current]?.playable === true) options.onPlay(current, pressAge(event));
  }, { signal });
  back.addEventListener('click', (event) => options.onBack(pressAge(event)), { signal });

  let wheel: ModeSelectWheelState = INITIAL_MODE_SELECT_WHEEL_STATE;
  const onWheel = (event: WheelEvent): void => {
    // A horizontal trackpad swipe scrolls the rail natively and snaps.
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    const deltaY = event.deltaMode === 1 ? event.deltaY * 16 : (event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY);
    const next = reduceModeSelectWheel(wheel, deltaY, now());
    wheel = next.state;
    if (next.step !== 0) scrollToIndex(clampModeSelectIndex(current + next.step, items.length));
  };

  const handleKey = (event: KeyboardEvent): boolean => {
    const target = event.target as Element | null;
    // A held Enter / Space never activates anything (also blocks a focused button's native repeat click).
    if (isModeSelectHeldActivationKey(event.key, event.repeat)) {
      event.preventDefault();
      return false;
    }
    // Enter / Space on Play or Back keep their native button meaning.
    if ((event.key === 'Enter' || event.key === ' ') && (target === play || target === back)) return false;
    const action = resolveModeSelectRailKeyAction(event.key, current, items.length);
    switch (action.kind) {
      case 'move':
        event.preventDefault();
        scrollToIndex(action.to);
        return true;
      case 'play':
        event.preventDefault();
        if (current >= 0 && modes[current]?.playable === true) options.onPlay(current, 0);
        return true;
      case 'back':
        event.preventDefault();
        options.onBack(0);
        return true;
      default:
        return false;
    }
  };

  const remeasure = (): void => {
    if (destroyed) return;
    const keep = current < 0 ? clampModeSelectIndex(options.initialIndex, items.length) : current;
    measure();
    scrollToIndex(keep, true);
    measure();
  };

  let resizeObserver: ResizeObserver | null = null;
  if (typeof win.ResizeObserver === 'function') {
    let lastWidth = -1;
    resizeObserver = new win.ResizeObserver(() => {
      if (rail.clientWidth === lastWidth) return;
      lastWidth = rail.clientWidth;
      remeasure();
    });
    resizeObserver.observe(rail);
  }

  return {
    back,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      controller.abort();
      resizeObserver?.disconnect();
      if (frame !== 0) win.cancelAnimationFrame(frame);
    },
    handleKey,
    index: () => current,
    play,
    rail,
    remeasure,
    root,
    setReducedMotion: (value) => {
      reducedMotion = value;
    },
    handleWheel: onWheel,
    select: (index, instant = false) => scrollToIndex(index, instant)
  };
};
