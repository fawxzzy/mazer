import '../dom/primitives.css';
import './inFlowNotice.css';
import { createStatusBanner, type StatusBannerTone } from '../dom/StatusBanner';

/**
 * In-flow notice (reusable): one calm kit StatusBanner floating at the top of the play view, under the header
 * controls. Non-modal: the board keeps playing and only the banner takes taps. No copy lives here; the caller passes
 * the title (the small marker tag) and the body.
 *
 * Loaded on demand (src/legacy-runtime/legacyInFlowNoticeHost.ts), so neither this module nor its CSS is in the boot
 * bundle. First user: the shard first-time hint and the star-unlocked notice; the planned first-time card system can
 * mount it unchanged.
 *
 * Reduced motion: no slide, a short opacity crossfade only (same meaning).
 */

export type InFlowNoticeDismissReason = 'action' | 'timeout' | 'replaced' | 'closed';

export interface InFlowNoticeProps {
  /** Short tag before the body (e.g. "New"); empty falls back to the tone's own label. */
  readonly title?: string;
  readonly body: string;
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
}

export const IN_FLOW_NOTICE_HOST_CLASS = 'mazer-inflow-notice-host';
/** Matches --mazer-token-motion-duration-base (the slide-out before removal). */
const CLOSE_TRANSITION_MS = 200;

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

  const banner = createStatusBanner({
    message: props.body,
    tone: props.tone ?? 'info',
    className: [
      'mazer-inflow-notice',
      fromBottom ? 'mazer-inflow-notice--bottom' : '',
      props.reducedMotion ? 'mazer-inflow-notice--reduced' : ''
    ].filter(Boolean).join(' '),
    actionLabel: props.actionLabel,
    onAction: props.actionLabel ? () => close('action') : undefined
  }, ownerDocument);
  banner.dataset.mazerComponent = 'InFlowNotice';
  const marker = banner.querySelector('.mazer-status-banner__marker');
  if (marker && props.title) marker.textContent = props.title;

  host.append(banner);
  ownerDocument.body.append(host);
  const view = ownerDocument.defaultView;
  // Next frame, so the open transition runs from the closed state.
  if (view?.requestAnimationFrame) view.requestAnimationFrame(() => { if (open) banner.classList.add('mazer-inflow-notice--open'); });
  else banner.classList.add('mazer-inflow-notice--open');
  if (props.autoDismissMs !== undefined && props.autoDismissMs > 0) {
    timer = setTimeout(() => close('timeout'), props.autoDismissMs);
  }
  return { element: banner, close, isOpen: () => open };
};
