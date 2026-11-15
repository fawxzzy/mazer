import { AUTH_SURFACE_INSTALL_COPY, AUTH_SURFACE_LABELS } from '../brand/authSurfaceCopy';
import {
  escapeSurfaceHtml,
  renderSurfaceAppIcon,
  renderSurfaceKicker,
  renderSurfaceLegal,
  renderSurfaceNoticeInner,
  renderSurfaceSteps
} from './surfaceMarkup';
import { getInstallSurfaceState, promptInstallSurface, subscribeInstallSurface, type InstallSurfaceState } from './installSurface';
import {
  resolveInstallGateDecision,
  type InstallGateDecision,
  type InstallGateMode
} from './installPolicy';

export interface MazerInstallGateBootContext {
  /** `?forceInstallGate=1`: opts localhost back into the gate. It can only make the gate stricter. */
  forceInstallGate: boolean;
  isLocalhostRuntime: boolean;
  /** Legal route (/privacy, /terms): redirected to the account host before Mazer renders anything. */
  legalRouteRequested: boolean;
  /** Password recovery route: redirected to the account host before Mazer renders anything. */
  passwordRecoveryRequested: boolean;
}

/**
 * Boot-level exemptions (MAZER-PWA-007, docs/ops/MAZER-INSTALL-GATE-ALWAYS-ON-2026-11-14.md). Mazer content is
 * ALWAYS behind the gate in a browser tab, whatever the query string or hash carries: there is deliberately no
 * input for `previewLevel`, `autoSignIn`, `authFixture`, an OAuth callback, a display-mode query or a user agent
 * here. The only exemptions are
 *  - local development (localhost / 127.0.0.1 / ::1), unless ?forceInstallGate=1, and
 *  - the legal and password-recovery routes, which never draw Mazer: boot redirects them to the account host.
 * What lifts the gate in a tab is only an installed display context (resolveInstallGateDecision `standalone`).
 */
export const shouldRunMazerInstallGateForBoot = (context: MazerInstallGateBootContext): boolean => (
  (!context.isLocalhostRuntime || context.forceInstallGate)
  && !context.legalRouteRequested
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
  /** One short line under the title (the approved mock's lead). */
  lead: string;
  /** At most three short steps, each with at most one inline icon token ({share}, {add}, {dots}); empty for the
   *  prompt card (it has the Install button instead) and the post-install card. */
  steps: string[];
  /** Null when the card has no native action of its own (manual platforms). */
  primaryLabel: string | null;
  primaryAction: 'install' | null;
  showCopyLink: boolean;
}

/** Shown in the card's message box once the copy attempt has finished. */
export const MAZER_INSTALL_GATE_COPY_FEEDBACK = {
  copied: AUTH_SURFACE_INSTALL_COPY.copied,
  failed: AUTH_SURFACE_INSTALL_COPY.copyFailed
} as const;

const manualCopy = (lead: string, steps: readonly string[], showCopyLink = false): MazerInstallGateCopy => ({
  title: AUTH_SURFACE_INSTALL_COPY.title,
  lead,
  steps: [...steps],
  primaryLabel: null,
  primaryAction: null,
  showCopyLink
});

/**
 * Per-mode copy (Auth Surface v2, src/brand/authSurfaceCopy.ts; the step wording is shared with Fitness). Short and
 * plain, three steps max. There is deliberately no "skip" / "continue without installing" entry: see installPolicy.ts.
 * The in-app browser card and the post-install card vary by platform: see resolveMazerInstallGateCopy.
 */
export const MAZER_INSTALL_GATE_COPY: Readonly<Record<InstallGateMode, MazerInstallGateCopy>> = {
  'prompt-available': {
    title: AUTH_SURFACE_INSTALL_COPY.title,
    lead: AUTH_SURFACE_INSTALL_COPY.leadPrompt,
    steps: [],
    primaryLabel: AUTH_SURFACE_LABELS.install,
    primaryAction: 'install',
    showCopyLink: false
  },
  'manual-desktop-chromium': manualCopy(AUTH_SURFACE_INSTALL_COPY.leadDesktop, AUTH_SURFACE_INSTALL_COPY.stepsDesktopChromium),
  'manual-desktop-other': manualCopy(AUTH_SURFACE_INSTALL_COPY.leadDesktopOther, AUTH_SURFACE_INSTALL_COPY.stepsDesktopOther, true),
  'manual-android': manualCopy(AUTH_SURFACE_INSTALL_COPY.leadHomeScreen, AUTH_SURFACE_INSTALL_COPY.stepsAndroid),
  'manual-ios': manualCopy(AUTH_SURFACE_INSTALL_COPY.leadHomeScreen, AUTH_SURFACE_INSTALL_COPY.stepsIos),
  'in-app-browser': manualCopy(AUTH_SURFACE_INSTALL_COPY.leadInAppIos, AUTH_SURFACE_INSTALL_COPY.stepsInAppIos, true),
  'installed-open-app': {
    title: AUTH_SURFACE_INSTALL_COPY.installedTitle,
    lead: AUTH_SURFACE_INSTALL_COPY.installedLead,
    steps: [],
    primaryLabel: null,
    primaryAction: null,
    showCopyLink: false
  }
};

