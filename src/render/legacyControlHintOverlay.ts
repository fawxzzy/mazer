/**
 * MAZER-FLOW-001 presenter: a small, non-interactive DOM line over the bottom of the canvas. It never takes
 * pointer events or focus (pointer-events: none), so it cannot block input. It reads the scene through a narrow
 * structural view, so MenuScene.ts is untouched.
 *
 * Skin: the neon edge text skin (pick B, 2026-11-27; src/ui/skin/neonTextSkin.ts) with the player's registry icon
 * (drawn by the board's own player painter) in a small ring well, in the player's colour. Placement: the text card rule
 * (src/render/textCardPlacement.ts) with the bottom band first. The line stays on its bottom anchor while that covers
 * nothing; on level 1 the end star sits at the foot of the corridor, right where the anchor is, so the line steps up
 * above it (re-checked every poll while visible, so the board reveal and zoom are followed).
 *
 * First-time cards slice 9 (`?lab=firsttime` only): the hint is a card instead (legacyControlHintCard.ts: the in-flow
 * notice, "Move", the twin-stars goal line, "Got it"), dismissed the same ways (Got it, the first move, 12 s), and its
 * dismissal offers the "Reach these" goal coach (legacyFirstTimeHintSignal.ts). Flag off nothing here changes.
 */
import { createTutorialAckStore, type TutorialAckStore, type TutorialStorage } from '../tutorial/tutorialAckStore.ts';
import {
  LEGACY_CONTROL_HINT_DEVICE_ID,
  LEGACY_CONTROL_HINT_MAX_VISIBLE_MS,
  LEGACY_CONTROL_HINT_TOKEN,
  isLegacyControlHintDrag,
  isLegacyControlHintMoveKey,
  resolveLegacyControlHintCopy,
  resolveLegacyControlHintFadeMs,
  resolveLegacyControlHintInput,
  classifyLegacyControlHintPointer,
  type LegacyControlHintDeviceFacts,
  type LegacyControlHintObservedInput,
  shouldShowLegacyControlHint,
  type LegacyControlHintFacts
} from '../legacy-runtime/legacyControlHint.ts';
import { resolveFirstTimeCardsEnabled } from '../legacy-runtime/legacyFirstTimeFlag.ts';
import { emitLegacyFirstTimeControlHintDismissed } from '../legacy-runtime/legacyFirstTimeHintSignal.ts';
import { createLegacyLevelPreviewStorage, isLegacyLevelPreviewRoute } from '../legacy-runtime/legacyLevelPreview.ts';
import { isInsideFeedbackPopup } from '../ui/feedback/feedbackKeyIsolation.ts';
import { NEON_TEXT_SKIN, neonRgba, resolveNeonPanelStyle } from '../ui/skin/neonTextSkin.ts';
import { createLegacyControlHintCard, type LegacyControlHintCard } from './legacyControlHintCard.ts';
import { paintMechanicIconCanvas, resolveMechanicIconAccentCss } from './mechanicIcons.ts';
import {
  resolveTextCardBoardView,
  resolveTextCardPlacement,
  type TextCardBoardScene,
  type TextCardBoardView,
  type TextCardPlacement
} from './textCardPlacement.ts';

export const LEGACY_CONTROL_HINT_ELEMENT_ID = 'mazer-control-hint';
const POLL_MS = 250;
/** The hint's icon well and the registry icon inside it (CSS px): a pill-size version of the card's well. */
export const LEGACY_CONTROL_HINT_WELL_PX = 32;
export const LEGACY_CONTROL_HINT_ICON_PX = 24;
/** The line's bottom anchor (over the home indicator) and its gap under the HUD when it has to sit at the top. */
export const LEGACY_CONTROL_HINT_BOTTOM_ANCHOR = 'calc(env(safe-area-inset-bottom, 0px) + 8px)';
export const LEGACY_CONTROL_HINT_HUD_GAP_PX = 8;

/**
 * Pure: where the line goes. `box` is its page box, `anchorInset` the gap under it on the bottom anchor (it carries the
 * safe area). Bottom band first, then up the screen, then just under the HUD.
 */
