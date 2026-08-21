import { getInstallSurfaceState, promptInstallSurface, subscribeInstallSurface, type InstallSurfaceState } from './installSurface';

export const copyMazerInstallLink = async (url: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fall through to the execCommand fallback below.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const input = document.createElement('textarea');
  input.value = url;
  input.setAttribute('readonly', '');
  input.style.position = 'absolute';
  input.style.left = '-9999px';
  document.body.append(input);
  input.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  input.remove();
  return copied;
};

export const MAZER_INSTALL_GATE_OVERLAY_ID = 'mazer-install-gate-overlay';

export interface MazerInstallGateCopy {
  title: string;
  subtitle: string;
  steps: string[];
  /** Null when the gate has no forward action of its own (the hard iOS in-app-browser block -- the only way through is to actually leave the in-app browser). */
  primaryLabel: string | null;
  primaryAction: 'install' | 'continue' | null;
  /** A "Continue without installing" style skip is always offered alongside an install-capable primary action, but never for the hard block. */
  showSkip: boolean;
  showCopyLink: boolean;
}

// Shown while the app is still deciding whether to gate at all (before the
// first installSurface state is known) -- kept intentionally blank/neutral
// rather than flashing a specific mode's copy for one frame.
export const shouldShowMazerInstallGate = (state: InstallSurfaceState): boolean => state.mode !== 'hidden';

export const resolveMazerInstallGateCopy = (state: InstallSurfaceState): MazerInstallGateCopy => {
  if (state.mode === 'ios-open-in-browser') {
    return {
      title: 'Open Mazer in Safari',
      subtitle: 'This link opened inside another app, which can’t install Mazer to your Home Screen.',
      steps: [
        'Tap the ••• or Share icon',
        'Choose "Open in Safari"',
        'Then add Mazer to your Home Screen from there'
      ],
      primaryLabel: null,
      primaryAction: null,
      showSkip: false,
      showCopyLink: true
    };
  }

  if (state.mode === 'available') {
    return {
      title: 'Install Mazer',
      subtitle: 'Play full-screen, offline-ready, right from your Home Screen.',
      steps: [
        'Tap Install below',
        'Confirm the browser prompt',
        'Open Mazer from its new Home Screen icon'
      ],
      primaryLabel: 'Install',
      primaryAction: 'install',
      showSkip: true,
      showCopyLink: false
    };
  }

  if (state.mode === 'manual') {
    return {
      title: 'Add Mazer to your Home Screen',
      subtitle: state.instruction ?? 'Use your browser menu to add Mazer to your Home Screen.',
      steps: [
        'Tap the Share button',
        'Choose "Add to Home Screen"',
        'Open Mazer from the new Home Screen icon'
      ],
      primaryLabel: 'Continue to Mazer',
      primaryAction: 'continue',
      showSkip: false,
      showCopyLink: false
    };
  }

  return {
    title: 'Install Mazer',
    subtitle: 'Play full-screen, offline-ready, right from your Home Screen.',
    steps: [],
    primaryLabel: 'Continue to Mazer',
    primaryAction: 'continue',
    showSkip: false,
    showCopyLink: false
  };
};

interface InstallGateDocumentLike {
  createElement: Document['createElement'];
  getElementById: Document['getElementById'];
  body: { append(node: Node): void };
}

export interface MazerInstallGateHandle {
  destroy(): void;
  update(state: InstallSurfaceState): void;
}

export interface MazerInstallGateCallbacks {
  onContinue(): void;
  onCopyLink(): void;
  onInstall(): void;
}

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const renderStepsHtml = (steps: readonly string[]): string => {
  if (steps.length <= 0) {
    return '';
  }

  const items = steps.map((step, index) => (
    `<li><span class="mazer-install-gate-step-index">${index + 1}</span><span>${escapeHtml(step)}</span></li>`
  )).join('');

  return `<ol class="mazer-install-gate-steps">${items}</ol>`;
};

