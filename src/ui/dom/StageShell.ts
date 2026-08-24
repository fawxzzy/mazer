export interface StageShellOptions {
  id?: string;
  className?: string;
  label?: string;
  children?: readonly Node[];
}

/** A semantic main-stage container. Layout is CSS-owned; gameplay is not. */
export const createStageShell = (
  options: StageShellOptions = {},
  ownerDocument: Document = document
): HTMLElement => {
  const root = ownerDocument.createElement('main');
  root.className = ['mazer-stage-shell', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'StageShell';

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
