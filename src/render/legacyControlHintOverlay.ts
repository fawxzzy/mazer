/**
 * MAZER-FLOW-001 presenter: a small, non-interactive DOM line over the bottom of the canvas. It never takes
 * pointer events or focus (pointer-events: none), so it cannot block input. It reads the scene through a narrow
 * structural view, so MenuScene.ts is untouched.
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
import { createLegacyLevelPreviewStorage, isLegacyLevelPreviewRoute } from '../legacy-runtime/legacyLevelPreview.ts';
import { isInsideFeedbackPopup } from '../ui/feedback/feedbackKeyIsolation.ts';

export const LEGACY_CONTROL_HINT_ELEMENT_ID = 'mazer-control-hint';
const POLL_MS = 250;

interface SceneView {
  mode?: string;
  overlay?: string;
  progressionState?: { tracks?: { player?: { level?: unknown } } };
  prefersLegacyReducedMotion?: () => boolean;
}

export interface LegacyControlHintHost {
  readonly scene: { getScene(key: string): unknown };
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

export const installLegacyControlHint = (win: Window, game: LegacyControlHintHost): (() => void) => {
  const storage = safeStorage(win);
  // No storage means we cannot honour "one time", so show nothing rather than nag every load.
  if (storage === null) {
    return () => undefined;
  }
  const store: TutorialAckStore = createTutorialAckStore({ storage, accountId: LEGACY_CONTROL_HINT_DEVICE_ID });
  const doc = win.document;
  let el: HTMLDivElement | null = null;
  let shownAt = 0;
  let dragStart: { x: number; y: number } | null = null;
  let done = store.isAcknowledged(LEGACY_CONTROL_HINT_TOKEN);
  let lastInput: LegacyControlHintObservedInput | null = null;

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
    if (el === null) return;
    const copy = currentCopy();
    if (el.textContent !== copy) el.textContent = copy;
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

  const hide = (acknowledge: boolean): void => {
    if (acknowledge && !done) {
      done = true;
      try { store.acknowledge(LEGACY_CONTROL_HINT_TOKEN); } catch { /* storage full: the in-memory flag still holds */ }
    }
    const node = el;
    if (node === null) return;
    el = null;
    const fade = resolveLegacyControlHintFadeMs(reduced());
    node.style.transition = fade > 0 ? `opacity ${fade}ms linear` : 'none';
    node.style.opacity = '0';
    win.setTimeout(() => node.remove(), fade);
  };

  const show = (): void => {
    const node = doc.createElement('div');
    node.id = LEGACY_CONTROL_HINT_ELEMENT_ID;
    node.textContent = currentCopy();
    node.setAttribute('aria-hidden', 'true');
    Object.assign(node.style, {
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
      width: 'max-content', maxWidth: 'calc(100vw - 32px)', padding: '6px 14px', whiteSpace: 'pre-line', borderRadius: '16px',
      background: 'rgba(8, 12, 28, 0.82)', border: '1px solid rgba(183, 242, 255, 0.45)',
      color: 'rgb(232, 251, 255)', font: '600 13px/1.3 system-ui, sans-serif', textAlign: 'center',
      pointerEvents: 'none', userSelect: 'none', zIndex: '5', opacity: '0'
    });
    doc.body.append(node);
    el = node;
    shownAt = win.performance.now();
    const fade = resolveLegacyControlHintFadeMs(reduced());
    node.style.transition = fade > 0 ? `opacity ${fade}ms linear` : 'none';
    win.requestAnimationFrame(() => { node.style.opacity = '1'; });
  };

  const onKey = (event: KeyboardEvent): void => {
    // Capture phase runs before the feedback scrim can stop the event: a key typed into the note is not game input.
    if (isInsideFeedbackPopup(event.target)) return;
    if (event.isTrusted && event.key.length > 0 && event.key !== 'Unidentified') noteInput('keys');
    if (el !== null && isLegacyControlHintMoveKey(event.key)) hide(true);
  };
  const onDown = (event: PointerEvent): void => {
    noteInput(classifyLegacyControlHintPointer(event.pointerType));
    dragStart = { x: event.clientX, y: event.clientY };
  };
  const onMove = (event: PointerEvent): void => {
    if (el === null || dragStart === null) return;
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
    if (wanted && el === null) {
      show();
    } else if (el !== null && !wanted) {
      hide(false);
    } else if (el !== null && win.performance.now() - shownAt >= LEGACY_CONTROL_HINT_MAX_VISIBLE_MS) {
      hide(true);
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
  };
};
