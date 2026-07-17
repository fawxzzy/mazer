import type Phaser from 'phaser';

export interface MazerViewportInsets {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface MazerViewportRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface MazerViewportGeometry {
  content: MazerViewportRect;
  devicePixelRatio: number;
  isLandscape: boolean;
  isPhoneLike: boolean;
  layout: {
    height: number;
    width: number;
  };
  revision: number;
  safeArea: MazerViewportInsets;
  visual: {
    height: number;
    offsetLeft: number;
    offsetTop: number;
    scale: number;
    usedForContent: boolean;
    width: number;
  };
}

type MazerViewportListener = (geometry: MazerViewportGeometry) => void;

type MazerVisualViewportLike = {
  addEventListener?: (type: 'resize' | 'scroll', listener: () => void, options?: AddEventListenerOptions) => void;
  height?: number;
  offsetLeft?: number;
  offsetTop?: number;
  removeEventListener?: (type: 'resize' | 'scroll', listener: () => void) => void;
  scale?: number;
  width?: number;
};

type MazerOrientationLike = {
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

type MazerViewportRuntime = Pick<Window, 'addEventListener' | 'devicePixelRatio' | 'innerHeight' | 'innerWidth' | 'matchMedia' | 'navigator' | 'removeEventListener'> & {
  document?: Pick<Document, 'addEventListener' | 'documentElement' | 'removeEventListener'>;
  getComputedStyle?: (element: Element) => Pick<CSSStyleDeclaration, 'getPropertyValue'>;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  screen?: Pick<Screen, 'orientation'> & { orientation?: MazerOrientationLike };
  visualViewport?: MazerVisualViewportLike | null;
};

type MazerViewportCssRoot = Pick<HTMLElement, 'dataset' | 'style'>;

declare global {
  interface Window {
    __MAZER_VIEWPORT_GEOMETRY__?: MazerViewportGeometry;
  }
}

export const MAZER_VIEWPORT_CHANGE_EVENT = 'mazer:viewport-change';

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;

const isFinitePositive = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

const normalizeDimension = (value: unknown, fallback: number): number => (
  isFinitePositive(value) ? Math.max(1, Math.round(value)) : Math.max(1, Math.round(fallback))
);

const normalizeOffset = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
);

const normalizeScale = (value: unknown): number => (
  isFinitePositive(value) ? Math.round(value * 100) / 100 : 1
);

const isStableVisualViewport = ({
  layoutHeight,
  layoutWidth,
  scale,
  visualHeight,
  visualWidth
}: {
  layoutHeight: number;
  layoutWidth: number;
  scale: number;
  visualHeight: number;
  visualWidth: number;
}): boolean => (
  scale >= 0.98
  && scale <= 1.02
  && visualWidth <= layoutWidth + 1
  && visualHeight <= layoutHeight + 1
);

const parseCssPixels = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

const readSafeArea = (runtime: MazerViewportRuntime): MazerViewportInsets => {
  const root = runtime.document?.documentElement;
  const style = root && runtime.getComputedStyle ? runtime.getComputedStyle(root) : null;
  const readInset = (environmentName: string, publishedName: string): number => {
    if (!style) {
      return 0;
    }

    const environmentValue = style.getPropertyValue(environmentName);
    return parseCssPixels(environmentValue || style.getPropertyValue(publishedName));
  };

  return {
    top: readInset('--mazer-environment-safe-area-top', '--mazer-safe-area-top'),
    right: readInset('--mazer-environment-safe-area-right', '--mazer-safe-area-right'),
    bottom: readInset('--mazer-environment-safe-area-bottom', '--mazer-safe-area-bottom'),
    left: readInset('--mazer-environment-safe-area-left', '--mazer-safe-area-left')
  };
};

export const isMazerPhoneLikeRuntime = (runtime: Pick<Window, 'matchMedia' | 'navigator'>): boolean => (
  runtime.matchMedia?.('(pointer: coarse)').matches === true
  || (runtime.navigator.maxTouchPoints ?? 0) > 0
);

export const resolveMazerViewportGeometryFromRuntime = (
  runtime: MazerViewportRuntime | undefined,
  revision = 1
): MazerViewportGeometry => {
  if (!runtime) {
    return {
      revision,
      layout: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
      visual: { width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT, offsetLeft: 0, offsetTop: 0, scale: 1, usedForContent: false },
      content: { left: 0, top: 0, width: DEFAULT_VIEWPORT_WIDTH, height: DEFAULT_VIEWPORT_HEIGHT },
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      devicePixelRatio: 1,
      isPhoneLike: false,
      isLandscape: true
    };
  }

  const root = runtime.document?.documentElement;
  const layoutWidth = normalizeDimension(runtime.innerWidth ?? root?.clientWidth, DEFAULT_VIEWPORT_WIDTH);
  const layoutHeight = normalizeDimension(runtime.innerHeight ?? root?.clientHeight, DEFAULT_VIEWPORT_HEIGHT);
  const visualWidth = normalizeDimension(runtime.visualViewport?.width, layoutWidth);
  const visualHeight = normalizeDimension(runtime.visualViewport?.height, layoutHeight);
  const visualScale = normalizeScale(runtime.visualViewport?.scale);
  const useVisualViewport = isStableVisualViewport({
    layoutWidth,
    layoutHeight,
    visualWidth,
    visualHeight,
    scale: visualScale
  });
  const effectiveWidth = useVisualViewport ? visualWidth : layoutWidth;
  const effectiveHeight = useVisualViewport ? visualHeight : layoutHeight;
  const effectiveLeft = useVisualViewport ? normalizeOffset(runtime.visualViewport?.offsetLeft) : 0;
  const effectiveTop = useVisualViewport ? normalizeOffset(runtime.visualViewport?.offsetTop) : 0;
  const safeArea = readSafeArea(runtime);
  const devicePixelRatio = normalizeScale(runtime.devicePixelRatio);

  return {
    revision,
    layout: {
      width: layoutWidth,
      height: layoutHeight
    },
    visual: {
      width: visualWidth,
      height: visualHeight,
      offsetLeft: normalizeOffset(runtime.visualViewport?.offsetLeft),
      offsetTop: normalizeOffset(runtime.visualViewport?.offsetTop),
      scale: visualScale,
      usedForContent: useVisualViewport
    },
    content: {
      left: effectiveLeft + safeArea.left,
      top: effectiveTop + safeArea.top,
      width: Math.max(1, effectiveWidth - safeArea.left - safeArea.right),
      height: Math.max(1, effectiveHeight - safeArea.top - safeArea.bottom)
    },
    safeArea,
    devicePixelRatio,
    isPhoneLike: isMazerPhoneLikeRuntime(runtime),
    isLandscape: visualWidth > visualHeight
  };
};

const sameGeometry = (left: MazerViewportGeometry, right: MazerViewportGeometry): boolean => (
  left.layout.width === right.layout.width
  && left.layout.height === right.layout.height
  && left.visual.width === right.visual.width
  && left.visual.height === right.visual.height
  && left.visual.offsetLeft === right.visual.offsetLeft
  && left.visual.offsetTop === right.visual.offsetTop
  && left.visual.scale === right.visual.scale
  && left.visual.usedForContent === right.visual.usedForContent
  && left.safeArea.top === right.safeArea.top
  && left.safeArea.right === right.safeArea.right
  && left.safeArea.bottom === right.safeArea.bottom
  && left.safeArea.left === right.safeArea.left
  && left.devicePixelRatio === right.devicePixelRatio
  && left.isPhoneLike === right.isPhoneLike
);

export const applyMazerViewportCssVariables = (
  geometry: MazerViewportGeometry,
  root: MazerViewportCssRoot | undefined
): void => {
  if (!root) {
    return;
  }

  root.style.setProperty('--mazer-viewport-width', `${geometry.content.width}px`);
  root.style.setProperty('--mazer-viewport-height', `${geometry.content.height}px`);
  root.style.setProperty('--mazer-viewport-left', `${geometry.content.left}px`);
  root.style.setProperty('--mazer-viewport-top', `${geometry.content.top}px`);
  root.style.setProperty('--mazer-safe-area-top', `${geometry.safeArea.top}px`);
  root.style.setProperty('--mazer-safe-area-right', `${geometry.safeArea.right}px`);
  root.style.setProperty('--mazer-safe-area-bottom', `${geometry.safeArea.bottom}px`);
  root.style.setProperty('--mazer-safe-area-left', `${geometry.safeArea.left}px`);
  root.dataset.mazerViewportRevision = String(geometry.revision);
};

export const readMazerViewportGeometry = (): MazerViewportGeometry => (
  typeof window === 'undefined'
    ? resolveMazerViewportGeometryFromRuntime(undefined)
    : window.__MAZER_VIEWPORT_GEOMETRY__ ?? resolveMazerViewportGeometryFromRuntime(window)
);

export const syncMazerGameToViewport = (
  game: Pick<Phaser.Game, 'scale'>,
  geometry: Pick<MazerViewportGeometry, 'content'>
): boolean => {
  const width = geometry.content.width;
  const height = geometry.content.height;
  if (game.scale.width === width && game.scale.height === height) {
    // The visual viewport and safe-area origin can move without changing its
    // dimensions (notably when iOS browser chrome collapses or expands).
    // Refreshing keeps Phaser's cached canvasBounds aligned with the fixed
    // #app origin so touch hit-testing does not drift below the finger.
    game.scale.refresh();
    return false;
  }

  game.scale.resize(width, height);
  return true;
};

export const installMazerViewportGeometry = (
  runtime: MazerViewportRuntime = window as MazerViewportRuntime
): {
  dispose: () => void;
  getSnapshot: () => MazerViewportGeometry;
  subscribe: (listener: MazerViewportListener, emitCurrent?: boolean) => () => void;
  sync: () => MazerViewportGeometry;
} => {
  let snapshot = resolveMazerViewportGeometryFromRuntime(runtime);
  const listeners = new Set<MazerViewportListener>();
  let scheduled = false;

  const publish = (): void => {
    applyMazerViewportCssVariables(snapshot, runtime.document?.documentElement);
    if (typeof window !== 'undefined' && runtime === window) {
      window.__MAZER_VIEWPORT_GEOMETRY__ = snapshot;
    }
    for (const listener of listeners) {
      listener(snapshot);
    }
    if (typeof window !== 'undefined' && runtime === window) {
      window.dispatchEvent(new CustomEvent(MAZER_VIEWPORT_CHANGE_EVENT, { detail: snapshot }));
    }
  };

  const sync = (): MazerViewportGeometry => {
    const candidate = resolveMazerViewportGeometryFromRuntime(runtime, snapshot.revision + 1);
    if (sameGeometry(snapshot, candidate)) {
      return snapshot;
    }

    snapshot = candidate;
    publish();
    return snapshot;
  };

  const scheduleSync = (): void => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    const flush = (): void => {
      scheduled = false;
      sync();
    };
    if (typeof runtime.requestAnimationFrame === 'function') {
      runtime.requestAnimationFrame(flush);
    } else {
      queueMicrotask(flush);
    }
  };

