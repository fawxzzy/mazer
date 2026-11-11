import { getInstallSurfaceState, promptInstallSurface, subscribeInstallSurface, type InstallSurfaceState } from './installSurface';
import {
  resolveInstallGateDecision,
  type InstallGateDecision,
  type InstallGateMode
} from './installPolicy';

export interface MazerInstallGateBootContext {
  forceInstallGate: boolean;
  isLocalhostRuntime: boolean;
  legalRouteRequested: boolean;
  /** Dev/QA Level Preview route (?previewLevel=N): sandboxed, so it is never install-gated. */
  levelPreviewRequested?: boolean;
  oauthCallbackAccepted: boolean;
  oauthCallbackRequested: boolean;
  passwordRecoveryRequested: boolean;
}

/**
 * Boot-level bypasses (the route/host half of the install policy; the
 * runtime half -- standalone, platform, prompt availability -- lives in
 * resolveInstallGateDecision). Localhost is exempt unless ?forceInstallGate=1;
 * legal routes, any OAuth callback request and password recovery must finish
 * wherever they started, so they are never blocked.
 */
export const shouldRunMazerInstallGateForBoot = (context: MazerInstallGateBootContext): boolean => (
  (!context.isLocalhostRuntime || context.forceInstallGate)
  && !context.legalRouteRequested
  && context.levelPreviewRequested !== true
  && !context.oauthCallbackAccepted
  && !context.oauthCallbackRequested
  && !context.passwordRecoveryRequested
);

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
  /** One short line on why installing is worth it; empty for the post-install card. */
  valueLine: string;
  /** At most three short steps; empty for the post-install "open the app" card. */
  steps: string[];
  /** Null when the card has no native action of its own (manual platforms). */
  primaryLabel: string | null;
  primaryAction: 'install' | null;
  showCopyLink: boolean;
}

const INSTALL_TITLE = 'Install Mazer';
const INSTALL_SUBTITLE = 'Mazer only runs as an installed app, not in a browser tab.';
const INSTALL_VALUE_LINE = 'Race through endless mazes, straight from your home screen.';

/** Shown under the Copy link button once the copy attempt has finished. */
export const MAZER_INSTALL_GATE_COPY_FEEDBACK = {
  copied: 'Link copied. Paste it into Safari or Chrome.',
  failed: 'Could not copy the link. Copy the address from your browser instead.'
} as const;

/**
 * Per-platform copy. Short and plain, three steps max. There is deliberately
 * no "skip" / "continue without installing" entry: see installPolicy.ts.
 */
export const MAZER_INSTALL_GATE_COPY: Readonly<Record<InstallGateMode, MazerInstallGateCopy>> = {
  'prompt-available': {
    title: INSTALL_TITLE,
    subtitle: INSTALL_SUBTITLE,
    valueLine: INSTALL_VALUE_LINE,
    steps: [
      'Press Install below.',
      'Confirm in your browser.',
      'Open Mazer from your home screen or desktop.'
    ],
    primaryLabel: 'Install',
    primaryAction: 'install',
    showCopyLink: false
  },
  'manual-desktop-chromium': {
    title: INSTALL_TITLE,
    subtitle: INSTALL_SUBTITLE,
    valueLine: INSTALL_VALUE_LINE,
    steps: [
      'Click the install icon at the end of the address bar, or open the browser menu and choose Install Mazer.',
      'Confirm the install.',
      'Open Mazer from your desktop or Start menu.'
    ],
    primaryLabel: null,
    primaryAction: null,
    showCopyLink: false
  },
  'manual-desktop-other': {
    title: INSTALL_TITLE,
    subtitle: INSTALL_SUBTITLE,
    valueLine: INSTALL_VALUE_LINE,
    steps: [
      'Open this page in Chrome or Edge. In Safari, choose File, then Add to Dock.',
      'In Chrome or Edge, click the install icon in the address bar.',
      'Open Mazer from your desktop, Start menu or Dock.'
    ],
    primaryLabel: null,
    primaryAction: null,
    showCopyLink: true
  },
  'manual-android': {
    title: INSTALL_TITLE,
    subtitle: INSTALL_SUBTITLE,
    valueLine: INSTALL_VALUE_LINE,
    steps: [
      'Open this page in Chrome and tap the three-dot menu.',
      'Choose Install app or Add to Home screen.',
      'Open Mazer from your home screen.'
    ],
    primaryLabel: null,
    primaryAction: null,
    showCopyLink: true
  },
  'manual-ios': {
    title: INSTALL_TITLE,
    subtitle: INSTALL_SUBTITLE,
    valueLine: INSTALL_VALUE_LINE,
    steps: [
      'Tap the Share button in Safari.',
      'Choose Add to Home Screen.',
      'Open Mazer from your home screen.'
    ],
    primaryLabel: null,
    primaryAction: null,
    showCopyLink: false
  },
  'in-app-browser': {
    title: INSTALL_TITLE,
    subtitle: 'Mazer only runs as an installed app, and in-app browsers cannot install it.',
    valueLine: INSTALL_VALUE_LINE,
    steps: [
      'Copy the link below.',
      'Paste it into Safari or Chrome.',
      'Install Mazer from there, then open it from your home screen.'
    ],
    primaryLabel: null,
    primaryAction: null,
    showCopyLink: true
  },
  'installed-open-app': {
    title: 'Mazer is installed',
    subtitle: 'Open it from your home screen or desktop.',
    valueLine: '',
    steps: [],
    primaryLabel: null,
    primaryAction: null,
    showCopyLink: false
  }
};

