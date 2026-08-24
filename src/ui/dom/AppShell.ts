export interface AppShellOptions {
  id?: string;
  className?: string;
  children?: readonly Node[];
}

/**
 * Creates the safe-area-aware DOM root for future product screens.
 *
 * Wave 2A deliberately does not mount this element or connect it to runtime
 * state. Consumers in later waves own mounting, state projection, and cleanup.
 */
export const createAppShell = (
  options: AppShellOptions = {},
  ownerDocument: Document = document
): HTMLDivElement => {
  const root = ownerDocument.createElement('div');
  root.className = ['mazer-app-shell', options.className].filter(Boolean).join(' ');
  root.dataset.mazerComponent = 'AppShell';

  if (options.id) {
    root.id = options.id;
  }
  if (options.children) {
    root.append(...options.children);
  }

  return root;
};
