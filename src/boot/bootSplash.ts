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

export interface BootSplashElementLike {
  textContent: string | null;
  remove(): void;
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
