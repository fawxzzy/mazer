import {
  CONTROL_MODES,
  EFFECTS_QUALITY,
  MODAL_SURFACES,
  MOTION_MODES,
  PRIMARY_SURFACES,
  type ControlModeLiteral,
  type EffectsQualityLiteral,
  type ModalSurfaceLiteral,
  type MotionModeLiteral,
  type PrimarySurfaceLiteral
} from './uiState';

export const UI_COMMAND_TYPES = [
  'NAVIGATE',
  'OPEN_MODAL',
  'CLOSE_MODAL',
  'START_RUN',
  'CANCEL_GENERATION',
  'PAUSE_RUN',
  'RESUME_RUN',
  'RESET_RUN',
  'RESET_PROGRESS',
  'RETURN_HOME',
  'SET_PREFERENCE',
  'SET_CONTROL_MODE',
  'SUBMIT_AUTH',
  'LOG_OUT',
  'INSTALL_APP',
  'DISMISS_INSTALL',
  'APPLY_UPDATE',
  'RETRY_SYSTEM_ACTION',
  'DISPATCH_DIRECTIONAL_INTENT',
  'RELEASE_DIRECTIONAL_INTENT'
] as const;

export type UiCommandType = (typeof UI_COMMAND_TYPES)[number];

export const AUTH_INTENTS = [
  'sign-in',
  'create-account',
  'request-password-reset',
  'update-password'
] as const;
export type AuthIntent = (typeof AUTH_INTENTS)[number];

export const CARDINAL_DIRECTIONS = ['up', 'right', 'down', 'left'] as const;
export type CardinalDirection = (typeof CARDINAL_DIRECTIONS)[number];

export const DIRECTIONAL_INTENT_SOURCES = ['keyboard', 'touch', 'pointer', 'hardware', 'qa'] as const;
export type DirectionalIntentSource = (typeof DIRECTIONAL_INTENT_SOURCES)[number];

export type UiCommand =
  | { readonly type: 'NAVIGATE'; readonly surface: PrimarySurfaceLiteral }
  | { readonly type: 'OPEN_MODAL'; readonly modal: Exclude<ModalSurfaceLiteral, 'none'> }
  | { readonly type: 'CLOSE_MODAL' }
  | { readonly type: 'START_RUN' }
  | { readonly type: 'CANCEL_GENERATION' }
  | { readonly type: 'PAUSE_RUN' }
  | { readonly type: 'RESUME_RUN' }
  | { readonly type: 'RESET_RUN' }
  | { readonly type: 'RESET_PROGRESS' }
  | { readonly type: 'RETURN_HOME' }
  | { readonly type: 'SET_PREFERENCE'; readonly key: 'motionMode'; readonly value: MotionModeLiteral }
  | { readonly type: 'SET_PREFERENCE'; readonly key: 'effectsQuality'; readonly value: EffectsQualityLiteral }
  | { readonly type: 'SET_CONTROL_MODE'; readonly mode: ControlModeLiteral }
  | { readonly type: 'SUBMIT_AUTH'; readonly intent: AuthIntent; readonly payload: Readonly<Record<string, string>> }
  | { readonly type: 'LOG_OUT' }
  | { readonly type: 'INSTALL_APP' }
  | { readonly type: 'DISMISS_INSTALL' }
  | { readonly type: 'APPLY_UPDATE' }
  | { readonly type: 'RETRY_SYSTEM_ACTION' }
  | {
      readonly type: 'DISPATCH_DIRECTIONAL_INTENT';
      readonly intent: CardinalDirection;
      readonly source: DirectionalIntentSource;
    }
  | { readonly type: 'RELEASE_DIRECTIONAL_INTENT'; readonly source: DirectionalIntentSource };

export interface UiCommandViolation {
  readonly path: string;
  readonly value: unknown;
  readonly message: string;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
};

const expectedKeysByType: Readonly<Record<UiCommandType, readonly string[]>> = Object.freeze({
  NAVIGATE: ['type', 'surface'],
  OPEN_MODAL: ['type', 'modal'],
  CLOSE_MODAL: ['type'],
  START_RUN: ['type'],
  CANCEL_GENERATION: ['type'],
  PAUSE_RUN: ['type'],
  RESUME_RUN: ['type'],
  RESET_RUN: ['type'],
  RESET_PROGRESS: ['type'],
  RETURN_HOME: ['type'],
  SET_PREFERENCE: ['type', 'key', 'value'],
  SET_CONTROL_MODE: ['type', 'mode'],
  SUBMIT_AUTH: ['type', 'intent', 'payload'],
  LOG_OUT: ['type'],
  INSTALL_APP: ['type'],
  DISMISS_INSTALL: ['type'],
  APPLY_UPDATE: ['type'],
  RETRY_SYSTEM_ACTION: ['type'],
  DISPATCH_DIRECTIONAL_INTENT: ['type', 'intent', 'source'],
  RELEASE_DIRECTIONAL_INTENT: ['type', 'source']
});

const hasOnlyExpectedKeys = (candidate: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(candidate).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
};

const memberOf = (value: unknown, allowed: readonly string[]): boolean => allowed.includes(value as string);

