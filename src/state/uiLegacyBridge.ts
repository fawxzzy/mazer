/**
 * Mazer UI rework -- Wave 3A live command/state bridge.
 *
 * This is the one authoritative adapter boundary between the live legacy
 * Phaser runtime (MenuScene and friends) and the renderer-independent shared
 * UI contracts in this directory (uiState/uiCommands/uiStore/uiViewModels/
 * uiProfiles/uiLegacyProjection).
 *
 * Architecture rule this module exists to enforce: the legacy runtime
 * remains the authoritative domain/runtime state during this migration wave.
 * getSnapshot()/getViewModels() are always derived fresh from real legacy
 * facts via projectLegacyUiState() -- never from an independently-mutated
 * local reducer that could drift from the live scene. createUiStore()'s own
 * reducer intentionally no-ops most runtime/domain commands (start, pause,
 * resume, reset, auth, install, directional input); this bridge is what
 * actually executes those commands against the real scene through the
 * injected LegacyRuntimeAdapter, then re-projects the resulting real state.
 *
 * This module has no Phaser import and no DOM dependency -- it is testable
 * with a plain fake adapter, and MenuScene.ts is the only call site expected
 * to construct it with a real adapter bound to itself.
 */
import {
  collectUiCommandViolations,
  createUiCommandBus,
  type UiCommand,
  type UiCommandBus,
  type UiCommandType
} from './uiCommands';
import { projectLegacyUiState } from './uiLegacyProjection';
import type { UiStateSnapshot } from './uiState';
import { PLATFORM_PROFILES, type UiPlatformProfile } from './uiProfiles';
import { createUiViewModels, type UiViewModels } from './uiViewModels';

/**
 * The subset of live legacy facts projectLegacyUiState() needs. Field names
 * and value spaces intentionally mirror MenuScene's own private fields
 * (mode, overlay, overlayReturn) and the shared enums (gamePhase, authPhase,
 * etc.) rather than inventing a parallel vocabulary.
 */
export interface LegacyRuntimeFacts {
  readonly mode: 'menu' | 'play';
  readonly overlay: string;
  readonly overlayReturn: string;
  readonly gamePhase: UiStateSnapshot['gamePhase'];
  readonly authPhase: UiStateSnapshot['authPhase'];
  readonly connectionPhase: UiStateSnapshot['connectionPhase'];
  readonly installPhase: UiStateSnapshot['installPhase'];
  readonly controlMode: UiStateSnapshot['controlMode'];
  readonly motionMode: UiStateSnapshot['motionMode'];
  readonly effectsQuality: UiStateSnapshot['effectsQuality'];
}

/**
 * Real runtime operations the bridge can invoke. Each maps to an existing
 * MenuScene method (or an equivalent) -- this interface adds no new
 * behavior of its own, it only names the seam. A method that has no real
 * runtime equivalent yet is simply omitted from a given adapter; dispatch()
 * fails closed with 'unsupported' rather than calling a missing method.
 */
export interface UiLegacyBridgeAdapter {
  getFacts(): LegacyRuntimeFacts;
  openSettings?(): void;
  openAccount?(): void;
  openLeaderboard?(): void;
  closeTopOverlay?(): void;
  startRun?(): void;
  pauseRun?(): void;
  resumeRun?(): void;
  resetRun?(): void;
  resetProgress?(): void;
  returnHome?(): void;
  setControlMode?(mode: UiStateSnapshot['controlMode']): void;
  setPreference?(key: 'motionMode' | 'effectsQuality', value: string): void;
  submitAuth?(intent: string, payload: Readonly<Record<string, string>>): void;
  logOut?(): void;
  installApp?(): void;
  dismissInstall?(): void;
  applyUpdate?(): void;
  retrySystemAction?(): void;
  dispatchDirectionalIntent?(intent: string, source: string): void;
  releaseDirectionalIntent?(source: string): void;
}

export interface UiLegacyBridgeDispatchResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export interface UiLegacyBridgeDiagnostics {
  readonly installed: boolean;
  readonly projectionRevision: number;
  readonly dispatchCount: number;
  readonly lastCommandType: UiCommandType | null;
  readonly lastRefreshReason: string | null;
  readonly currentSnapshot: UiStateSnapshot | null;
  readonly visibleViewModelNames: readonly string[];
  readonly projectionViolationCount: number;
  readonly commandFailureCount: number;
  readonly destroyed: boolean;
}

