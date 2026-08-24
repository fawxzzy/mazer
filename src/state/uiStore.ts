import { createUiCommandBus, type UiCommand, type UiCommandBus } from './uiCommands';
import { collectUiStateSnapshotViolations, type UiStateSnapshot } from './uiState';

export const DEFAULT_UI_STATE_SNAPSHOT: UiStateSnapshot = Object.freeze({
  primarySurface: 'boot',
  modalSurface: 'none',
  gamePhase: 'idle',
  authPhase: 'unknown',
  connectionPhase: 'online',
  installPhase: 'hidden',
  controlMode: 'keyboard',
  motionMode: 'system',
  effectsQuality: 'balanced'
});

export type UiStateListener = (next: UiStateSnapshot, previous: UiStateSnapshot, command: UiCommand) => void;

export interface UiStore {
  getSnapshot(): UiStateSnapshot;
  dispatch(command: UiCommand): UiStateSnapshot;
  subscribe(listener: UiStateListener): () => void;
}

export class UiStateContractError extends Error {
  readonly violations: readonly unknown[];

  constructor(message: string, violations: readonly unknown[]) {
    super(message);
    this.name = 'UiStateContractError';
    this.violations = violations;
  }
}

export const freezeUiStateSnapshot = (snapshot: unknown): UiStateSnapshot => {
  const violations = collectUiStateSnapshotViolations(snapshot);
  if (violations.length > 0) {
    throw new UiStateContractError('UI state snapshot failed closed.', violations);
  }
  return Object.freeze({ ...(snapshot as UiStateSnapshot) });
};

const patchSnapshot = (snapshot: UiStateSnapshot, patch: Partial<UiStateSnapshot>): UiStateSnapshot => (
  freezeUiStateSnapshot({ ...snapshot, ...patch })
);

const reduceUiState = (snapshot: UiStateSnapshot, command: UiCommand): UiStateSnapshot => {
  switch (command.type) {
    case 'NAVIGATE':
      return patchSnapshot(snapshot, { primarySurface: command.surface, modalSurface: 'none' });
    case 'OPEN_MODAL':
      return patchSnapshot(snapshot, { modalSurface: command.modal });
    case 'CLOSE_MODAL':
      return patchSnapshot(snapshot, { modalSurface: 'none' });
    case 'RETURN_HOME':
      return patchSnapshot(snapshot, { primarySurface: 'home', modalSurface: 'none' });
    case 'SET_CONTROL_MODE':
      return patchSnapshot(snapshot, { controlMode: command.mode });
    case 'SET_PREFERENCE':
      return command.key === 'motionMode'
        ? patchSnapshot(snapshot, { motionMode: command.value })
        : patchSnapshot(snapshot, { effectsQuality: command.value });
    case 'START_RUN':
    case 'CANCEL_GENERATION':
    case 'PAUSE_RUN':
    case 'RESUME_RUN':
    case 'RESET_RUN':
    case 'RESET_PROGRESS':
    case 'SUBMIT_AUTH':
    case 'LOG_OUT':
    case 'INSTALL_APP':
    case 'DISMISS_INSTALL':
    case 'APPLY_UPDATE':
    case 'RETRY_SYSTEM_ACTION':
    case 'DISPATCH_DIRECTIONAL_INTENT':
    case 'RELEASE_DIRECTIONAL_INTENT':
      return snapshot;
    default: {
      const exhaustive: never = command;
      throw new UiStateContractError('Unreachable UI command escaped validation.', [exhaustive]);
    }
  }
};

export const createUiStore = (
  initial: unknown = DEFAULT_UI_STATE_SNAPSHOT,
  commandBus: UiCommandBus = createUiCommandBus()
): UiStore => {
  let snapshot = freezeUiStateSnapshot(initial);
  const listeners = new Set<UiStateListener>();

  commandBus.subscribe((command) => {
    const previous = snapshot;
    const next = reduceUiState(previous, command);
    snapshot = next;
    if (next !== previous) {
      for (const listener of [...listeners]) {
        listener(next, previous, command);
      }
    }
  });

  return Object.freeze({
    getSnapshot: (): UiStateSnapshot => snapshot,
    dispatch: (command: UiCommand): UiStateSnapshot => {
      commandBus.dispatch(command);
      return snapshot;
    },
    subscribe: (listener: UiStateListener): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
};
