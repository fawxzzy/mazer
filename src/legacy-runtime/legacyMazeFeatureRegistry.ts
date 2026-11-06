import {
  normalizeLegacyMazeGenerationProfile,
  type LegacyMazeGenerationProfile
} from './legacyMaze';

/**
 * Versioned, data-only inventory of the maze features the legacy generator can
 * produce, plus a pure resolver from a generation profile to the feature ids
 * that profile activates.
 *
 * Purpose: a numeric difficulty profile does not say which structural features
 * a maze was allowed to contain. Telemetry and corpus analysis need a stable,
 * bounded "feature era" label so topology outcomes are not silently mixed
 * across eras. This module is the single traceable source for that label.
 *
 * Design rules:
 * - Data only. Activation is declarative (`LegacyMazeFeatureActivation`); the
 *   evaluator below is the only logic. No generator code is imported or
 *   changed, and nothing here may import legacyProgression.
 * - Additive evolution. A new feature (for example a geometry-budget ladder or
 *   a hazard layer) is a new entry in a registry created by
 *   `defineLegacyMazeFeatureRegistry`. Existing ids must never be renamed or
 *   re-meant under the same version string; bump the version instead.
 * - Profile-driven only. Gates that depend on board size rather than on the
 *   profile are recorded in `runtimeGates` as documentation and are NOT
 *   evaluated here, so "active" means "the profile requests it".
 */

export const LEGACY_MAZE_FEATURE_REGISTRY_VERSION = 'legacy-maze-features.v1';

/**
 * Stamp used when a stored receipt predates the registry. It is a distinct
 * explicit era, never a guess based on timestamps.
 */
export const LEGACY_MAZE_FEATURE_REGISTRY_UNSTAMPED_VERSION = 'pre-registry';

export type LegacyMazeFeatureMode = 'menu' | 'play';

export const LEGACY_MAZE_FEATURE_MODES: readonly LegacyMazeFeatureMode[] = ['play', 'menu'];

/** Generator stage that produces the feature, in execution order within createLegacyMaze. */
export type LegacyMazeFeatureStage =
  | 'checkpoint-path'
  | 'topology-normalization'
  | 'shortcut-bridges'
  | 'route-reinforcement'
  | 'dead-end-prune'
  | 'border-wrap-mandatory'
  | 'border-feeders'
  | 'border-wrap-pairing';

/**
 * Dotted path into the (normalized) generation profile, for example
 * `straightnessBias` or `requiredOppositeBorderConnections.horizontal`.
 * Typed as string so later lanes can reference profile fields that are not in
 * LegacyMazeGenerationProfile yet; the registry test asserts every path used by
 * the canonical registry exists on the current profile.
 */
export type LegacyMazeFeatureProfileField = string;

export type LegacyMazeFeatureActivation =
  | { kind: 'always' }
  | {
      kind: 'field';
      field: LegacyMazeFeatureProfileField;
      test: 'equals' | 'not-null' | 'null' | 'positive' | 'truthy';
      value?: boolean | number | string | null;
    }
  | { kind: 'all'; rules: readonly LegacyMazeFeatureActivation[] }
  | { kind: 'any'; rules: readonly LegacyMazeFeatureActivation[] }
  | { kind: 'not'; rule: LegacyMazeFeatureActivation };

export interface LegacyMazeFeatureDefinition {
  activation: LegacyMazeFeatureActivation;
  /** Plain-language description of the topology this feature adds. */
  description: string;
  /** Generator function that owns the feature (documentation / traceability). */
  generator: string;
  id: string;
  /** Generation modes in which the generator applies this feature. */
  modes: readonly LegacyMazeFeatureMode[];
  /** Profile fields that control whether/how strongly the feature is produced. */
  profileFields: readonly LegacyMazeFeatureProfileField[];
  /** Non-profile gates (board size, etc.) that are documented but not evaluated. */
  runtimeGates: readonly string[];
  stage: LegacyMazeFeatureStage;
}

export interface LegacyMazeFeatureRegistry {
  features: readonly LegacyMazeFeatureDefinition[];
  version: string;
}