  const visualViewport = runtime.visualViewport;
  publish();
  runtime.addEventListener('resize', scheduleSync, { passive: true });
  runtime.addEventListener('orientationchange', scheduleSync, { passive: true });
  runtime.document?.addEventListener('visibilitychange', scheduleSync, { passive: true });
  runtime.document?.addEventListener('fullscreenchange', scheduleSync, { passive: true });
  visualViewport?.addEventListener?.('resize', scheduleSync, { passive: true });
  visualViewport?.addEventListener?.('scroll', scheduleSync, { passive: true });
  runtime.screen?.orientation?.addEventListener?.('change', scheduleSync);

  return {
    dispose: () => {
      runtime.removeEventListener('resize', scheduleSync);
      runtime.removeEventListener('orientationchange', scheduleSync);
      runtime.document?.removeEventListener('visibilitychange', scheduleSync);
      runtime.document?.removeEventListener('fullscreenchange', scheduleSync);
      visualViewport?.removeEventListener?.('resize', scheduleSync);
      visualViewport?.removeEventListener?.('scroll', scheduleSync);
      runtime.screen?.orientation?.removeEventListener?.('change', scheduleSync);
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    subscribe: (listener, emitCurrent = true) => {
      listeners.add(listener);
      if (emitCurrent) {
        listener(snapshot);
      }
      return () => listeners.delete(listener);
    },
    sync
  };
};
