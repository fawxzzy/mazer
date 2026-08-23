import { createSeededRng } from '../domain/rng/seededRng';

// Additive recipe module: visible player/AI levels are now independent,
// unbounded completion ordinals in legacyProgression.ts. This deterministic
// recipe engine remains non-load-bearing until the server-owned completion
// contract can verify recipe provenance; live generation continues to use
// the separately bounded, half-speed difficulty track in the meantime.

/**
 * Levels 1-99 identify the legacy recipe family. Levels at or above this
 * boundary can resolve a bounded endless recipe without imposing a ceiling
 * on the displayed completion ordinal.
 */
export const LEGACY_ENDLESS_LEVEL_BOUNDARY = 100;
export const LEGACY_ENDLESS_RULESET_ID = 'endless-v1';
export const LEGACY_ENDLESS_RECIPE_VERSION = 1;
export const LEGACY_LEGACY_RULESET_ID = 'legacy-v1';

export type LegacyProgressionRulesetId =
  | typeof LEGACY_LEGACY_RULESET_ID
  | typeof LEGACY_ENDLESS_RULESET_ID;

/**
 * Which ruleset a given level ordinal resolves through. Pure and total for
 * every positive integer -- there is no ceiling on the input.
 */
export const resolveLegacyProgressionRulesetId = (
  level: number
): LegacyProgressionRulesetId => (
  level >= LEGACY_ENDLESS_LEVEL_BOUNDARY ? LEGACY_ENDLESS_RULESET_ID : LEGACY_LEGACY_RULESET_ID
);

export type LegacyModifierCategory = 'complexity' | 'difficulty';

export interface LegacyModifierDefinition {
  readonly category: LegacyModifierCategory;
  readonly description: string;
  readonly id: string;
  readonly maximumIntensity: number;
  readonly minimumIntensity: number;
  readonly version: number;
}

export interface LegacyModifierInstance {
  readonly id: string;
  readonly intensity: number;
  readonly version: number;
}

export interface LegacyModifierPolicy {
  readonly enabled: boolean;
  readonly maximumIntensity?: number;
  readonly minimumIntensity?: number;
}

export type LegacyModifierPolicyMap = Readonly<Record<string, LegacyModifierPolicy>>;

// Future extension points -- deliberately empty arrays on every recipe today.
// No enemy or obstacle gameplay exists yet; these exist so adding an
// archetype later is additive (new archetype + new modifier definition +
// generator handling) rather than another recipe-shape migration.
export interface LegacyEnemyRecipeInstance {
  readonly archetypeId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly version: number;
}

export interface LegacyObstacleRecipeInstance {
  readonly archetypeId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly version: number;
}

export interface LegacyEndlessLevelRecipe {
  readonly complexityBudget: number;
  readonly difficultyBudget: number;
  readonly enemies: readonly LegacyEnemyRecipeInstance[];
  readonly level: number;
  readonly modifiers: readonly LegacyModifierInstance[];
  readonly obstacles: readonly LegacyObstacleRecipeInstance[];
  readonly recipeVersion: number;
  readonly rulesetId: typeof LEGACY_ENDLESS_RULESET_ID;
  readonly seed: string;
}

// Grounded directly in LegacyMazeGenerationProfile's actual fields
// (legacyMaze.ts) -- every modifier here maps onto a generator input that
// already exists and does something, not a fabricated future effect.
// straightnessBias and shortcutCountMultiplier/routeQualityReinforcementMultiplier
// aggregate a couple of related generator concerns each rather than exposing
// every raw field 1:1; see each description for exactly what's aggregated.
export const LEGACY_ENDLESS_MODIFIER_REGISTRY: readonly LegacyModifierDefinition[] = [
  {
    category: 'complexity',
    description: 'Inverse of straightnessBias -- higher intensity means corridors turn and zig-zag more instead of running straight.',
    id: 'path.turning',
    maximumIntensity: 1,
    minimumIntensity: 0,
    version: 1
  },
  {
    category: 'complexity',
    description: 'checkpointCountMultiplier -- higher intensity means more branching junctions and checkpoints.',
    id: 'topology.branchDensity',
    maximumIntensity: 1,
    minimumIntensity: 0,
    version: 1
  },
  {
    category: 'complexity',
    description: 'maxDeadEndCount, inverted -- higher intensity relaxes the dead-end cap, allowing more emergent dead ends to remain uncarved rather than pruned.',
    id: 'topology.deadEnds',
    maximumIntensity: 1,
    minimumIntensity: 0,
    version: 1
  },
  {
    category: 'complexity',
    description: 'borderFeederTargetPerSide -- higher intensity requests more edge-of-board bleed corridors per side.',
    id: 'topology.borderFeeders',
    maximumIntensity: 1,
    minimumIntensity: 0,
    version: 1
  },
  {
    category: 'difficulty',
    description: 'shortcutCountMultiplier -- a relief knob, not a raw difficulty increase: higher intensity opens more alternate routes, easing pressure built up by the complexity modifiers above.',
    id: 'topology.shortcuts',
    maximumIntensity: 1,
    minimumIntensity: 0,
    version: 1
  },
  {
    category: 'difficulty',
    description: 'routeQualityReinforcementMultiplier -- higher intensity biases generation toward a cleaner, more confident solution path (execution/pressure difficulty, distinct from structural complexity).',
    id: 'topology.routeReinforcement',
    maximumIntensity: 1,
    minimumIntensity: 0,
    version: 1
  }
] as const;