const always: LegacyMazeFeatureActivation = { kind: 'always' };
const positive = (field: string): LegacyMazeFeatureActivation => ({ field, kind: 'field', test: 'positive' });
const truthy = (field: string): LegacyMazeFeatureActivation => ({ field, kind: 'field', test: 'truthy' });
const isNull = (field: string): LegacyMazeFeatureActivation => ({ field, kind: 'field', test: 'null' });
const notNull = (field: string): LegacyMazeFeatureActivation => ({ field, kind: 'field', test: 'not-null' });
const equals = (field: string, value: boolean | number | string | null): LegacyMazeFeatureActivation => ({
  field,
  kind: 'field',
  test: 'equals',
  value
});
const all = (...rules: LegacyMazeFeatureActivation[]): LegacyMazeFeatureActivation => ({ kind: 'all', rules });
const any = (...rules: LegacyMazeFeatureActivation[]): LegacyMazeFeatureActivation => ({ kind: 'any', rules });
const not = (rule: LegacyMazeFeatureActivation): LegacyMazeFeatureActivation => ({ kind: 'not', rule });

const BOTH_MODES: readonly LegacyMazeFeatureMode[] = ['play', 'menu'];
const SHORTCUT_SIZE_GATE = 'board linear size > 35 (createLegacyMaze zeroes the shortcut budget at or below 35; lifecycle shortcutStageEnabled mirrors it)';

/**
 * Validates and freezes a registry. Throws on duplicate/empty ids, empty
 * version, or a feature with no modes, so a bad extension fails at module load
 * (and in the registry test) instead of corrupting telemetry.
 */
export const defineLegacyMazeFeatureRegistry = (
  version: string,
  features: readonly LegacyMazeFeatureDefinition[]
): LegacyMazeFeatureRegistry => {
  if (version.trim().length === 0) {
    throw new Error('Legacy maze feature registry requires a non-empty version.');
  }
  const seen = new Set<string>();
  for (const feature of features) {
    if (feature.id.trim().length === 0) {
      throw new Error('Legacy maze feature registry entries require a non-empty id.');
    }
    if (seen.has(feature.id)) {
      throw new Error(`Legacy maze feature registry has duplicate feature id: ${feature.id}`);
    }
    if (feature.modes.length === 0) {
      throw new Error(`Legacy maze feature ${feature.id} must apply to at least one mode.`);
    }
    seen.add(feature.id);
  }
  return Object.freeze({
    features: Object.freeze([...features]),
    version
  });
};