const removeInstallGateOverlay = (documentRef: InstallGateDocumentLike): void => {
  const existing = documentRef.getElementById(MAZER_INSTALL_GATE_OVERLAY_ID);
  if (existing) {
    existing.remove();
  }
};

export const installMazerInstallGate = (
  documentRef: InstallGateDocumentLike,
  initialState: InstallSurfaceState,
  callbacks: MazerInstallGateCallbacks
): MazerInstallGateHandle => {
  removeInstallGateOverlay(documentRef);

  const overlay = documentRef.createElement('section');
  overlay.id = MAZER_INSTALL_GATE_OVERLAY_ID;
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Install Mazer');

  const render = (state: InstallSurfaceState): void => {
    const copy = resolveMazerInstallGateCopy(state);
    const buttonsHtml = [
      copy.primaryLabel !== null
        ? `<button type="button" class="mazer-install-gate-button mazer-install-gate-button-primary" data-mazer-install-gate-action="${copy.primaryAction}">${escapeHtml(copy.primaryLabel)}</button>`
        : '',
      copy.showCopyLink
        ? '<button type="button" class="mazer-install-gate-button mazer-install-gate-button-secondary" data-mazer-install-gate-action="copy">Copy Link</button>'
        : '',
      copy.showSkip
        ? '<button type="button" class="mazer-install-gate-button mazer-install-gate-button-skip" data-mazer-install-gate-action="continue">Continue without installing</button>'
        : ''
    ].filter(Boolean).join('');

    overlay.innerHTML = `
      <div class="mazer-install-gate-card">
        <strong class="mazer-install-gate-title">${escapeHtml(copy.title)}</strong>
        <span class="mazer-install-gate-subtitle">${escapeHtml(copy.subtitle)}</span>
        ${renderStepsHtml(copy.steps)}
        <div class="mazer-install-gate-actions">${buttonsHtml}</div>
      </div>
    `;

    overlay.querySelectorAll<HTMLButtonElement>('[data-mazer-install-gate-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.mazerInstallGateAction;
        if (action === 'install') {
          callbacks.onInstall();
        } else if (action === 'copy') {
          callbacks.onCopyLink();
        } else if (action === 'continue') {
          callbacks.onContinue();
        }
      });
    });
  };

  render(initialState);
  documentRef.body.append(overlay);

  return {
    destroy: () => removeInstallGateOverlay(documentRef),
    update: render
  };
};

/**
 * Boot-time orchestration: shows the gate (if installSurface's current state
 * calls for one) and resolves once the player either continues past it,
 * installs, or the surface otherwise transitions to 'hidden' on its own
 * (e.g. the native prompt was accepted and 'appinstalled' fired). Resolves
 * immediately, with no DOM work at all, when nothing needs to be shown --
 * this is the thing main.ts awaits before creating the Phaser game, so the
 * common case (already installed, or already dismissed) must stay cheap.
 */
export const runMazerInstallGate = (documentRef: InstallGateDocumentLike): Promise<void> => {
  const initialState = getInstallSurfaceState();
  if (!shouldShowMazerInstallGate(initialState)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let resolved = false;
    let unsubscribe: (() => void) | null = null;

    const finish = (): void => {
      if (resolved) {
        return;
      }
      resolved = true;
      handle.destroy();
      unsubscribe?.();
      resolve();
    };

    const handle = installMazerInstallGate(documentRef, initialState, {
      onContinue: finish,
      onCopyLink: () => {
        void copyMazerInstallLink(typeof window === 'undefined' ? '' : window.location.href);
      },
      onInstall: () => {
        void promptInstallSurface();
      }
    });

    unsubscribe = subscribeInstallSurface((nextState) => {
      if (!shouldShowMazerInstallGate(nextState)) {
        finish();
        return;
      }
      handle.update(nextState);
    });
  });
};