const factsKey = (facts: LegacyRuntimeFacts): string => JSON.stringify([
  facts.mode, facts.overlay, facts.overlayReturn, facts.gamePhase, facts.authPhase,
  facts.connectionPhase, facts.installPhase, facts.controlMode, facts.motionMode, facts.effectsQuality
]);

const VIEW_MODEL_VISIBILITY_KEYS = [
  'home', 'auth', 'gameplayHud', 'controlSurface', 'settings', 'guide', 'leaderboard', 'result',
  'systemStatus', 'watchPass'
] as const;

export class UiLegacyBridge {
  private readonly adapter: UiLegacyBridgeAdapter;
  private readonly profile: UiPlatformProfile;
  private readonly commandBus: UiCommandBus;
  private snapshot: UiStateSnapshot | null = null;
  private lastFactsKey: string | null = null;
  private projectionRevision = 0;
  private dispatchCount = 0;
  private lastCommandType: UiCommandType | null = null;
  private lastRefreshReason: string | null = null;
  private projectionViolationCount = 0;
  private commandFailureCount = 0;
  private destroyed = false;

  constructor(adapter: UiLegacyBridgeAdapter, profile: UiPlatformProfile = PLATFORM_PROFILES.web) {
    this.adapter = adapter;
    this.profile = profile;
    this.commandBus = createUiCommandBus();
    this.refreshProjection('bridge-installation');
  }

  /** Re-derives the snapshot from real legacy facts. Deduplicates: if the
   * facts are unchanged since the last call, returns the cached snapshot
   * without bumping projectionRevision or allocating a new object -- callers
   * are expected to invoke this at deterministic state boundaries (mode
   * changes, overlay transitions, command completion, etc.), not once per
   * animation frame. */
  refreshProjection(reason: string): UiStateSnapshot {
    if (this.destroyed) {
      throw new Error('UiLegacyBridge.refreshProjection() called after destroy().');
    }
    const facts = this.adapter.getFacts();
    const key = factsKey(facts);
    this.lastRefreshReason = reason;
    if (key === this.lastFactsKey && this.snapshot !== null) {
      return this.snapshot;
    }
    const result = projectLegacyUiState(facts);
    if (!result.ok) {
      this.projectionViolationCount += 1;
      // Fail closed to the last-known-good snapshot rather than throwing out
      // of a live update loop; a boot-time first call has no prior snapshot,
      // so surface the violation instead of fabricating a value.
      if (this.snapshot === null) {
        throw new Error(`UiLegacyBridge initial projection failed: ${JSON.stringify(result.violations)}`);
      }
      return this.snapshot;
    }
    this.snapshot = result.snapshot;
    this.lastFactsKey = key;
    this.projectionRevision += 1;
    return this.snapshot;
  }

  getSnapshot(): UiStateSnapshot {
    if (this.snapshot === null) {
      return this.refreshProjection('lazy-initial-read');
    }
    return this.snapshot;
  }

  getViewModels(): UiViewModels {
    return createUiViewModels(this.getSnapshot(), this.profile);
  }

  /** Validates, then executes, a UiCommand against the real runtime through
   * the injected adapter. Always re-projects after a real action so the
   * returned/cached snapshot reflects what the scene actually did, not what
   * a local reducer assumed would happen. */
  dispatch(command: unknown): UiLegacyBridgeDispatchResult {
    if (this.destroyed) {
      return { ok: false, reason: 'destroyed' };
    }
    const violations = collectUiCommandViolations(command);
    if (violations.length > 0) {
      this.commandFailureCount += 1;
      return { ok: false, reason: 'invalid-command' };
    }
    const typed = command as UiCommand;
    this.dispatchCount += 1;
    this.lastCommandType = typed.type;

    const result = this.execute(typed);
    if (!result.ok) {
      this.commandFailureCount += 1;
      return result;
    }
    // Emit on the validated command bus after a successful real action so any
    // subscriber sees only commands the bridge actually carried out.
    this.commandBus.dispatch(typed);
    this.refreshProjection(`command:${typed.type}`);
    return result;
  }

  subscribe(listener: (command: UiCommand) => void): () => void {
    return this.commandBus.subscribe(listener);
  }