export const collectUiCommandViolations = (command: unknown): UiCommandViolation[] => {
  if (!isPlainRecord(command)) {
    return [{ path: '(command)', value: command, message: 'command must be a canonical plain object.' }];
  }

  if (!memberOf(command.type, UI_COMMAND_TYPES)) {
    return [{ path: 'type', value: command.type, message: 'command type is not registered.' }];
  }

  const type = command.type as UiCommandType;
  const violations: UiCommandViolation[] = [];
  if (!hasOnlyExpectedKeys(command, expectedKeysByType[type])) {
    violations.push({
      path: '(command)',
      value: Object.keys(command),
      message: `command ${type} must contain exactly ${expectedKeysByType[type].join(', ')}.`
    });
  }

  switch (type) {
    case 'NAVIGATE':
      if (!memberOf(command.surface, PRIMARY_SURFACES)) {
        violations.push({ path: 'surface', value: command.surface, message: 'surface is not registered.' });
      }
      break;
    case 'OPEN_MODAL':
      if (!memberOf(command.modal, MODAL_SURFACES) || command.modal === 'none') {
        violations.push({ path: 'modal', value: command.modal, message: 'modal must be a registered non-none modal.' });
      }
      break;
    case 'SET_PREFERENCE':
      if (command.key === 'motionMode') {
        if (!memberOf(command.value, MOTION_MODES)) {
          violations.push({ path: 'value', value: command.value, message: 'motionMode preference is not registered.' });
        }
      } else if (command.key === 'effectsQuality') {
        if (!memberOf(command.value, EFFECTS_QUALITY)) {
          violations.push({ path: 'value', value: command.value, message: 'effectsQuality preference is not registered.' });
        }
      } else {
        violations.push({ path: 'key', value: command.key, message: 'preference key is not UI-owned.' });
      }
      break;
    case 'SET_CONTROL_MODE':
      if (!memberOf(command.mode, CONTROL_MODES)) {
        violations.push({ path: 'mode', value: command.mode, message: 'control mode is not registered.' });
      }
      break;
    case 'SUBMIT_AUTH':
      if (!memberOf(command.intent, AUTH_INTENTS)) {
        violations.push({ path: 'intent', value: command.intent, message: 'auth intent is not registered.' });
      }
      if (!isPlainRecord(command.payload) || !Object.values(command.payload).every((value) => typeof value === 'string')) {
        violations.push({ path: 'payload', value: command.payload, message: 'auth payload must be a plain string record.' });
      }
      break;
    case 'DISPATCH_DIRECTIONAL_INTENT':
      if (!memberOf(command.intent, CARDINAL_DIRECTIONS)) {
        violations.push({ path: 'intent', value: command.intent, message: 'directional intent must be cardinal.' });
      }
      if (!memberOf(command.source, DIRECTIONAL_INTENT_SOURCES)) {
        violations.push({ path: 'source', value: command.source, message: 'directional source is not registered.' });
      }
      break;
    case 'RELEASE_DIRECTIONAL_INTENT':
      if (!memberOf(command.source, DIRECTIONAL_INTENT_SOURCES)) {
        violations.push({ path: 'source', value: command.source, message: 'directional source is not registered.' });
      }
      break;
    case 'CLOSE_MODAL':
    case 'START_RUN':
    case 'CANCEL_GENERATION':
    case 'PAUSE_RUN':
    case 'RESUME_RUN':
    case 'RESET_RUN':
    case 'RESET_PROGRESS':
    case 'RETURN_HOME':
    case 'LOG_OUT':
    case 'INSTALL_APP':
    case 'DISMISS_INSTALL':
    case 'APPLY_UPDATE':
    case 'RETRY_SYSTEM_ACTION':
      break;
    default: {
      const exhaustive: never = type;
      return [{ path: 'type', value: exhaustive, message: 'unhandled command type.' }];
    }
  }

  return violations;
};

export const isUiCommand = (command: unknown): command is UiCommand => collectUiCommandViolations(command).length === 0;

export type UiCommandListener = (command: UiCommand) => void;

export interface UiCommandBus {
  dispatch(command: UiCommand): void;
  subscribe(listener: UiCommandListener): () => void;
}

export class UiCommandContractError extends Error {
  readonly violations: readonly UiCommandViolation[];

  constructor(violations: readonly UiCommandViolation[]) {
    super('UI command failed closed.');
    this.name = 'UiCommandContractError';
    this.violations = violations;
  }
}

const cloneAndFreezeUiCommand = (command: UiCommand): UiCommand => {
  if (command.type === 'SUBMIT_AUTH') {
    return Object.freeze({
      ...command,
      payload: Object.freeze({ ...command.payload })
    });
  }
  return Object.freeze({ ...command });
};

export const createUiCommandBus = (): UiCommandBus => {
  const listeners = new Set<UiCommandListener>();
  return Object.freeze({
    dispatch: (command: UiCommand): void => {
      const violations = collectUiCommandViolations(command);
      if (violations.length > 0) {
        throw new UiCommandContractError(violations);
      }
      const immutableCommand = cloneAndFreezeUiCommand(command);
      for (const listener of [...listeners]) {
        listener(immutableCommand);
      }
    },
    subscribe: (listener: UiCommandListener): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
};
