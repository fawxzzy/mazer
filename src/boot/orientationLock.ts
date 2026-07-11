export const MAZER_PORTRAIT_LOCK_OVERLAY_ID = 'mazer-portrait-lock-overlay';
export const MAZER_PORTRAIT_LOCK_BODY_CLASS = 'mazer-phone-landscape-locked';

type MazerOrientationLockType = 'portrait-primary';

type OrientationLockLike = {
  addEventListener?: (type: string, listener: () => void) => void;
  lock?: (orientation: MazerOrientationLockType) => Promise<void>;
  removeEventListener?: (type: string, listener: () => void) => void;
};

type MazerOrientationWindow = Window & {
  screen: Screen & {
    orientation?: OrientationLockLike;
  };
};

export const isMazerPhoneLikeViewport = (targetWindow: Pick<Window, 'matchMedia' | 'navigator'>): boolean => {
  const coarsePointer = targetWindow.matchMedia?.('(pointer: coarse)').matches === true;
  const hasTouchPoints = (targetWindow.navigator.maxTouchPoints ?? 0) > 0;

  return coarsePointer || hasTouchPoints;
};

export const isMazerLandscapeViewport = (targetWindow: Pick<Window, 'innerHeight' | 'innerWidth'>): boolean => (
  targetWindow.innerWidth > targetWindow.innerHeight
);

export const shouldBlockMazerLandscape = (
  targetWindow: Pick<Window, 'innerHeight' | 'innerWidth' | 'matchMedia' | 'navigator'>
): boolean => (
  isMazerPhoneLikeViewport(targetWindow)
  && isMazerLandscapeViewport(targetWindow)
);

export const shouldUseMazerCssPortraitLock = (
  _targetWindow: Pick<Window, 'innerHeight' | 'innerWidth' | 'matchMedia' | 'navigator'>
): boolean => false;

const removePortraitLockOverlay = (documentRef: Document): void => {
  const existing = documentRef.getElementById(MAZER_PORTRAIT_LOCK_OVERLAY_ID);
  if (existing) {
    existing.remove();
  }
};

const installPortraitLockOverlay = (documentRef: Document): void => {
  const overlay = documentRef.createElement('section');
  overlay.id = MAZER_PORTRAIT_LOCK_OVERLAY_ID;
  overlay.setAttribute('aria-live', 'assertive');
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-label', 'Rotate device to continue');
  overlay.innerHTML = '<div class="mazer-portrait-lock-card"><strong>Rotate your device</strong><span>Mazer continues in portrait.</span></div>';
  documentRef.body.append(overlay);
};

export const syncMazerPortraitLockOverlay = (
  targetWindow: MazerOrientationWindow = window as MazerOrientationWindow
): boolean => {
  const blocked = shouldBlockMazerLandscape(targetWindow);
  removePortraitLockOverlay(targetWindow.document);
  targetWindow.document.body.classList.toggle(MAZER_PORTRAIT_LOCK_BODY_CLASS, blocked);
  targetWindow.document.documentElement.dataset.mazerOrientation = blocked ? 'portrait-blocked' : 'portrait-ready';
  if (blocked) {
    installPortraitLockOverlay(targetWindow.document);
  }

  return blocked;
};

export const requestMazerPortraitOrientationLock = async (
  targetWindow: MazerOrientationWindow = window as MazerOrientationWindow
): Promise<boolean> => {
  const lock = targetWindow.screen.orientation?.lock;
  if (typeof lock !== 'function') {
    return false;
  }

  try {
    await lock.call(targetWindow.screen.orientation, 'portrait-primary');
    return true;
  } catch {
    // Browsers commonly reject orientation locks outside installed/fullscreen app mode.
    return false;
  }
};

export const installMazerPortraitLock = (
  targetWindow: MazerOrientationWindow = window as MazerOrientationWindow,
  onBlockStateChange?: (blocked: boolean) => void
): (() => void) => {
  const sync = (): void => {
    onBlockStateChange?.(syncMazerPortraitLockOverlay(targetWindow));
  };

  void requestMazerPortraitOrientationLock(targetWindow);
  sync();
  targetWindow.addEventListener('resize', sync, { passive: true });
  targetWindow.addEventListener('orientationchange', sync, { passive: true });
  targetWindow.screen.orientation?.addEventListener?.('change', sync);

  return () => {
    targetWindow.removeEventListener('resize', sync);
    targetWindow.removeEventListener('orientationchange', sync);
    targetWindow.screen.orientation?.removeEventListener?.('change', sync);
    targetWindow.document.body.classList.remove(MAZER_PORTRAIT_LOCK_BODY_CLASS);
    removePortraitLockOverlay(targetWindow.document);
  };
};
