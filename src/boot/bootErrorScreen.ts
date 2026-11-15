import { AUTH_SURFACE_LABELS, AUTH_SURFACE_MESSAGES } from '../brand/authSurfaceCopy';
import {
  renderSurfaceAppIcon,
  renderSurfaceKicker,
  renderSurfaceNoticeInner
} from './surfaceMarkup';

/**
 * Auth Surface v2 (owner-approved 2026-11-15, mock frame "bt-mzend"): when boot throws, Mazer says so instead of
 * leaving a blank page. Status anatomy: kicker, the real app icon, "Could not load", the page.crash line in the
 * error message box, and one "Try again" button that reloads the page. Shown from the boot catch in main.ts after
 * markMazerBootStatus('error') has removed the splash. The technical message stays in __MAZER_BOOT_STATUS__.
 */

export const MAZER_BOOT_ERROR_SCREEN_ID = 'mazer-boot-error';

export const renderMazerBootErrorHtml = (): string => `
  <div class="mazer-surface mazer-surface-status">
    ${renderSurfaceKicker()}
    <div class="mazer-surface-stat">
      ${renderSurfaceAppIcon('mark')}
      <h1 class="mazer-surface-title">${AUTH_SURFACE_LABELS.bootErrorTitle}</h1>
      <div class="mazer-surface-slot"><p class="mazer-surface-notice" data-tone="error" role="alert">${renderSurfaceNoticeInner('error', AUTH_SURFACE_MESSAGES['page.crash'])}</p></div>
    </div>
    <button type="button" class="mazer-surface-dock" data-mazer-boot-error-action="retry">${AUTH_SURFACE_LABELS.tryAgain}</button>
  </div>
`;

interface BootErrorDocumentLike {
  createElement: Document['createElement'];
  getElementById: Document['getElementById'];
  body: { append(node: Node): void } | null;
}

/** Idempotent: a second boot failure keeps the one screen. Returns false when there is no document to draw on. */
export const showMazerBootErrorScreen = (
  documentRef: BootErrorDocumentLike | undefined = typeof document === 'undefined' ? undefined : document,
  reload: () => void = () => window.location.reload()
): boolean => {
  if (!documentRef?.body) {
    return false;
  }
  if (documentRef.getElementById(MAZER_BOOT_ERROR_SCREEN_ID)) {
    return true;
  }
  const screen = documentRef.createElement('section');
  screen.id = MAZER_BOOT_ERROR_SCREEN_ID;
  screen.setAttribute('role', 'alertdialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-label', AUTH_SURFACE_LABELS.bootErrorTitle);
  screen.innerHTML = renderMazerBootErrorHtml();
  screen.querySelector('[data-mazer-boot-error-action="retry"]')?.addEventListener('click', () => reload());
  documentRef.body.append(screen);
  return true;
};