export const LEGACY_MAZE_FEATURE_REGISTRY: LegacyMazeFeatureRegistry = defineLegacyMazeFeatureRegistry(
  LEGACY_MAZE_FEATURE_REGISTRY_VERSION,
  [
    {
      activation: always,
      description: 'Checkpoint-chasing corridor carve that forms the base maze; every generated maze has it.',
      generator: 'createLegacyCheckpointPathMaze',
      id: 'corridor-layout',
      modes: BOTH_MODES,
      profileFields: ['checkpointCountMultiplier', 'checkpointCountOverride', 'minCheckpoints'],
      runtimeGates: [],
      stage: 'checkpoint-path'
    },
    {
      // A single leg only happens when the override is 1 AND the floor allows 1;
      // otherwise the override is clamped up to minCheckpoints (> 1).
      activation: not(all(equals('checkpointCountOverride', 1), equals('minCheckpoints', 1))),
      description: 'Two or more checkpoint legs, so the route bends between waypoints instead of one straight leg.',
      generator: 'createLegacyCheckpointPathMaze',
      id: 'checkpoint-bends',
      modes: BOTH_MODES,
      profileFields: ['checkpointCountOverride', 'minCheckpoints'],
      runtimeGates: [],
      stage: 'checkpoint-path'
    },
    {
      activation: positive('straightnessBias'),
      description: 'Heading-continuation bias that lengthens straight runs and reduces zig-zag.',
      generator: 'createLegacyCheckpointPathMaze',
      id: 'straight-corridor-bias',
      modes: BOTH_MODES,
      profileFields: ['straightnessBias'],
      runtimeGates: [],
      stage: 'checkpoint-path'
    },
    {
      activation: always,
      description: 'Disconnected-component pruning and goal rebasing so the playable graph is one connected component.',
      generator: 'normalizeLegacyPlayableTopology',
      id: 'playable-topology-normalization',
      modes: BOTH_MODES,
      profileFields: [],
      runtimeGates: [],
      stage: 'topology-normalization'
    },
    {
      activation: always,
      description: 'Open 2x2 floor-block normalization (initial pass and again after border stages).',
      generator: 'normalizeLegacyOpenTwoByTwoFloorBlocks',
      id: 'open-floor-block-normalization',
      modes: BOTH_MODES,
      profileFields: [],
      runtimeGates: [],
      stage: 'topology-normalization'
    },
    {
      activation: any(isNull('maxDeadEndCount'), positive('maxDeadEndCount')),
      description: 'Side branches that terminate in dead ends (emergent when uncapped, limited when capped above zero).',
      generator: 'createLegacyCheckpointPathMaze',
      id: 'branch-dead-ends',
      modes: BOTH_MODES,
      profileFields: ['maxDeadEndCount'],
      runtimeGates: [],
      stage: 'checkpoint-path'
    },
    {
      activation: notNull('maxDeadEndCount'),
      description: 'Post-carve cap that prunes excess dead-end leaves (never the solution path).',
      generator: 'pruneLegacyDeadEnds',
      id: 'dead-end-cap',
      modes: BOTH_MODES,
      profileFields: ['maxDeadEndCount'],
      runtimeGates: [],
      stage: 'dead-end-prune'
    },
    {
      activation: positive('shortcutCountMultiplier'),
      description: 'Wall-bridge shortcuts that add loops and alternate routes.',
      generator: 'applyLegacyShortcutBridges',
      id: 'shortcut-bridges',
      modes: BOTH_MODES,
      profileFields: ['shortcutCountMultiplier'],
      runtimeGates: [SHORTCUT_SIZE_GATE],
      stage: 'shortcut-bridges'
    },
    {
      // The reinforcement budget is derived from the resolved shortcut count, so it is
      // zero whenever shortcuts are off even if the multiplier is positive.
      activation: all(positive('shortcutCountMultiplier'), positive('routeQualityReinforcementMultiplier')),
      description: 'Extra bridges that convert single-route solutions into multi-route ones (two passes).',
      generator: 'reinforceLegacyRouteQuality',
      id: 'route-reinforcement',
      modes: BOTH_MODES,
      profileFields: ['shortcutCountMultiplier', 'routeQualityReinforcementMultiplier'],
      runtimeGates: [SHORTCUT_SIZE_GATE],
      stage: 'route-reinforcement'
    },
    {
      activation: truthy('requiredOppositeBorderConnections.horizontal'),
      description: 'Left/right border openings paired across the board so the player can wrap horizontally.',
      generator: 'applyLegacyMandatoryOppositeBorderConnections',
      id: 'edge-wrap-horizontal',
      modes: BOTH_MODES,
      profileFields: ['requiredOppositeBorderConnections.horizontal'],
      runtimeGates: [],
      stage: 'border-wrap-mandatory'
    },
    {
      activation: truthy('requiredOppositeBorderConnections.vertical'),
      description: 'Top/bottom border openings paired across the board so the player can wrap vertically.',
      generator: 'applyLegacyMandatoryOppositeBorderConnections',
      id: 'edge-wrap-vertical',
      modes: BOTH_MODES,
      profileFields: ['requiredOppositeBorderConnections.vertical'],
      runtimeGates: [],
      stage: 'border-wrap-mandatory'
    },
    {
      // legacyMaze.ts forces horizontal pairing for the mandatory stage when exactly one
      // feeder per side is requested alongside a vertical-only wrap profile. This is a
      // hidden coupling, recorded as its own id so cohorts can be split on it.
      activation: all(
        equals('borderFeederTargetPerSide', 1),
        not(truthy('requiredOppositeBorderConnections.horizontal')),
        truthy('requiredOppositeBorderConnections.vertical')
      ),
      description: 'Horizontal wrap pairing forced by a single-feeder, vertical-only wrap profile.',
      generator: 'applyLegacyMandatoryOppositeBorderConnections',
      id: 'edge-wrap-horizontal-feeder-pairing',
      modes: BOTH_MODES,
      profileFields: [
        'borderFeederTargetPerSide',
        'requiredOppositeBorderConnections.horizontal',
        'requiredOppositeBorderConnections.vertical'
      ],
      runtimeGates: [],
      stage: 'border-wrap-mandatory'
    },
    {
      // null means "derive per side from board size" (never zero), so null is active.
      activation: any(isNull('borderFeederTargetPerSide'), positive('borderFeederTargetPerSide')),
      description: 'Perimeter feeder spokes: single-tile border openings carved inward from each side.',
      generator: 'applyLegacyPerimeterFeederConnections',
      id: 'perimeter-feeders',
      modes: BOTH_MODES,
      profileFields: ['borderFeederTargetPerSide', 'requiredOppositeBorderConnections.horizontal', 'requiredOppositeBorderConnections.vertical'],
      runtimeGates: [],
      stage: 'border-feeders'
    },
    {
      activation: any(
        truthy('requiredOppositeBorderConnections.horizontal'),
        truthy('requiredOppositeBorderConnections.vertical')
      ),
      description: 'Opposite-border pairing pass that mirrors existing border openings onto the far side.',
      generator: 'applyLegacyOppositeBorderConnections',
      id: 'border-wrap-pairing',
      modes: BOTH_MODES,
      profileFields: [
        'requiredOppositeBorderConnections.horizontal',
        'requiredOppositeBorderConnections.vertical'
      ],
      runtimeGates: [],
      stage: 'border-wrap-pairing'
    }
  ]
);