export const resolveLegacyControlHintPlacement = (
  view: TextCardBoardView,
  box: { readonly width: number; readonly height: number },
  anchorInset: number,
  page: { readonly width: number; readonly height: number }
): TextCardPlacement => resolveTextCardPlacement({
  viewWidth: page.width,
  viewHeight: page.height,
  topMin: view.hudBottom + LEGACY_CONTROL_HINT_HUD_GAP_PX,
  bottomInset: anchorInset,
  cardWidth: box.width,
  cardHeight: box.height,
  keepClear: view.keepClear,
  prefer: 'bottom'
});

/** The hint's inline style: the neon panel in the player's colour, as a pill. */
export const resolveLegacyControlHintStyle = (): Record<string, string> => {
  const accent = resolveMechanicIconAccentCss('player');
  return {
    ...resolveNeonPanelStyle(accent, { radiusPx: 999 }),
    position: 'fixed', left: '50%', transform: 'translateX(-50%)',
    bottom: LEGACY_CONTROL_HINT_BOTTOM_ANCHOR,
    display: 'flex', alignItems: 'center', gap: '10px',
    width: 'max-content', maxWidth: 'calc(100vw - 32px)', padding: '6px 16px 6px 6px', whiteSpace: 'pre-line',
    font: `${NEON_TEXT_SKIN.body.weight} ${NEON_TEXT_SKIN.body.sizePx}px/1.3 var(--mazer-token-font-ui)`, textAlign: 'left',
    pointerEvents: 'none', userSelect: 'none', zIndex: '5', opacity: '0'
  };
};

/** The icon well's inline style (ring + glow in the accent over a faint wash). */
export const resolveLegacyControlHintWellStyle = (): Record<string, string> => {
  const accent = resolveMechanicIconAccentCss('player');
  const g = NEON_TEXT_SKIN.glyph;
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
    width: `${LEGACY_CONTROL_HINT_WELL_PX}px`, height: `${LEGACY_CONTROL_HINT_WELL_PX}px`, borderRadius: '50%',
    background: neonRgba(accent, g.washAlpha),
    boxShadow: `0 0 0 ${g.ringPx}px ${accent}, 0 0 ${g.glowPx}px ${neonRgba(accent, g.glowAlpha)}`
  };
};

interface SceneView {
  mode?: string;
  overlay?: string;
  progressionState?: { tracks?: { player?: { level?: unknown } } };
  prefersLegacyReducedMotion?: () => boolean;
}

export interface LegacyControlHintHost {
  readonly scene: { getScene(key: string): unknown };
  /** The game canvas (Phaser.Game#canvas); the line reads the board through its box. */
  readonly canvas?: { getBoundingClientRect(): { left: number; top: number; width: number } } | null;
}

const readFacts = (scene: SceneView | null, acknowledged: boolean): LegacyControlHintFacts => {
  const level = Number(scene?.progressionState?.tracks?.player?.level);
  return {
    mode: scene?.mode ?? '',
    overlay: scene?.overlay ?? '',
    level: Number.isFinite(level) ? level : null,
    acknowledged
  };
};

const safeStorage = (win: Window): TutorialStorage | null => {
  try {
    // Level Preview (`?previewLevel=N`) is a no-write sandbox: the hint still shows, but its "seen" mark lives in
    // memory for this page only and never reaches the device key (spec F15 / slice 0).
    if (isLegacyLevelPreviewRoute(win.location?.search)) return createLegacyLevelPreviewStorage();
    return win.localStorage;
  } catch {
    return null;
  }
};

/**
 * First-time cards on (`?lab=firsttime`, remembered on the device)? Read once per install; any failure = off. On a Level
 * Preview route only the query counts: the hint never touches device storage there (spec F15, slice 0).
 */
const readFirstTimeCardsOn = (win: Window): boolean => {
  try {
    const search = win.location?.search ?? '';
    return resolveFirstTimeCardsEnabled({ search, storage: isLegacyLevelPreviewRoute(search) ? null : win.localStorage });
  } catch {
    return false;
  }
};

