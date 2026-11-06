import { describe, expect, test } from 'vitest';
import {
  LEGACY_MAZE_FEATURE_MODES,
  LEGACY_MAZE_FEATURE_REGISTRY,
  LEGACY_MAZE_FEATURE_REGISTRY_VERSION,
  createLegacyMazeFeatureStamp,
  defineLegacyMazeFeatureRegistry,
  listLegacyMazeFeatureProfileFields,
  resolveLegacyMazeActiveFeatureIds,
  type LegacyMazeFeatureDefinition
} from '../../src/legacy-runtime/legacyMazeFeatureRegistry';
import {
  normalizeLegacyMazeGenerationProfile,
  type LegacyMazeGenerationProfile
} from '../../src/legacy-runtime/legacyMaze';

// Literal profiles on purpose: these pin registry behavior for representative
// profile shapes without depending on the progression ladder, which other lanes
// are free to retune.
const corridorProfile: LegacyMazeGenerationProfile = {
  borderFeederTargetPerSide: 0,
  checkpointCountMultiplier: 0.42,
  checkpointCountOverride: 1,
  maxDeadEndCount: 0,
  minCheckpoints: 1,
  requiredOppositeBorderConnections: { horizontal: false, vertical: false },
  routeQualityReinforcementMultiplier: 0,
  shortcutCountMultiplier: 0,
  straightnessBias: 0.88
};

const wrapRequiredProfile: LegacyMazeGenerationProfile = {
  borderFeederTargetPerSide: 1,
  checkpointCountMultiplier: 0.86,
  checkpointCountOverride: null,
  maxDeadEndCount: null,
  minCheckpoints: 4,
  requiredOppositeBorderConnections: { horizontal: true, vertical: true },
  routeQualityReinforcementMultiplier: 0.7,
  shortcutCountMultiplier: 0.62,
  straightnessBias: 0
};

const verticalOnlyFeederProfile: LegacyMazeGenerationProfile = {
  ...wrapRequiredProfile,
  borderFeederTargetPerSide: 1,
  checkpointCountOverride: 40,
  maxDeadEndCount: 13,
  requiredOppositeBorderConnections: { horizontal: false, vertical: true },
  straightnessBias: 0.12
};

const flattenProfilePaths = (value: unknown, prefix = ''): string[] => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, child]) => flattenProfilePaths(child, prefix ? `${prefix}.${key}` : key))
    : [prefix]
);

