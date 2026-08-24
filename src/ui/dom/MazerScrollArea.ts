export interface MazerScrollAreaOptions {
  label: string;
  id?: string;
  className?: string;
  focusable?: boolean;
  children?: readonly Node[];
}

/** Restores native pan-y scrolling inside the globally touch-locked application shell. */
export const createMazerScrollArea = (
  options: MazerScrollAreaOptions,
  ownerDocument: Document = document
): HTMLElement => {
  const root = ownerDocument.createElement('div');
  root.className = ['mazer-scroll-area', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'MazerScrollArea';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', options.label);
  if (options.focusable ?? true) root.tabIndex = 0;
  if (options.id) root.id = options.id;
  if (options.children) root.append(...options.children);
  return root;
};
