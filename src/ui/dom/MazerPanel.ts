export type MazerPanelTone = 'default' | 'elevated';

export interface MazerPanelOptions {
  id?: string;
  className?: string;
  label?: string;
  tone?: MazerPanelTone;
  children?: readonly Node[];
}

/** Creates an opaque, named section suitable for auth/account and settings surfaces. */
export const createMazerPanel = (
  options: MazerPanelOptions = {},
  ownerDocument: Document = document
): HTMLElement => {
  const root = ownerDocument.createElement('section');
  const tone = options.tone ?? 'default';
  root.className = [
    'mazer-panel',
    `mazer-panel--${tone}`,
    options.className
  ].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'MazerPanel';

  if (options.id) {
    root.id = options.id;
  }
  if (options.label) {
    root.setAttribute('aria-label', options.label);
  }
  if (options.children) {
    root.append(...options.children);
  }

  return root;
};