export const resolveMazerInstallGateCopy = (mode: InstallGateMode): MazerInstallGateCopy => (
  MAZER_INSTALL_GATE_COPY[mode]
);

/**
 * Feeds the live install-surface facts into the pure policy. Route and host
 * bypasses are decided once at boot (shouldRunMazerInstallGateForBoot), so
 * they are fixed to "not bypassed" here: once the gate is running, the only
 * thing that can lift it is the page actually becoming standalone.
 */
export const resolveMazerInstallGateDecision = (state: InstallSurfaceState): InstallGateDecision => (
  resolveInstallGateDecision({
    standalone: state.standalone,
    isLocalhost: false,
    forceGate: false,
    bypassRoute: false,
    userAgentClass: state.platform,
    hasDeferredPrompt: state.canPrompt,
    appInstalled: state.installed && !state.standalone
  })
);

/**
 * Invariant: every state that is not an installed (standalone) display
 * context shows the gate. `hidden` is not a reason to skip it.
 */
export const shouldShowMazerInstallGate = (state: InstallSurfaceState): boolean => (
  resolveMazerInstallGateDecision(state).blocked
);

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
  /** May resolve to whether the copy worked; the card then confirms or reports failure. */
  onCopyLink(): void | boolean | Promise<boolean>;
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

/** Static mini-maze mark: a decorative three-by-three corridor, hidden from assistive tech. */
const MINI_MAZE_SVG = '<svg class="mazer-install-gate-mini-maze" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false"><rect x="2" y="2" width="44" height="44" rx="6" fill="none" stroke="currentColor" stroke-opacity="0.4" stroke-width="2"/><path d="M8 14H30V24H16V34H40" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="14" r="3" fill="currentColor"/></svg>';

const renderValueHtml = (valueLine: string): string => (
  valueLine === ''
    ? ''
    : `<div class="mazer-install-gate-value">${MINI_MAZE_SVG}<p class="mazer-install-gate-value-line">${escapeHtml(valueLine)}</p></div>`
);

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
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', INSTALL_TITLE);

  let renderedMode: InstallGateMode | null = null;

  const render = (state: InstallSurfaceState): void => {
    const decision = resolveMazerInstallGateDecision(state);
    if (!decision.blocked || decision.mode === renderedMode) {
      return;
    }

    renderedMode = decision.mode;
    overlay.setAttribute('data-mazer-install-gate-mode', decision.mode);
    const copy = resolveMazerInstallGateCopy(decision.mode);
    const buttonsHtml = [
      copy.primaryLabel !== null
        ? `<button type="button" class="mazer-install-gate-button mazer-install-gate-button-primary" data-mazer-install-gate-action="${copy.primaryAction}">${escapeHtml(copy.primaryLabel)}</button>`
        : '',
      copy.showCopyLink
        ? '<button type="button" class="mazer-install-gate-button mazer-install-gate-button-secondary" data-mazer-install-gate-action="copy">Copy link</button>'
        : ''
    ].filter(Boolean).join('');

    overlay.innerHTML = `
      <div class="mazer-install-gate-card">
        <strong class="mazer-install-gate-brand">MAZER</strong>
        <h1 class="mazer-install-gate-title">${escapeHtml(copy.title)}</h1>
        <p class="mazer-install-gate-subtitle">${escapeHtml(copy.subtitle)}</p>
        ${renderValueHtml(copy.valueLine)}
        ${renderStepsHtml(copy.steps)}
        <div class="mazer-install-gate-actions">${buttonsHtml}<p class="mazer-install-gate-feedback" data-mazer-install-gate-feedback role="status"></p></div>
      </div>
    `;

    overlay.querySelectorAll<HTMLButtonElement>('[data-mazer-install-gate-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.mazerInstallGateAction;
        if (action === 'install') {
          callbacks.onInstall();
        } else if (action === 'copy') {
          void Promise.resolve(callbacks.onCopyLink()).then((copied) => {
            if (copied === undefined) {
              return;
            }
            const feedback = overlay.querySelector('[data-mazer-install-gate-feedback]');
            if (feedback) {
              feedback.textContent = copied
                ? MAZER_INSTALL_GATE_COPY_FEEDBACK.copied
                : MAZER_INSTALL_GATE_COPY_FEEDBACK.failed;
            }
          });
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

export interface RunMazerInstallGateOptions {
  /** Called once, when the gate overlay is actually about to be shown. */
  onBlocked?: () => void;
}

/**
 * Boot-time orchestration: shows the gate when the live install-surface
 * state is not an installed display context, and keeps it up. The overlay
 * subscribes to the install surface, so a `beforeinstallprompt` that arrives
 * after the card is already on screen upgrades it to an Install button, and
 * `appinstalled` switches it to "open the installed app". The returned
 * promise only resolves if the context itself becomes standalone -- there is
 * no skip. Resolves immediately, with no DOM work, when already standalone.
 */
export const runMazerInstallGate = (
  documentRef: InstallGateDocumentLike,
  options: RunMazerInstallGateOptions = {}
): Promise<void> => {
  const initialState = getInstallSurfaceState();
  if (!shouldShowMazerInstallGate(initialState)) {
    return Promise.resolve();
  }

  options.onBlocked?.();

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
      onCopyLink: () => {
        return copyMazerInstallLink(typeof window === 'undefined' ? '' : window.location.href);
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