  private execute(command: UiCommand): UiLegacyBridgeDispatchResult {
    const a = this.adapter;
    const unsupported = (why: string): UiLegacyBridgeDispatchResult => ({ ok: false, reason: why });

    switch (command.type) {
      case 'NAVIGATE':
        switch (command.surface) {
          case 'home': return this.call(a.returnHome, 'returnHome-unsupported');
          case 'account': return this.call(a.openAccount, 'openAccount-unsupported');
          case 'settings': return this.call(a.openSettings, 'openSettings-unsupported');
          case 'leaderboard': return this.call(a.openLeaderboard, 'openLeaderboard-unsupported');
          default: return unsupported(`surface:${command.surface}-unsupported`);
        }
      case 'OPEN_MODAL':
        switch (command.modal) {
          case 'confirm-reset-progress': return this.call(a.openAccount ?? a.pauseRun, 'open-modal-unsupported');
          default: return unsupported(`modal:${command.modal}-unsupported`);
        }
      case 'CLOSE_MODAL': return this.call(a.closeTopOverlay, 'closeTopOverlay-unsupported');
      case 'START_RUN': return this.call(a.startRun, 'startRun-unsupported');
      case 'CANCEL_GENERATION': return this.call(a.closeTopOverlay, 'cancelGeneration-unsupported');
      case 'PAUSE_RUN': return this.call(a.pauseRun, 'pauseRun-unsupported');
      case 'RESUME_RUN': return this.call(a.resumeRun, 'resumeRun-unsupported');
      case 'RESET_RUN': return this.call(a.resetRun, 'resetRun-unsupported');
      case 'RESET_PROGRESS': return this.call(a.resetProgress, 'resetProgress-unsupported');
      case 'RETURN_HOME': return this.call(a.returnHome, 'returnHome-unsupported');
      case 'SET_CONTROL_MODE': return this.call(a.setControlMode ? () => a.setControlMode!(command.mode) : undefined, 'setControlMode-unsupported');
      case 'SET_PREFERENCE': return this.call(a.setPreference ? () => a.setPreference!(command.key, command.value) : undefined, 'setPreference-unsupported');
      case 'SUBMIT_AUTH': return this.call(a.submitAuth ? () => a.submitAuth!(command.intent, command.payload) : undefined, 'submitAuth-unsupported');
      case 'LOG_OUT': return this.call(a.logOut, 'logOut-unsupported');
      case 'INSTALL_APP': return this.call(a.installApp, 'installApp-unsupported');
      case 'DISMISS_INSTALL': return this.call(a.dismissInstall, 'dismissInstall-unsupported');
      case 'APPLY_UPDATE': return this.call(a.applyUpdate, 'applyUpdate-unsupported');
      case 'RETRY_SYSTEM_ACTION': return this.call(a.retrySystemAction, 'retrySystemAction-unsupported');
      case 'DISPATCH_DIRECTIONAL_INTENT':
        return this.call(
          a.dispatchDirectionalIntent ? () => a.dispatchDirectionalIntent!(command.intent, command.source) : undefined,
          'dispatchDirectionalIntent-unsupported'
        );
      case 'RELEASE_DIRECTIONAL_INTENT':
        return this.call(
          a.releaseDirectionalIntent ? () => a.releaseDirectionalIntent!(command.source) : undefined,
          'releaseDirectionalIntent-unsupported'
        );
      default: {
        const exhaustive: never = command;
        return unsupported(`unhandled:${String((exhaustive as { type?: string })?.type)}`);
      }
    }
  }

  private call(fn: (() => void) | undefined, reasonIfMissing: string): UiLegacyBridgeDispatchResult {
    if (typeof fn !== 'function') {
      return { ok: false, reason: reasonIfMissing };
    }
    fn();
    return { ok: true };
  }

  getDiagnostics(): UiLegacyBridgeDiagnostics {
    const viewModels = this.destroyed ? null : this.getViewModels();
    return Object.freeze({
      installed: !this.destroyed,
      projectionRevision: this.projectionRevision,
      dispatchCount: this.dispatchCount,
      lastCommandType: this.lastCommandType,
      lastRefreshReason: this.lastRefreshReason,
      currentSnapshot: this.snapshot,
      visibleViewModelNames: viewModels
        ? VIEW_MODEL_VISIBILITY_KEYS.filter((key) => (viewModels[key] as { visible?: boolean }).visible === true)
        : [],
      projectionViolationCount: this.projectionViolationCount,
      commandFailureCount: this.commandFailureCount,
      destroyed: this.destroyed
    });
  }

  destroy(): void {
    this.destroyed = true;
  }
}
