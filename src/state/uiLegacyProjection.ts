import {
  AUTH_PHASES,
  CONNECTION_PHASES,
  CONTROL_MODES,
  EFFECTS_QUALITY,
  GAME_PHASES,
  INSTALL_PHASES,
  MOTION_MODES,
  collectUiStateSnapshotViolations,
  type UiStateSnapshot
} from './uiState';

export const LEGACY_UI_MODES = ['menu', 'play'] as const;
export const LEGACY_UI_OVERLAYS = [
  'none',
  'options',
  'pause',
  'auth',
  'confirm-progression-reset',
  'leaderboard'
] as const;

export interface LegacyUiProjectionViolation {
  readonly field: string;
  readonly value: unknown;
  readonly message: string;
}

export type LegacyUiProjectionResult =
  | { readonly ok: true; readonly snapshot: UiStateSnapshot }
  | { readonly ok: false; readonly violations: readonly LegacyUiProjectionViolation[] };

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

const inList = (value: unknown, allowed: readonly string[]): boolean => allowed.includes(value as string);

const fieldViolation = (field: string, value: unknown, allowed: readonly string[]): LegacyUiProjectionViolation => ({
  field,
  value,
  message: `${field} must be one of ${allowed.join(', ')}.`
});

export const projectLegacyUiState = (input: unknown): LegacyUiProjectionResult => {
  if (!isPlainRecord(input)) {
    return Object.freeze({
      ok: false,
      violations: Object.freeze([{ field: '(input)', value: input, message: 'legacy projection input must be a canonical plain object.' }])
    });
  }

  const fields: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['mode', LEGACY_UI_MODES],
    ['overlay', LEGACY_UI_OVERLAYS],
    ['gamePhase', GAME_PHASES],
    ['authPhase', AUTH_PHASES],
    ['connectionPhase', CONNECTION_PHASES],
    ['installPhase', INSTALL_PHASES],
    ['controlMode', CONTROL_MODES],
    ['motionMode', MOTION_MODES],
    ['effectsQuality', EFFECTS_QUALITY]
  ];
  const violations = fields
    .filter(([field, allowed]) => !inList(input[field], allowed))
    .map(([field, allowed]) => fieldViolation(field, input[field], allowed));
  if (violations.length > 0) {
    return Object.freeze({ ok: false, violations: Object.freeze(violations) });
  }

  const overlay = input.overlay as (typeof LEGACY_UI_OVERLAYS)[number];
  const primarySurface = (() => {
    switch (overlay) {
      case 'auth': return 'account';
      case 'options': return 'settings';
      case 'leaderboard': return 'leaderboard';
      case 'pause': return 'play';
      default: return input.mode === 'play' ? 'play' : 'home';
    }
  })();
  const modalSurface = overlay === 'confirm-progression-reset' ? 'confirm-reset-progress' : 'none';
  const snapshot: UiStateSnapshot = {
    primarySurface,
    modalSurface,
    gamePhase: overlay === 'pause' ? 'paused' : input.gamePhase as UiStateSnapshot['gamePhase'],
    authPhase: input.authPhase as UiStateSnapshot['authPhase'],
    connectionPhase: input.connectionPhase as UiStateSnapshot['connectionPhase'],
    installPhase: input.installPhase as UiStateSnapshot['installPhase'],
    controlMode: input.controlMode as UiStateSnapshot['controlMode'],
    motionMode: input.motionMode as UiStateSnapshot['motionMode'],
    effectsQuality: input.effectsQuality as UiStateSnapshot['effectsQuality']
  };
  const snapshotViolations = collectUiStateSnapshotViolations(snapshot);
  if (snapshotViolations.length > 0) {
    return Object.freeze({
      ok: false,
      violations: Object.freeze(snapshotViolations.map((entry) => ({
        field: String(entry.field),
        value: entry.value,
        message: entry.message
      })))
    });
  }
  return Object.freeze({ ok: true, snapshot: Object.freeze({ ...snapshot }) });
};