/** `platform` refines two cards: Android in-app browsers say Chrome, and a desktop install opens from the desktop. */
export const resolveMazerInstallGateCopy = (
  mode: InstallGateMode,
  platform: InstallSurfaceState['platform'] | null = null
): MazerInstallGateCopy => {
  if (mode === 'in-app-browser' && platform === 'android-in-app') {
    return manualCopy(AUTH_SURFACE_INSTALL_COPY.leadInAppAndroid, AUTH_SURFACE_INSTALL_COPY.stepsInAppAndroid, true);
  }
  if (mode === 'installed-open-app' && platform !== null && platform.startsWith('desktop')) {
    return { ...MAZER_INSTALL_GATE_COPY[mode], lead: AUTH_SURFACE_INSTALL_COPY.installedDesktopLead };
  }
  return MAZER_INSTALL_GATE_COPY[mode];
};

/**
 * Feeds the live install-surface facts into the pure policy. The host exemption is decided once at boot
 * (shouldRunMazerInstallGateForBoot), so it is fixed to "not exempt" here: once the gate is running, the only
 * thing that can lift it is the page actually becoming standalone.
 */
export const resolveMazerInstallGateDecision = (state: InstallSurfaceState): InstallGateDecision => (
  resolveInstallGateDecision({
    standalone: state.standalone,
    isLocalhost: false,
    forceGate: false,
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

const removeInstallGateOverlay = (documentRef: InstallGateDocumentLike): void => {
  const existing = documentRef.getElementById(MAZER_INSTALL_GATE_OVERLAY_ID);
  if (existing) {
    existing.remove();
  }
};

/**
 * The card markup (Auth Surface v2 anatomy, src/boot/surfaceMarkup.ts). Install cards: app icon, kicker, title, lead,
 * steps, the reserved message box (only where a Copy link button can fill it), Privacy | Terms, one dock button. The
 * post-install card is the status layout: kicker, centred app icon, title, lead. It has no "Open Mazer" button: a
 * browser tab cannot open the installed app.
 */
export const renderMazerInstallGateCardHtml = (copy: MazerInstallGateCopy, mode: InstallGateMode): string => {
  if (mode === 'installed-open-app') {
    return `
      <div class="mazer-surface mazer-surface-status mazer-install-gate-card">
        ${renderSurfaceKicker()}
        <div class="mazer-surface-stat">
          ${renderSurfaceAppIcon('mark')}
          <h1 class="mazer-surface-title">${escapeSurfaceHtml(copy.title)}</h1>
          <p class="mazer-surface-lead">${escapeSurfaceHtml(copy.lead)}</p>
        </div>
      </div>
    `;
  }
  const dock = copy.primaryLabel !== null
    ? `<button type="button" class="mazer-surface-dock" data-mazer-install-gate-action="${copy.primaryAction}">${escapeSurfaceHtml(copy.primaryLabel)}</button>`
    : copy.showCopyLink
      ? `<button type="button" class="mazer-surface-dock" data-mazer-install-gate-action="copy">${AUTH_SURFACE_LABELS.copyLink}</button>`
      : '';
  const slot = copy.showCopyLink
    ? '<div class="mazer-surface-slot"><p class="mazer-surface-notice" data-mazer-install-gate-feedback role="status"></p></div>'
    : '';
  return `
    <div class="mazer-surface mazer-install-gate-card">
      ${renderSurfaceAppIcon('top')}
      ${renderSurfaceKicker()}
      <h1 class="mazer-surface-title">${escapeSurfaceHtml(copy.title)}</h1>
      <p class="mazer-surface-lead">${escapeSurfaceHtml(copy.lead)}</p>
      <div class="mazer-surface-body">${renderSurfaceSteps(copy.steps)}</div>
      ${slot}
      ${renderSurfaceLegal()}
      ${dock}
    </div>
  `;
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
  overlay.setAttribute('aria-label', AUTH_SURFACE_INSTALL_COPY.title);

  let renderedKey: string | null = null;

  const render = (state: InstallSurfaceState): void => {
    const decision = resolveMazerInstallGateDecision(state);
    const key = `${decision.mode}:${state.platform}`;
    if (!decision.blocked || key === renderedKey) {
      return;
    }

    renderedKey = key;
    overlay.setAttribute('data-mazer-install-gate-mode', decision.mode);
    overlay.innerHTML = renderMazerInstallGateCardHtml(resolveMazerInstallGateCopy(decision.mode, state.platform), decision.mode);

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
              feedback.setAttribute('data-tone', copied ? 'success' : 'error');
              feedback.innerHTML = renderSurfaceNoticeInner(
                copied ? 'success' : 'error',
                copied ? MAZER_INSTALL_GATE_COPY_FEEDBACK.copied : MAZER_INSTALL_GATE_COPY_FEEDBACK.failed
              );
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
