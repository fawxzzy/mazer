import { designTokens } from '../theme/tokens';
import { resolveBootSplashFadeMs } from '../render/uiTransition';

/**
 * Static boot splash (the markup lives in index.html, inside #app, so the
 * first paint needs no JS). This module only updates its message and removes
 * it; bootStatus drives both from the boot stages so the lifecycle is one
 * explicit, testable sequence.
 */

export const MAZER_BOOT_SPLASH_ID = 'mazer-boot-splash';
export const MAZER_BOOT_SPLASH_TEXT_ID = 'mazer-boot-splash-text';
/** Upper bound on how long the splash may outlive game creation if MenuScene never reports in. */
export const MAZER_BOOT_SPLASH_MAX_AFTER_GAME_CREATE_MS = 10_000;
export const MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE = 'Loading…';
export const MAZER_BOOT_SPLASH_SIGN_IN_MESSAGE = 'Signing you in…';

export interface BootSplashStyleLike {
  opacity: string;
  pointerEvents: string;
  transition: string;
}

export interface BootSplashElementLike {
  textContent: string | null;
  remove(): void;
  /** Present on a real element; a bare stand-in without it is removed at once (nothing to fade). */
  style?: BootSplashStyleLike;
  /** Reading layout flushes the style so the opacity change below animates from 1 instead of snapping. */
  getBoundingClientRect?: () => unknown;
}

export interface BootSplashDocumentLike {
  getElementById(id: string): BootSplashElementLike | null;
}

/** Only an OAuth callback exchange that is actually in progress says "Signing you in"; every other stage is neutral. */
export const resolveMazerBootSplashMessage = (stage: string): string => (
  stage === 'oauth-exchange' ? MAZER_BOOT_SPLASH_SIGN_IN_MESSAGE : MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE
);

const resolveDocument = (documentRef?: BootSplashDocumentLike): BootSplashDocumentLike | undefined => (
  documentRef ?? (typeof document === 'undefined' ? undefined : document)
);

export const setMazerBootSplashMessage = (message: string, documentRef?: BootSplashDocumentLike): boolean => {
  const text = resolveDocument(documentRef)?.getElementById(MAZER_BOOT_SPLASH_TEXT_ID);
  if (!text) {
    return false;
  }

  if (text.textContent !== message) {
    text.textContent = message;
  }
  return true;
};

/** Returns true only when a splash was actually present and removed. */
export const removeMazerBootSplash = (documentRef?: BootSplashDocumentLike): boolean => {
  const splash = resolveDocument(documentRef)?.getElementById(MAZER_BOOT_SPLASH_ID);
  if (!splash) {
    return false;
  }

  splash.remove();
  return true;
};

export interface FadeOutBootSplashOptions {
  documentRef?: BootSplashDocumentLike;
  /** Defaults to the device preference (`prefers-reduced-motion: reduce`). */
  reducedMotion?: boolean;
  schedule?: (callback: () => void, delayMs: number) => unknown;
}

const readSystemPrefersReducedMotion = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

/**
 * MAZER-MOTION-002: the splash fades out over the live menu instead of hard-cutting (the slow step of the duration
 * ladder, or the 200 ms crossfade under reduced motion), then removes itself. It stops taking pointer events the
 * moment the fade starts, so a tap on the menu beneath is never blocked, and a later removeMazerBootSplash() (the
 * boot-error path) still removes it at once. Returns true only when a splash was present.
 */
export const fadeOutMazerBootSplash = (options: FadeOutBootSplashOptions = {}): boolean => {
  const splash = resolveDocument(options.documentRef)?.getElementById(MAZER_BOOT_SPLASH_ID);
  if (!splash) {
    return false;
  }
  if (!splash.style) {
    splash.remove();
    return true;
  }

  const durationMs = resolveBootSplashFadeMs(options.reducedMotion ?? readSystemPrefersReducedMotion());
  splash.style.pointerEvents = 'none';
  splash.style.transition = `opacity ${durationMs}ms ${designTokens.motion.easing.css.standard}`;
  splash.getBoundingClientRect?.();
  splash.style.opacity = '0';
  const schedule = options.schedule ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  schedule(() => splash.remove(), durationMs);
  return true;
};
