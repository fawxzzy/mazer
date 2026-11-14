import { designTokens } from '../theme/tokens';
import { resolveBootSplashFadeMs } from '../render/uiTransition';
import { LOADER_SHOW_DELAY_MS, resolveBootSplashExitDelayMs } from '../render/appLoader';

/**
 * Static boot splash (the markup lives in index.html, inside #app, so the
 * first paint needs no JS). This module only updates its message and removes
 * it; bootStatus drives both from the boot stages so the lifecycle is one
 * explicit, testable sequence.
 */

export const MAZER_BOOT_SPLASH_ID = 'mazer-boot-splash';
export const MAZER_BOOT_SPLASH_TEXT_ID = 'mazer-boot-splash-text';
/** The icon + ring + label block that fades in by CSS (index.html); its animation clock says how long the loader has been showing. */
export const MAZER_BOOT_SPLASH_STAGE_ID = 'mazer-boot-splash-stage';
export const MAZER_BOOT_SPLASH_FADE_IN_ANIMATION = 'mazer-boot-splash-in';
/** The no-op animation the stage runs instead of the fade-in when the loader was handed over from the account host (index.html). */
export const MAZER_BOOT_SPLASH_INSTANT_ANIMATION = 'mazer-boot-splash-instant';
/** Upper bound on how long the splash may outlive game creation if MenuScene never reports in. */
export const MAZER_BOOT_SPLASH_MAX_AFTER_GAME_CREATE_MS = 10_000;
export const MAZER_BOOT_SPLASH_NEUTRAL_MESSAGE = 'Loading…';
export const MAZER_BOOT_SPLASH_SIGN_IN_MESSAGE = 'Signing you in…';

/** The root's CSS failsafe animation (index.html): it fades the splash out after LOADER_BOOT_FAILSAFE_MS when scripts never took over. */
export const MAZER_BOOT_SPLASH_FAILSAFE_ANIMATION = 'mazer-boot-splash-failsafe';

export interface BootSplashStyleLike {
  opacity: string;
  animation?: string;
  pointerEvents: string;
  transition: string;
}

export interface BootSplashAnimationLike {
  animationName?: string;
  playState?: string;
  currentTime: unknown;
}

export interface BootSplashElementLike {
  textContent: string | null;
  remove(): void;
  /** Web Animations; absent on stand-ins, in which case the splash is treated as having no hold to serve. */
  getAnimations?: () => ReadonlyArray<BootSplashAnimationLike>;
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

/** True while the static splash is still in the document (so an in-game cover can start opaque under it). */
export const isMazerBootSplashPresent = (documentRef?: BootSplashDocumentLike): boolean => (
  resolveDocument(documentRef)?.getElementById(MAZER_BOOT_SPLASH_ID) != null
);

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

const exitingSplashes = new WeakSet<object>();

/** How long the splash's loader animation has been running (including its delay), and whether it was the instant hand-off one. */
const readSplashShownClock = (documentRef?: BootSplashDocumentLike): { elapsedMs: number | null; instant: boolean } => {
  const animations = (resolveDocument(documentRef)?.getElementById(MAZER_BOOT_SPLASH_STAGE_ID)?.getAnimations?.() ?? [])
    .filter((animation) => animation.animationName !== MAZER_BOOT_SPLASH_FAILSAFE_ANIMATION);
  const fadeIn = animations.find((animation) => (
    animation.animationName === MAZER_BOOT_SPLASH_FADE_IN_ANIMATION
    || animation.animationName === MAZER_BOOT_SPLASH_INSTANT_ANIMATION
  )) ?? animations[0];
  return {
    elapsedMs: typeof fadeIn?.currentTime === 'number' ? fadeIn.currentTime : null,
    instant: fadeIn?.animationName === MAZER_BOOT_SPLASH_INSTANT_ANIMATION
  };
};

/**
 * MAZER-MOTION-002 / MAZER-VIS-039: the splash fades out over the live menu instead of hard-cutting (the slow step of
 * the duration ladder, or the 200 ms crossfade under reduced motion), then removes itself. If the loader icon has
 * already become visible (it fades in after LOADER_SHOW_DELAY_MS), the exit first waits out the minimum hold
 * (LOADER_MIN_HOLD_MS) so a fast load never blinks the icon on and off; if it never showed, it leaves at once. The
 * splash stops taking pointer events the moment the fade starts, so a tap on the menu beneath is never blocked, and a
 * later removeMazerBootSplash() (the boot-error path) still removes it at once. Returns true only when a splash was
 * present.
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
  if (exitingSplashes.has(splash)) {
    return true;
  }
  // A late start after the CSS failsafe already hid the splash: settle straight to removed. Fading it would transition
  // from the style's own opacity 1 and flash the cover back opaque before fading it out again.
  if ((splash.getAnimations?.() ?? []).some((animation) => (
    animation.animationName === MAZER_BOOT_SPLASH_FAILSAFE_ANIMATION && animation.playState === 'finished'
  ))) {
    splash.remove();
    return true;
  }
  exitingSplashes.add(splash);

  const style = splash.style;
  const schedule = options.schedule ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
  const durationMs = resolveBootSplashFadeMs(options.reducedMotion ?? readSystemPrefersReducedMotion());
  const startFade = (): void => {
    // Fast load: the stage never became visible. Hold it hidden, or its pending CSS fade-in would ghost the icon in
    // while the cover fades out.
    if (!stageEverShown) {
      const stage = resolveDocument(options.documentRef)?.getElementById(MAZER_BOOT_SPLASH_STAGE_ID);
      if (stage?.style) {
        stage.style.animation = 'none';
        stage.style.opacity = '0';
      }
    }
    style.pointerEvents = 'none';
    style.transition = `opacity ${durationMs}ms ${designTokens.motion.easing.css.standard}`;
    splash.getBoundingClientRect?.();
    style.opacity = '0';
    schedule(() => splash.remove(), durationMs);
  };

  const shown = readSplashShownClock(options.documentRef);
  const holdMs = resolveBootSplashExitDelayMs(shown.elapsedMs, shown.instant);
  const stageEverShown = shown.instant || (shown.elapsedMs !== null && shown.elapsedMs >= LOADER_SHOW_DELAY_MS);
  if (holdMs > 0) {
    schedule(startFade, holdMs);
  } else {
    startFade();
  }
  return true;
};
