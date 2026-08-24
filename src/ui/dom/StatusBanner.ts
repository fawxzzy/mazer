import { createMazerButton } from './MazerButton';

export type StatusBannerTone = 'info' | 'success' | 'warning' | 'error';

export interface StatusBannerOptions {
  message: string;
  tone?: StatusBannerTone;
  urgent?: boolean;
  id?: string;
  className?: string;
  actionLabel?: string;
  onAction?: (event: MouseEvent) => void;
}

const toneLabel: Record<StatusBannerTone, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error'
};

/** Creates a nonblocking live region; only explicitly urgent messages become alerts. */
export const createStatusBanner = (
  options: StatusBannerOptions,
  ownerDocument: Document = document
): HTMLElement => {
  const tone = options.tone ?? 'info';
  const root = ownerDocument.createElement('div');
  const marker = ownerDocument.createElement('span');
  const message = ownerDocument.createElement('span');
  root.className = ['mazer-status-banner', `mazer-status-banner--${tone}`, options.className]
    .filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'StatusBanner';
  root.dataset.tone = tone;
  root.setAttribute('role', options.urgent ? 'alert' : 'status');
  root.setAttribute('aria-live', options.urgent ? 'assertive' : 'polite');
  root.setAttribute('aria-atomic', 'true');
  if (options.id) root.id = options.id;
  marker.className = 'mazer-status-banner__marker';
  marker.textContent = toneLabel[tone];
  message.className = 'mazer-status-banner__message';
  message.textContent = options.message;
  root.append(marker, message);
  if (options.actionLabel) {
    root.append(createMazerButton({
      label: options.actionLabel,
      tone: 'quiet',
      className: 'mazer-status-banner__action',
      onPress: options.onAction
    }, ownerDocument));
  }
  return root;
};
