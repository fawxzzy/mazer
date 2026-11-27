import '../dom/primitives.css';
import './inFlowNotice.css';
import { createStatusBanner, type StatusBannerTone } from '../dom/StatusBanner';
import { NEON_TEXT_SKIN } from '../skin/neonTextSkin';
import { paintMechanicIconCanvas, resolveMechanicIconAccentCss, type MechanicIconId } from '../../render/mechanicIcons';

/**
 * In-flow notice (reusable): one calm kit StatusBanner floating at the top of the play view, under the header
 * controls. Non-modal: the board keeps playing and only the banner takes taps. No copy lives here; the caller passes
 * the title (the small marker tag) and the body.
 *
 * Loaded on demand (src/legacy-runtime/legacyInFlowNoticeHost.ts), so neither this module nor its CSS is in the boot
 * bundle. First user: the shard first-time hint and the star-unlocked notice; the planned first-time card system can
 * mount it unchanged.
 *
 * Skin: the neon edge text skin (pick B, 2026-11-27) through the kit StatusBanner. With a `heading` the card is the
 * rich layout: icon well (a mechanic icon registry image, drawn by the board's own painter), the small marker as the
 * kicker, the heading in the accent, then the body. The accent is the icon's board colour unless `accent` is given.
 * The rim light runs round while the card is up (a still rim under reduced motion).
 *
 * Reduced motion: no slide, no flicker, no rim spin, a short opacity crossfade only (same meaning).
 */

export type InFlowNoticeDismissReason = 'action' | 'timeout' | 'replaced' | 'closed';

export interface InFlowNoticeProps {
  /** Short tag before the body (e.g. "New"); empty falls back to the tone's own label. */
  readonly title?: string;
  readonly body: string;
  /** Optional heading line between the marker and the body (the rich card layout). */
  readonly heading?: string;
  /** Optional registry icon shown in the icon well (rich layout only). */
  readonly icon?: MechanicIconId;
  /** Optional accent (CSS colour); defaults to the icon's board colour, else the tone's. */
  readonly accent?: string;
  readonly tone?: StatusBannerTone;
  /** Button label (e.g. "Got it"). No label = no button. */
  readonly actionLabel?: string;
  /** Auto-dismiss after this many ms; omit to stay until dismissed. */
  readonly autoDismissMs?: number;
  /** Screen y (CSS px) of the banner's top edge. */
  readonly topPx: number;
  /**
   * When set, the banner sits this far (CSS px, plus the bottom safe area) above the bottom edge instead and
   * `topPx` is ignored. For callers whose anchor would sit under a top banner.
   */
  readonly bottomPx?: number;
  readonly reducedMotion: boolean;
  /** Called once, however the notice went away. */
  readonly onDismiss?: (reason: InFlowNoticeDismissReason) => void;
}

export interface InFlowNoticeHandle {
  readonly element: HTMLElement;
  close(reason?: InFlowNoticeDismissReason): void;
  isOpen(): boolean;
  /** Hides or shows the notice without closing it (hidden = not seen, not read out, no taps; timers keep running). */
  setHidden(hidden: boolean): void;
}

export const IN_FLOW_NOTICE_HOST_CLASS = 'mazer-inflow-notice-host';
/** Matches --mazer-token-motion-duration-base (the slide-out before removal). */
const CLOSE_TRANSITION_MS = 200;
/** The registry icon inside the icon well. */
const NOTICE_ICON_PX = NEON_TEXT_SKIN.glyph.iconPx;

export const mountInFlowNotice = (props: InFlowNoticeProps, ownerDocument: Document = document): InFlowNoticeHandle => {
  const host = ownerDocument.createElement('div');
  host.className = IN_FLOW_NOTICE_HOST_CLASS;
  const fromBottom = props.bottomPx !== undefined;
  if (fromBottom) host.style.bottom = `calc(${Math.max(0, Math.round(props.bottomPx ?? 0))}px + env(safe-area-inset-bottom, 0px))`;
  else host.style.top = `${Math.max(0, Math.round(props.topPx))}px`;
  let open = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const close = (reason: InFlowNoticeDismissReason = 'closed'): void => {
    if (!open) return;
    open = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    banner.classList.remove('mazer-inflow-notice--open');
    const view = ownerDocument.defaultView;
    const remove = (): void => host.remove();
    if (view && !props.reducedMotion) view.setTimeout(remove, CLOSE_TRANSITION_MS);
    else remove();
    props.onDismiss?.(reason);
  };

  const rich = Boolean(props.heading);
  const banner = createStatusBanner({
    message: props.body,
    tone: props.tone ?? 'info',
    className: [
      'mazer-inflow-notice',
      fromBottom ? 'mazer-inflow-notice--bottom' : '',
      props.reducedMotion ? 'mazer-inflow-notice--reduced' : 'mazer-status-banner--live',
      rich ? 'mazer-status-banner--rich' : ''
    ].filter(Boolean).join(' '),
    actionLabel: props.actionLabel,
    onAction: props.actionLabel ? () => close('action') : undefined
  }, ownerDocument);
  banner.dataset.mazerComponent = 'InFlowNotice';
  const accent = props.accent ?? (props.icon ? resolveMechanicIconAccentCss(props.icon) : undefined);
  if (accent) banner.style.setProperty('--mazer-neon-accent', accent);
  const marker = banner.querySelector('.mazer-status-banner__marker');
  const message = banner.querySelector('.mazer-status-banner__message');
  let heading: HTMLElement | null = null;
  if (rich) {
    heading = ownerDocument.createElement('span');
    heading.className = 'mazer-status-banner__heading';
    message?.before(heading);
    if (props.icon) {
      const well = ownerDocument.createElement('span');
      well.className = 'mazer-status-banner__glyph';
      well.setAttribute('aria-hidden', 'true');
      const canvas = ownerDocument.createElement('canvas');
      const dpr = ownerDocument.defaultView?.devicePixelRatio ?? 1;
      if (paintMechanicIconCanvas(canvas as never, props.icon, NOTICE_ICON_PX, dpr)) well.append(canvas);
      banner.prepend(well);
    }
  }
  const markerText = props.title || (marker?.textContent ?? '');
  // A live region announces changes, not the text it was inserted with: insert it empty, fill it once it is in the page.
  if (marker) marker.textContent = '';
  if (message) message.textContent = '';
  const fill = (): void => {
    if (marker) marker.textContent = markerText;
    if (heading) heading.textContent = props.heading ?? '';
    if (message) message.textContent = props.body;
  };

  host.append(banner);
  ownerDocument.body.append(host);
  const view = ownerDocument.defaultView;
  // Next frame, so the open transition runs from the closed state and the region already exists when it is filled.
  if (view?.requestAnimationFrame) {
    view.requestAnimationFrame(() => {
      if (!open) return;
      fill();
      banner.classList.add('mazer-inflow-notice--open');
    });
  } else {
    fill();
    banner.classList.add('mazer-inflow-notice--open');
  }
  if (props.autoDismissMs !== undefined && props.autoDismissMs > 0) {
    timer = setTimeout(() => close('timeout'), props.autoDismissMs);
  }
  const setHidden = (hidden: boolean): void => {
    // visibility (not display or [hidden]): the host's flex layout stays put and the banner leaves the a11y tree.
    host.style.visibility = hidden ? 'hidden' : '';
  };
  return { element: banner, close, isOpen: () => open, setHidden };
};