const readProfileField = (profile: Readonly<Record<string, unknown>>, field: string): unknown => {
  let cursor: unknown = profile;
  for (const part of field.split('.')) {
    if (cursor === null || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

const evaluateActivation = (
  activation: LegacyMazeFeatureActivation,
  profile: Readonly<Record<string, unknown>>
): boolean => {
  switch (activation.kind) {
    case 'always':
      return true;
    case 'all':
      return activation.rules.every((rule) => evaluateActivation(rule, profile));
    case 'any':
      return activation.rules.some((rule) => evaluateActivation(rule, profile));
    case 'not':
      return !evaluateActivation(activation.rule, profile);
    case 'field': {
      const value = readProfileField(profile, activation.field);
      switch (activation.test) {
        case 'equals':
          return value === activation.value;
        case 'null':
          return value === null;
        case 'not-null':
          return value !== null && value !== undefined;
        case 'positive':
          return typeof value === 'number' && Number.isFinite(value) && value > 0;
        case 'truthy':
          return value === true;
        default:
          return activation.test satisfies never;
      }
    }
    default:
      return activation satisfies never;
  }
};

export interface LegacyMazeActiveFeatureOptions {
  /** Restrict to features that apply in this mode; omit to ignore mode. */
  mode?: LegacyMazeFeatureMode;
  /** Registry to evaluate; defaults to the canonical registry. Used by extensions and tests. */
  registry?: LegacyMazeFeatureRegistry;
}

/**
 * Pure: returns the ids of every feature the profile activates, in registry
 * declaration order (deterministic, so the result is safe to store and diff).
 * The profile is normalized first so a partial or null profile resolves the
 * same way the generator would; unknown extra keys on the input are preserved
 * so extension fields can be evaluated before normalization learns them.
 */
export const resolveLegacyMazeActiveFeatureIds = (
  profile?: Partial<LegacyMazeGenerationProfile> | null,
  options: LegacyMazeActiveFeatureOptions = {}
): string[] => {
  const registry = options.registry ?? LEGACY_MAZE_FEATURE_REGISTRY;
  const effective: Record<string, unknown> = {
    ...(profile ?? {}),
    ...normalizeLegacyMazeGenerationProfile(profile)
  };
  return registry.features
    .filter((feature) => options.mode === undefined || feature.modes.includes(options.mode))
    .filter((feature) => evaluateActivation(feature.activation, effective))
    .map((feature) => feature.id);
};

export interface LegacyMazeFeatureStamp {
  /** Null when the maze carries no generation profile (hand-authored snapshot or unknown). */
  activeFeatureIds: string[] | null;
  featureRegistryVersion: string;
}

/** Builds the bounded era stamp stored on local telemetry receipts. */
export const createLegacyMazeFeatureStamp = (
  profile: Partial<LegacyMazeGenerationProfile> | null | undefined,
  mode?: LegacyMazeFeatureMode,
  registry: LegacyMazeFeatureRegistry = LEGACY_MAZE_FEATURE_REGISTRY
): LegacyMazeFeatureStamp => ({
  activeFeatureIds: profile
    ? resolveLegacyMazeActiveFeatureIds(profile, { mode, registry })
    : null,
  featureRegistryVersion: registry.version
});

/** Every profile field path referenced by a registry, deduplicated and sorted. */
export const listLegacyMazeFeatureProfileFields = (
  registry: LegacyMazeFeatureRegistry = LEGACY_MAZE_FEATURE_REGISTRY
): string[] => Array.from(new Set(registry.features.flatMap((feature) => feature.profileFields))).sort();