export const installLegacyControlHint = (win: Window, game: LegacyControlHintHost): (() => void) => {
  const storage = safeStorage(win);
  // No storage means we cannot honour "one time", so show nothing rather than nag every load.
  if (storage === null) {
    return () => undefined;
  }
  const store: TutorialAckStore = createTutorialAckStore({ storage, accountId: LEGACY_CONTROL_HINT_DEVICE_ID });
  const doc = win.document;
  let el: HTMLDivElement | null = null;
  let textEl: HTMLElement | null = null;
  let shownAt = 0;
  let dragStart: { x: number; y: number } | null = null;
  let done = store.isAcknowledged(LEGACY_CONTROL_HINT_TOKEN);
  let lastInput: LegacyControlHintObservedInput | null = null;
  let anchorInset: number | null = null;
  let placedTop: number | null = null;
  // Slice 9: the card replaces the pill only while the first-time cards flag is on.
  const card: LegacyControlHintCard | null = readFirstTimeCardsOn(win) ? createLegacyControlHintCard({ onAction: () => hide(true) }) : null;
  const showing = (): boolean => el !== null || card?.isOpen() === true;

  const media = (query: string): boolean => {
    try { return win.matchMedia?.(query).matches === true; } catch { return false; }
  };
  const readDevice = (): LegacyControlHintDeviceFacts => {
    const nav = win.navigator as Navigator & { standalone?: boolean };
    return {
      coarsePointer: media('(pointer: coarse)'),
      finePointer: media('(pointer: fine)'),
      hoverCapable: media('(hover: hover)'),
      maxTouchPoints: nav.maxTouchPoints,
      standalone: media('(display-mode: standalone)') || nav.standalone === true,
      userAgent: nav.userAgent,
      lastInput
    };
  };
  const currentCopy = (): string => resolveLegacyControlHintCopy(resolveLegacyControlHintInput(readDevice()));
  /** Instant text swap (never animated, so Reduce Motion needs no special case); only while the line is visible. */
  const refreshCopy = (): void => {
    if (textEl === null) return;
    const copy = currentCopy();
    if (textEl.textContent !== copy) textEl.textContent = copy;
  };
  const noteInput = (kind: LegacyControlHintObservedInput | null): void => {
    if (kind === null || kind === lastInput) return;
    lastInput = kind;
    refreshCopy();
  };


  const scene = (): SceneView | null => (game.scene.getScene('MenuScene') as SceneView | null) ?? null;
  const reduced = (): boolean => {
    try {
      if (scene()?.prefersLegacyReducedMotion?.() === true) return true;
    } catch { /* fall through to the device preference */ }
    return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  };

  /** Keeps the line off the player, the end star, Switches and wrap mouths (the text card rule, bottom first). */
  const place = (node: HTMLDivElement): void => {
    // The game's own canvas (never the first canvas in the page: the hint's icon well holds one too).
    const canvas = game.canvas;
    if (typeof node.getBoundingClientRect !== 'function' || typeof canvas?.getBoundingClientRect !== 'function') return;
    const view = resolveTextCardBoardView(scene() as TextCardBoardScene | null, canvas.getBoundingClientRect());
    if (view === null) return;
    const box = node.getBoundingClientRect();
    if (anchorInset === null) {
      if (placedTop !== null) return;
      anchorInset = win.innerHeight - box.bottom;
    }
    const placement = resolveLegacyControlHintPlacement(view, box, anchorInset, { width: win.innerWidth, height: win.innerHeight });
    const top = placement.edge === 'bottom' ? null : placement.topPx;
    if (top === placedTop) return;
    placedTop = top;
    node.style.top = top === null ? '' : `${top}px`;
    node.style.bottom = top === null ? LEGACY_CONTROL_HINT_BOTTOM_ANCHOR : 'auto';
  };

  const hide = (acknowledge: boolean): void => {
    if (acknowledge && !done) {
      done = true;
      try { store.acknowledge(LEGACY_CONTROL_HINT_TOKEN); } catch { /* storage full: the in-memory flag still holds */ }
      if (card !== null) emitLegacyFirstTimeControlHintDismissed(scene());
    }
    if (card !== null) {
      card.close();
      return;
    }
    const node = el;
    if (node === null) return;
    el = null;
    textEl = null;
    anchorInset = null;
    placedTop = null;
    const fade = resolveLegacyControlHintFadeMs(reduced());
    node.style.transition = fade > 0 ? `opacity ${fade}ms linear` : 'none';
    node.style.opacity = '0';
    win.setTimeout(() => node.remove(), fade);
  };

  /** Slice 9: the card waits for a board to keep clear of (and for it to stop moving), then mounts once. */
  const showCard = (hintCard: LegacyControlHintCard): void => {
    const canvas = game.canvas;
    if (typeof canvas?.getBoundingClientRect !== 'function') return;
    const view = resolveTextCardBoardView(scene() as TextCardBoardScene | null, canvas.getBoundingClientRect());
    if (view === null) return;
    const page = { width: win.innerWidth, height: win.innerHeight };
    if (hintCard.offer(view, resolveLegacyControlHintInput(readDevice()), page, reduced())) shownAt = win.performance.now();
  };

  const show = (): void => {
    if (card !== null) {
      showCard(card);
      return;
    }
    const node = doc.createElement('div');
    node.id = LEGACY_CONTROL_HINT_ELEMENT_ID;
    node.setAttribute('aria-hidden', 'true');
    Object.assign(node.style, resolveLegacyControlHintStyle());
    const well = doc.createElement('span');
    Object.assign(well.style, resolveLegacyControlHintWellStyle());
    const canvas = doc.createElement('canvas');
    if (paintMechanicIconCanvas(canvas as never, 'player', LEGACY_CONTROL_HINT_ICON_PX, win.devicePixelRatio ?? 1)) well.append(canvas);
    const text = doc.createElement('span');
    text.textContent = currentCopy();
    node.append(well, text);
    doc.body.append(node);
    el = node;
    textEl = text;
    place(node);
    shownAt = win.performance.now();
    const fade = resolveLegacyControlHintFadeMs(reduced());
    node.style.transition = fade > 0 ? `opacity ${fade}ms linear` : 'none';
    win.requestAnimationFrame(() => { node.style.opacity = '1'; });
  };

  const onKey = (event: KeyboardEvent): void => {
    // Capture phase runs before the feedback scrim can stop the event: a key typed into the note is not game input.
    if (isInsideFeedbackPopup(event.target)) return;
    if (event.isTrusted && event.key.length > 0 && event.key !== 'Unidentified') noteInput('keys');
    if (showing() && isLegacyControlHintMoveKey(event.key)) hide(true);
  };
  const onDown = (event: PointerEvent): void => {
    noteInput(classifyLegacyControlHintPointer(event.pointerType));
    dragStart = { x: event.clientX, y: event.clientY };
  };
  const onMove = (event: PointerEvent): void => {
    if (!showing() || dragStart === null) return;
    if (isLegacyControlHintDrag(event.clientX - dragStart.x, event.clientY - dragStart.y)) hide(true);
  };
  const onUp = (): void => { dragStart = null; };

  win.addEventListener('keydown', onKey, { capture: true, passive: true });
  win.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  win.addEventListener('pointermove', onMove, { capture: true, passive: true });
  win.addEventListener('pointerup', onUp, { capture: true, passive: true });
  win.addEventListener('pointercancel', onUp, { capture: true, passive: true });

  const timer = win.setInterval(() => {
    const wanted = shouldShowLegacyControlHint(readFacts(scene(), done));
    if (wanted && !showing()) {
      show();
    } else if (showing() && !wanted) {
      hide(false);
    } else if (showing() && win.performance.now() - shownAt >= LEGACY_CONTROL_HINT_MAX_VISIBLE_MS) {
      hide(true);
    } else if (el !== null) {
      place(el);
    }
  }, POLL_MS);

  return () => {
    win.clearInterval(timer);
    win.removeEventListener('keydown', onKey, { capture: true });
    win.removeEventListener('pointerdown', onDown, { capture: true });
    win.removeEventListener('pointermove', onMove, { capture: true });
    win.removeEventListener('pointerup', onUp, { capture: true });
    win.removeEventListener('pointercancel', onUp, { capture: true });
    el?.remove();
    el = null;
    textEl = null;
    card?.destroy();
  };
};
