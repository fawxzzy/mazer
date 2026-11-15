import { MAZER_BOOT_LOADER_ICON_DATA_URI } from '../brand/bootLoaderIconData';
import { AUTH_SURFACE_LABELS } from '../brand/authSurfaceCopy';
import { buildMazerLegalUrl } from '../legacy-runtime/legacyAccountPortal';

/**
 * Auth Surface v2 (owner-approved 2026-11-15): the shared DOM anatomy of Mazer's install gate and boot-error screen.
 * Kicker, the real app icon, title, optional lead, a reserved message slot, Privacy | Terms and one dock button,
 * styled by the `.mazer-surface*` rules in src/styles/base.css on the shared design tokens. Pure string builders, so
 * they render the same under the test fakes and in the browser.
 */

export const escapeSurfaceHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** The approved mock's line icons (24 px grid, stroke = currentColor), all decorative. */
export const SURFACE_ICON_SVG = Object.freeze({
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.4v.1"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5"/><path d="M8 12.4l2.8 2.8L16.2 9.4"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Share" role="img"><path d="M12 15V3.5M8 7l4-4 4 4M6 11H5.5A1.5 1.5 0 004 12.5v7A1.5 1.5 0 005.5 21h13a1.5 1.5 0 001.5-1.5v-7a1.5 1.5 0 00-1.5-1.5H18"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor" aria-label="the menu button" role="img"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>'
} as const);

/** Escapes a step line, then swaps its one inline token ({share}, {add}, {dots}) for the matching icon. */
export const renderSurfaceStepText = (step: string): string => escapeSurfaceHtml(step)
  .replace(/\{(share|add|dots)\}/g, (_match, name: 'share' | 'add' | 'dots') => SURFACE_ICON_SVG[name]);

export const renderSurfaceSteps = (steps: readonly string[]): string => (
  steps.length <= 0
    ? ''
    : `<ol class="mazer-surface-steps">${steps.map((step, index) => (
      `<li><span class="mazer-surface-step-index">${index + 1}</span><span>${renderSurfaceStepText(step)}</span></li>`
    )).join('')}</ol>`
);

/** The real app icon (the same inline image as the boot splash and the canvas loader), size reserved. */
export const renderSurfaceAppIcon = (variant: 'top' | 'mark'): string => (
  `<img class="mazer-surface-appicon mazer-surface-appicon-${variant}" alt="" aria-hidden="true" width="76" height="76" decoding="sync" src="${MAZER_BOOT_LOADER_ICON_DATA_URI}" />`
);

export const renderSurfaceKicker = (): string => `<p class="mazer-surface-kicker">${AUTH_SURFACE_LABELS.kicker}</p>`;

export type SurfaceNoticeTone = 'error' | 'success';

/** The one message box. `copy === null` keeps the slot's space but shows nothing. */
export const renderSurfaceNoticeInner = (tone: SurfaceNoticeTone, copy: string): string => (
  `${tone === 'error' ? SURFACE_ICON_SVG.warn : SURFACE_ICON_SVG.ok}<span class="mazer-surface-notice-text">${escapeSurfaceHtml(copy)}</span>`
);

export const renderSurfaceLegal = (): string => (
  `<nav class="mazer-surface-legal" aria-label="${AUTH_SURFACE_LABELS.legalNav}">`
  + `<a href="${escapeSurfaceHtml(buildMazerLegalUrl('privacy'))}">${AUTH_SURFACE_LABELS.privacy}</a>`
  + `<a href="${escapeSurfaceHtml(buildMazerLegalUrl('terms'))}">${AUTH_SURFACE_LABELS.terms}</a>`
  + '</nav>'
);