describe('legacy maze feature registry', () => {
  test('has a stable version and a well-formed, unique feature list', () => {
    expect(LEGACY_MAZE_FEATURE_REGISTRY.version).toBe(LEGACY_MAZE_FEATURE_REGISTRY_VERSION);
    expect(LEGACY_MAZE_FEATURE_REGISTRY_VERSION).toBe('legacy-maze-features.v1');
    const ids = LEGACY_MAZE_FEATURE_REGISTRY.features.map((feature) => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
    for (const feature of LEGACY_MAZE_FEATURE_REGISTRY.features) {
      expect(feature.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(feature.description.length).toBeGreaterThan(0);
      expect(feature.generator.length).toBeGreaterThan(0);
      expect(feature.stage.length).toBeGreaterThan(0);
      expect(feature.modes.length).toBeGreaterThan(0);
      for (const mode of feature.modes) {
        expect(LEGACY_MAZE_FEATURE_MODES).toContain(mode);
      }
    }
    expect(Object.isFrozen(LEGACY_MAZE_FEATURE_REGISTRY)).toBe(true);
    expect(Object.isFrozen(LEGACY_MAZE_FEATURE_REGISTRY.features)).toBe(true);
  });

  test('is pure data: the registry round-trips through JSON unchanged', () => {
    const roundTripped = JSON.parse(JSON.stringify(LEGACY_MAZE_FEATURE_REGISTRY));
    expect(roundTripped).toEqual(LEGACY_MAZE_FEATURE_REGISTRY);
  });

  test('references only real profile fields and claims every profile field (no dead config)', () => {
    const profilePaths = flattenProfilePaths(normalizeLegacyMazeGenerationProfile(null)).sort();
    const registryPaths = listLegacyMazeFeatureProfileFields();
    for (const path of registryPaths) {
      expect(profilePaths).toContain(path);
    }
    // A new generation-profile field must be claimed by a feature so it cannot
    // silently change topology without an era label.
    expect(registryPaths).toEqual(profilePaths);
  });

  test('rejects duplicate ids, empty ids, empty versions and mode-less features', () => {
    const base: LegacyMazeFeatureDefinition = {
      activation: { kind: 'always' },
      description: 'x',
      generator: 'g',
      id: 'sample-feature',
      modes: ['play'],
      profileFields: [],
      runtimeGates: [],
      stage: 'checkpoint-path'
    };
    expect(() => defineLegacyMazeFeatureRegistry('v', [base, base])).toThrow(/duplicate/);
    expect(() => defineLegacyMazeFeatureRegistry('v', [{ ...base, id: ' ' }])).toThrow(/non-empty id/);
    expect(() => defineLegacyMazeFeatureRegistry(' ', [base])).toThrow(/non-empty version/);
    expect(() => defineLegacyMazeFeatureRegistry('v', [{ ...base, modes: [] }])).toThrow(/at least one mode/);
  });

  test('corridor (single straight leg) profile activates only the corridor feature set', () => {
    expect(resolveLegacyMazeActiveFeatureIds(corridorProfile)).toEqual([
      'corridor-layout',
      'straight-corridor-bias',
      'playable-topology-normalization',
      'open-floor-block-normalization',
      'dead-end-cap'
    ]);
  });

  test('default profile activates uncapped branching, shortcuts, both wraps and auto feeders', () => {
    const defaultIds = resolveLegacyMazeActiveFeatureIds(normalizeLegacyMazeGenerationProfile(null));
    expect(defaultIds).toEqual([
      'corridor-layout',
      'checkpoint-bends',
      'playable-topology-normalization',
      'open-floor-block-normalization',
      'branch-dead-ends',
      'shortcut-bridges',
      'route-reinforcement',
      'edge-wrap-horizontal',
      'edge-wrap-vertical',
      'perimeter-feeders',
      'border-wrap-pairing'
    ]);
    // null/undefined/empty profiles resolve exactly like the normalized default.
    expect(resolveLegacyMazeActiveFeatureIds(null)).toEqual(defaultIds);
    expect(resolveLegacyMazeActiveFeatureIds(undefined)).toEqual(defaultIds);
    expect(resolveLegacyMazeActiveFeatureIds({})).toEqual(defaultIds);
  });

  test('wrap-required profile activates both edge wraps, feeders and pairing, and no dead-end cap', () => {
    const ids = resolveLegacyMazeActiveFeatureIds(wrapRequiredProfile);
    expect(ids).toEqual(expect.arrayContaining([
      'edge-wrap-horizontal',
      'edge-wrap-vertical',
      'perimeter-feeders',
      'border-wrap-pairing',
      'shortcut-bridges',
      'route-reinforcement',
      'branch-dead-ends'
    ]));
    expect(ids).not.toContain('dead-end-cap');
    expect(ids).not.toContain('straight-corridor-bias');
    expect(ids).not.toContain('edge-wrap-horizontal-feeder-pairing');
  });

  test('records the hidden horizontal pairing forced by a single-feeder vertical-only profile', () => {
    const ids = resolveLegacyMazeActiveFeatureIds(verticalOnlyFeederProfile);
    expect(ids).toContain('edge-wrap-vertical');
    expect(ids).not.toContain('edge-wrap-horizontal');
    expect(ids).toContain('edge-wrap-horizontal-feeder-pairing');
    expect(ids).toContain('dead-end-cap');
    // Two feeders per side no longer trigger the forced pairing.
    expect(resolveLegacyMazeActiveFeatureIds({ ...verticalOnlyFeederProfile, borderFeederTargetPerSide: 2 }))
      .not.toContain('edge-wrap-horizontal-feeder-pairing');
  });

  test('adjacent profile steps flip exactly the intended feature ids', () => {
    const withShortcuts = (multiplier: number, reinforcement: number) => resolveLegacyMazeActiveFeatureIds({
      ...wrapRequiredProfile,
      routeQualityReinforcementMultiplier: reinforcement,
      shortcutCountMultiplier: multiplier
    });
    expect(withShortcuts(0, 0.7)).not.toContain('shortcut-bridges');
    // Reinforcement budget derives from shortcuts, so it is off when shortcuts are off.
    expect(withShortcuts(0, 0.7)).not.toContain('route-reinforcement');
    expect(withShortcuts(0.05, 0)).toContain('shortcut-bridges');
    expect(withShortcuts(0.05, 0)).not.toContain('route-reinforcement');
    expect(withShortcuts(0.05, 0.05)).toContain('route-reinforcement');

    expect(resolveLegacyMazeActiveFeatureIds({ ...wrapRequiredProfile, borderFeederTargetPerSide: 0 }))
      .not.toContain('perimeter-feeders');
    expect(resolveLegacyMazeActiveFeatureIds({ ...wrapRequiredProfile, borderFeederTargetPerSide: null }))
      .toContain('perimeter-feeders');

    // An override of 1 is clamped up to minCheckpoints, so bends stay on unless the floor is 1 too.
    expect(resolveLegacyMazeActiveFeatureIds({ ...corridorProfile, minCheckpoints: 4 }))
      .toContain('checkpoint-bends');
    expect(resolveLegacyMazeActiveFeatureIds({ ...corridorProfile, checkpointCountOverride: 2, minCheckpoints: 2 }))
      .toContain('checkpoint-bends');

    expect(resolveLegacyMazeActiveFeatureIds({ ...wrapRequiredProfile, maxDeadEndCount: 0 }))
      .not.toContain('branch-dead-ends');
    expect(resolveLegacyMazeActiveFeatureIds({ ...wrapRequiredProfile, maxDeadEndCount: 1 }))
      .toEqual(expect.arrayContaining(['branch-dead-ends', 'dead-end-cap']));
  });

  test('is deterministic, ordered by registry declaration, and does not mutate its input', () => {
    const frozen = Object.freeze({
      ...wrapRequiredProfile,
      requiredOppositeBorderConnections: Object.freeze({ ...wrapRequiredProfile.requiredOppositeBorderConnections })
    });
    const first = resolveLegacyMazeActiveFeatureIds(frozen);
    const second = resolveLegacyMazeActiveFeatureIds(frozen);
    expect(second).toEqual(first);
    const registryOrder = LEGACY_MAZE_FEATURE_REGISTRY.features.map((feature) => feature.id);
    expect(first).toEqual(registryOrder.filter((id) => first.includes(id)));
  });

  test('menu and play modes currently resolve identical feature sets (parity)', () => {
    for (const profile of [corridorProfile, wrapRequiredProfile, verticalOnlyFeederProfile]) {
      expect(resolveLegacyMazeActiveFeatureIds(profile, { mode: 'menu' }))
        .toEqual(resolveLegacyMazeActiveFeatureIds(profile, { mode: 'play' }));
      expect(resolveLegacyMazeActiveFeatureIds(profile, { mode: 'play' }))
        .toEqual(resolveLegacyMazeActiveFeatureIds(profile));
    }
  });

  test('supports extension registries with new fields and mode-specific features', () => {
    const extended = defineLegacyMazeFeatureRegistry('legacy-maze-features.test-extension', [
      ...LEGACY_MAZE_FEATURE_REGISTRY.features,
      {
        activation: { field: 'hazardDensity', kind: 'field', test: 'positive' },
        description: 'Hypothetical later hazard layer, play only.',
        generator: 'futureHazardLayer',
        id: 'hazard-layer',
        modes: ['play'],
        profileFields: ['hazardDensity'],
        runtimeGates: [],
        stage: 'checkpoint-path'
      }
    ]);
    const profile = { ...wrapRequiredProfile, hazardDensity: 0.3 } as Partial<LegacyMazeGenerationProfile>;
    expect(resolveLegacyMazeActiveFeatureIds(profile, { registry: extended, mode: 'play' })).toContain('hazard-layer');
    expect(resolveLegacyMazeActiveFeatureIds(profile, { registry: extended, mode: 'menu' })).not.toContain('hazard-layer');
    // The canonical registry is unaffected by an extension.
    expect(resolveLegacyMazeActiveFeatureIds(profile)).not.toContain('hazard-layer');
    expect(listLegacyMazeFeatureProfileFields(extended)).toContain('hazardDensity');
  });

  test('creates a stamp with the registry version and null ids when no profile exists', () => {
    expect(createLegacyMazeFeatureStamp(null, 'play')).toEqual({
      activeFeatureIds: null,
      featureRegistryVersion: LEGACY_MAZE_FEATURE_REGISTRY_VERSION
    });
    expect(createLegacyMazeFeatureStamp(corridorProfile, 'play')).toEqual({
      activeFeatureIds: resolveLegacyMazeActiveFeatureIds(corridorProfile, { mode: 'play' }),
      featureRegistryVersion: LEGACY_MAZE_FEATURE_REGISTRY_VERSION
    });
  });
});
