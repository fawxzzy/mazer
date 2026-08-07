/**
 * Mazer UI rework -- Wave 1A shared UI state model.
 *
 * Renderer-independent snapshot shape: both the existing Phaser `MenuScene` and any future DOM
 * shell can be driven from (or project into) the same `UiStateSnapshot`, from the same source of
 * truth, `docs/contracts/mazer-ui-rework-state-model.v1.json`, per decision
 * `renderer-ownership-split` (shared state contracts are owned by neither renderer alone) and
 * decision `no-big-bang-menuscene-rewrite` (MenuScene is decomposed through characterization and
 * adapters that read/write this shape, not replaced in one rewrite).
 *
 * This module is not imported by src/scenes/MenuScene.ts, src/boot/*, or any other live-render
 * path yet -- see docs/architecture/MAZER-UI-REWORK-STATE-MODEL.md for what this wave does and
 * does not do. No legacy state is mapped into this shape yet; that mapping is a later wave's work.
 *
 * Deliberately NOT implemented as `stateModelJson.primarySurfaces as PrimarySurfaceLiteral[]`
 * (casting the JSON import straight into a typed array): a bare `as` cast between an array typed
 * from a JSON import and a hand-written literal-union array type is accepted by `tsc` in *both*
 * directions regardless of whether the value sets actually match (confirmed empirically while
 * writing this module -- neither adding an extra literal to a union nor deleting one the JSON
 * still has caused `tsc --noEmit` to fail). So the categories below are hand-authored `as const`
 * tuples first, with each literal-union type *derived* from its tuple (`(typeof X)[number]`)
 * rather than the reverse. That makes `tests/architecture/ui-state-model-contract.test.ts`'s
 * cross-check (`[...PRIMARY_SURFACES]` against `docs/contracts/...v1.json`'s `primarySurfaces`) a
 * real, independent comparison instead of comparing the JSON to itself.
 */
import stateModel from '../../docs/contracts/mazer-ui-rework-state-model.v1.json';

export const PRIMARY_SURFACES = [
  'boot', 'home', 'account', 'settings', 'guide', 'play', 'result', 'system-error',
  'watch-pass-setup', 'watch-pass-preview'
] as const;
export type PrimarySurfaceLiteral = (typeof PRIMARY_SURFACES)[number];

export const MODAL_SURFACES = [
  'none', 'confirm-reset-run', 'confirm-reset-progress', 'confirm-leave-run',
  'confirm-logout', 'connection-conflict', 'update-required'
] as const;
export type ModalSurfaceLiteral = (typeof MODAL_SURFACES)[number];

export const GAME_PHASES = [
  'idle', 'generating', 'preroll', 'ready', 'active', 'paused', 'complete',
  'reset-pending', 'input-locked', 'failed'
] as const;
export type GamePhaseLiteral = (typeof GAME_PHASES)[number];

export const AUTH_PHASES = ['unknown', 'guest', 'pending', 'authenticated', 'expired', 'failed'] as const;
export type AuthPhaseLiteral = (typeof AUTH_PHASES)[number];

export const CONNECTION_PHASES = ['online', 'offline', 'reconnecting', 'sync-pending', 'conflict'] as const;
export type ConnectionPhaseLiteral = (typeof CONNECTION_PHASES)[number];

export const INSTALL_PHASES = [
  'hidden', 'available', 'manual', 'installing', 'installed', 'dismissed', 'failed'
] as const;
export type InstallPhaseLiteral = (typeof INSTALL_PHASES)[number];

export const CONTROL_MODES = ['stick', 'arrows', 'keyboard', 'hardware'] as const;
export type ControlModeLiteral = (typeof CONTROL_MODES)[number];

export const MOTION_MODES = ['system', 'full', 'reduced'] as const;
export type MotionModeLiteral = (typeof MOTION_MODES)[number];

export const EFFECTS_QUALITY = ['off', 'low', 'balanced', 'high'] as const;
export type EffectsQualityLiteral = (typeof EFFECTS_QUALITY)[number];

/**
 * Re-exported only so a caller can, if it wants to, read the same JSON module this file's
 * hand-authored tuples above are meant to mirror -- not used by this module's own exports.
 * scripts/check-ui-state-model.mjs / tests/architecture/ui-state-model-contract.test.ts do the
 * actual mirroring check.
 */
export const stateModelRegistry = stateModel;