export const LEGACY_ENDLESS_DEFAULT_MODIFIER_POLICY: LegacyModifierPolicyMap = Object.freeze(
  Object.fromEntries(
    LEGACY_ENDLESS_MODIFIER_REGISTRY.map((definition) => [definition.id, { enabled: true }])
  )
);

const LEGACY_ENDLESS_COMPLEXITY_BUDGET_MIN = 280;
const LEGACY_ENDLESS_COMPLEXITY_BUDGET_MAX = 400;
const LEGACY_ENDLESS_DIFFICULTY_BUDGET_MIN = 40;
const LEGACY_ENDLESS_DIFFICULTY_BUDGET_MAX = 100;
// Levels build up over a bounded window and spike on the last level of each
// cycle, then reset -- "controlled challenge cycles... periodic synthesis or
// capstone levels" instead of one raw property climbing forever. Picking a
// prime-ish length keeps the cycle from lining up with the modifier count
// and producing a repeating visible pattern.
const LEGACY_ENDLESS_CHALLENGE_CYCLE_LENGTH = 23;

// FNV-1a over a short deterministic string -- avoids any correlation between
// nearby level numbers landing on nearby RNG states (which a bare `level` or
// `level * constant` seed would produce), while staying trivially reviewable
// and dependency-free.
const hashLegacySeedString = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const resolveLegacyModifierBounds = (
  definition: LegacyModifierDefinition,
  policy: LegacyModifierPolicyMap
): { maximum: number; minimum: number } => {
  const entry = policy[definition.id];
  const minimum = Math.max(definition.minimumIntensity, entry?.minimumIntensity ?? definition.minimumIntensity);
  const maximum = Math.min(definition.maximumIntensity, entry?.maximumIntensity ?? definition.maximumIntensity);
  return { maximum: Math.max(minimum, maximum), minimum };
};

/**
 * Deterministic: identical (level, policy, recipeVersion) always produces an
 * identical recipe -- no wall-clock, no ambient randomness. Only valid for
 * level >= LEGACY_ENDLESS_LEVEL_BOUNDARY; levels below that belong to the
 * unchanged legacy-v1 band system in legacyProgression.ts.
 */
export const resolveLegacyEndlessLevelRecipe = (
  level: number,
  policy: LegacyModifierPolicyMap = LEGACY_ENDLESS_DEFAULT_MODIFIER_POLICY
): LegacyEndlessLevelRecipe => {
  if (!Number.isInteger(level) || level < LEGACY_ENDLESS_LEVEL_BOUNDARY) {
    throw new Error(`resolveLegacyEndlessLevelRecipe requires an integer level >= ${LEGACY_ENDLESS_LEVEL_BOUNDARY}, got ${level}`);
  }

  const seed = `${LEGACY_ENDLESS_RULESET_ID}:${LEGACY_ENDLESS_RECIPE_VERSION}:${level}`;
  const rng = createSeededRng(hashLegacySeedString(seed));

  const cyclePosition = (level - LEGACY_ENDLESS_LEVEL_BOUNDARY) % LEGACY_ENDLESS_CHALLENGE_CYCLE_LENGTH;
  const isCapstone = cyclePosition === LEGACY_ENDLESS_CHALLENGE_CYCLE_LENGTH - 1;
  const cycleProgress = cyclePosition / (LEGACY_ENDLESS_CHALLENGE_CYCLE_LENGTH - 1);

  const complexityBudget = isCapstone
    ? LEGACY_ENDLESS_COMPLEXITY_BUDGET_MAX
    : Math.round(
      LEGACY_ENDLESS_COMPLEXITY_BUDGET_MIN
      + ((LEGACY_ENDLESS_COMPLEXITY_BUDGET_MAX - LEGACY_ENDLESS_COMPLEXITY_BUDGET_MIN) * cycleProgress * 0.85)
    );
  const difficultyBudget = isCapstone
    ? LEGACY_ENDLESS_DIFFICULTY_BUDGET_MAX
    : Math.round(
      LEGACY_ENDLESS_DIFFICULTY_BUDGET_MIN
      + ((LEGACY_ENDLESS_DIFFICULTY_BUDGET_MAX - LEGACY_ENDLESS_DIFFICULTY_BUDGET_MIN) * cycleProgress * 0.85)
    );

  const modifiers: LegacyModifierInstance[] = [];
  for (const definition of LEGACY_ENDLESS_MODIFIER_REGISTRY) {
    const entry = policy[definition.id];
    if (entry?.enabled === false) {
      // Disabled modifiers never appear in the recipe at all -- not present
      // at intensity 0, genuinely absent, so a generator/UI that only reads
      // "which modifiers exist" never sees a disabled one.
      continue;
    }

    const { maximum, minimum } = resolveLegacyModifierBounds(definition, policy);
    const bandFloor = minimum + ((maximum - minimum) * cycleProgress * 0.5);
    const intensity = isCapstone
      ? maximum
      : Number((bandFloor + (rng.nextFloat() * (maximum - bandFloor))).toFixed(4));

    modifiers.push({
      id: definition.id,
      intensity,
      version: definition.version
    });
  }

  return {
    complexityBudget,
    difficultyBudget,
    enemies: [],
    level,
    modifiers,
    obstacles: [],
    recipeVersion: LEGACY_ENDLESS_RECIPE_VERSION,
    rulesetId: LEGACY_ENDLESS_RULESET_ID,
    seed
  };
};
