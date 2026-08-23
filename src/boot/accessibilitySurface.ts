export const MAZER_ACCESSIBILITY_SURFACE_ID = 'mazer-accessibility-surface';
export const MAZER_ACCESSIBILITY_DESCRIPTION_ID = 'mazer-accessibility-description';
export const MAZER_ACCESSIBILITY_STATUS_ID = 'mazer-accessibility-status';

export const MAZER_ACCESSIBILITY_SHORTCUTS = [
  {
    command: 'start',
    key: 'Enter',
    label: 'Start maze'
  },
  {
    command: 'settings',
    key: 'O',
    label: 'Open settings'
  },
  {
    command: 'pause',
    key: 'P',
    label: 'Pause or resume game'
  },
  {
    command: 'back',
    key: 'Escape',
    label: 'Close dialog or go back'
  }
] as const;

export type MazerAccessibilityShortcut = (typeof MAZER_ACCESSIBILITY_SHORTCUTS)[number];

export interface MazerAccessibilityCanvas {
  setAttribute(name: string, value: string): void;
  tabIndex: number;
}

export const describeMazerAccessibilityCanvas = (): {
  ariaDescriptionId: typeof MAZER_ACCESSIBILITY_DESCRIPTION_ID;
  ariaKeyShortcuts: string;
  ariaLabel: string;
  role: 'application';
  tabIndex: number;
} => ({
  ariaDescriptionId: MAZER_ACCESSIBILITY_DESCRIPTION_ID,
  ariaKeyShortcuts: MAZER_ACCESSIBILITY_SHORTCUTS.map((shortcut) => shortcut.key).join(' '),
  ariaLabel: 'Mazer precision maze game',
  role: 'application',
  tabIndex: 0
});

export const applyMazerCanvasAccessibility = (canvas: MazerAccessibilityCanvas): void => {
  const description = describeMazerAccessibilityCanvas();
  canvas.tabIndex = description.tabIndex;
  canvas.setAttribute('aria-describedby', description.ariaDescriptionId);
  canvas.setAttribute('aria-keyshortcuts', description.ariaKeyShortcuts);
  canvas.setAttribute('aria-label', description.ariaLabel);
  canvas.setAttribute('role', description.role);
};

const dispatchMazerShortcut = (documentRef: Document, key: string): void => {
  documentRef.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key
  }));
};

const activateMazerShortcut = (event: KeyboardEvent, documentRef: Document, key: string): void => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  event.preventDefault();
  dispatchMazerShortcut(documentRef, key);
};

/**
 * Phaser continues to own the board and the actual input commands. This small
 * DOM surface supplies the semantic keyboard entry points and the description
 * that a canvas alone cannot convey. Its controls use the same command keys as
 * the visible game controls, so it cannot invent a parallel gameplay path.
 */
export const installMazerAccessibilitySurface = (
  documentRef: Document,
  canvas: MazerAccessibilityCanvas
): HTMLElement => {
  applyMazerCanvasAccessibility(canvas);

  const existing = documentRef.getElementById(MAZER_ACCESSIBILITY_SURFACE_ID);
  if (existing instanceof HTMLElement) {
    return existing;
  }

  const surface = documentRef.createElement('nav');
  surface.id = MAZER_ACCESSIBILITY_SURFACE_ID;
  surface.setAttribute('aria-label', 'Mazer keyboard controls');
  surface.setAttribute('aria-controls', 'app');

  const description = documentRef.createElement('p');
  description.id = MAZER_ACCESSIBILITY_DESCRIPTION_ID;
  description.className = 'mazer-accessibility-description';
  description.textContent = 'Use Arrow keys or WASD to move through the maze. Press Enter to start, O for settings, P to pause or resume, and Escape to close a dialog.';
  surface.append(description);

  const status = documentRef.createElement('p');
  status.id = MAZER_ACCESSIBILITY_STATUS_ID;
  status.className = 'mazer-accessibility-description';
  status.setAttribute('aria-atomic', 'true');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('role', 'status');
  status.textContent = 'Mazer is ready.';
  surface.append(status);

  for (const shortcut of MAZER_ACCESSIBILITY_SHORTCUTS) {
    const button = documentRef.createElement('button');
    button.className = 'mazer-accessibility-shortcut';
    button.type = 'button';
    button.dataset.mazerAccessibilityCommand = shortcut.command;
    button.setAttribute('aria-keyshortcuts', shortcut.key);
    button.textContent = shortcut.label;
    button.addEventListener('click', () => dispatchMazerShortcut(documentRef, shortcut.key));
    button.addEventListener('keydown', (event) => activateMazerShortcut(event, documentRef, shortcut.key));
    surface.append(button);
  }

  documentRef.body.append(surface);
  return surface;
};