/**
 * Renderer-independent, immutable UI state snapshot. By construction (TypeScript's type system),
 * a value of this shape always has exactly one `primarySurface` and exactly one `modalSurface`
 * (which may be `'none'`) -- this is what satisfies the model's `exactly-one-primary-surface` and
 * `zero-or-one-modal` invariants structurally. The remaining two invariants
 * (`modal-focus-trap`, `domain-state-not-mutated-by-renderers`) are behavioral/runtime properties
 * of whatever eventually consumes this snapshot, not properties `UiStateSnapshot` itself can
 * enforce -- see `structurallyCheckableInvariants` in the JSON contract, which names exactly the
 * two this module claims to satisfy.
 */
export interface UiStateSnapshot {
  readonly primarySurface: PrimarySurfaceLiteral;
  readonly modalSurface: ModalSurfaceLiteral;
  readonly gamePhase: GamePhaseLiteral;
  readonly authPhase: AuthPhaseLiteral;
  readonly connectionPhase: ConnectionPhaseLiteral;
  readonly installPhase: InstallPhaseLiteral;
  readonly controlMode: ControlModeLiteral;
  readonly motionMode: MotionModeLiteral;
  readonly effectsQuality: EffectsQualityLiteral;
}

// Sentinel `field` value used only when the top-level snapshot itself is malformed (not an
// object, or `null`) -- i.e. there is no single per-field culprit to name. Kept distinct from any
// real `keyof UiStateSnapshot` so callers can tell "the whole snapshot was rejected" apart from
// "one field's value was out of range" if they need to.
const SNAPSHOT_ROOT_FIELD = '(snapshot)' as const;

export interface UiStateSnapshotViolation {
  field: keyof UiStateSnapshot | typeof SNAPSHOT_ROOT_FIELD;
  value: unknown;
  message: string;
}

const memberCheck = <T extends string>(
  field: keyof UiStateSnapshot,
  value: unknown,
  allowed: readonly T[]
): UiStateSnapshotViolation | null => (
  (allowed as readonly unknown[]).includes(value)
    ? null
    : { field, value, message: `"${field}" value ${JSON.stringify(value)} is not one of ${JSON.stringify(allowed)}.` }
);

/**
 * Validates that every field of a (possibly untrusted/external) snapshot-shaped value is a member
 * of its registered enum from the state-model contract. Returns an empty array for a valid
 * snapshot. This is the runtime counterpart to the compile-time literal-union types above -- useful
 * once a real value (e.g. deserialized, or produced by a future legacy-state adapter) needs
 * checking rather than trusted at the type level alone.
 *
 * Takes `unknown` rather than `UiStateSnapshot` deliberately: the whole point of a runtime
 * validator is to handle values the type system has not (yet) vouched for. A `UiStateSnapshot`
 * argument is still accepted (it's assignable to `unknown`), so this is strictly wider, not a
 * breaking change for any well-typed caller.
 *
 * Fails closed on a malformed *top-level* value too, not just malformed field values: `null`,
 * `undefined`, or any other non-object top-level value produces a single violation (sentinel field
 * `"(snapshot)"`) instead of throwing. Property access on a non-null primitive (a string, number,
 * boolean, array, or object missing fields) never throws in JS -- it already fell through to
 * per-field violations correctly (`undefined` is simply not a member of any registered enum) -- but
 * `null`/`undefined` throw on property access (`Cannot read properties of null/undefined`) rather
 * than producing a violation, which this top-level guard closes.
 */
export const collectUiStateSnapshotViolations = (snapshot: unknown): UiStateSnapshotViolation[] => {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return [{
      field: SNAPSHOT_ROOT_FIELD,
      value: snapshot,
      message: `snapshot must be a non-null object, received ${snapshot === null ? 'null' : typeof snapshot}.`
    }];
  }

  const candidate = snapshot as Record<keyof UiStateSnapshot, unknown>;
  return [
    memberCheck('primarySurface', candidate.primarySurface, PRIMARY_SURFACES),
    memberCheck('modalSurface', candidate.modalSurface, MODAL_SURFACES),
    memberCheck('gamePhase', candidate.gamePhase, GAME_PHASES),
    memberCheck('authPhase', candidate.authPhase, AUTH_PHASES),
    memberCheck('connectionPhase', candidate.connectionPhase, CONNECTION_PHASES),
    memberCheck('installPhase', candidate.installPhase, INSTALL_PHASES),
    memberCheck('controlMode', candidate.controlMode, CONTROL_MODES),
    memberCheck('motionMode', candidate.motionMode, MOTION_MODES),
    memberCheck('effectsQuality', candidate.effectsQuality, EFFECTS_QUALITY)
  ].filter((entry): entry is UiStateSnapshotViolation => entry !== null);
};
