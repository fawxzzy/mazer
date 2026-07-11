export const DEFAULT_LEGACY_RUNTIME_SEED = 3749;

const LEGACY_RUNTIME_SEED_QUERY_KEYS = ['mazeSeed', 'seed'] as const;
const MAX_LEGACY_RUNTIME_SEED = 0xffffffff;

export interface LegacyRuntimeSeedResolution {
  readonly explicit: boolean;
  readonly seed: number;
}

export interface LegacyRuntimeRandomSeedOptions {
  readonly nowMs?: number;
  readonly previousSeed?: number;
  readonly random?: () => number;
}

const toFiniteIntegerSeed = (seed: number): number | null => {
  if (!Number.isFinite(seed)) {
    return null;
  }

  return Math.abs(Math.trunc(seed)) >>> 0;
};

export const normalizeLegacyRuntimeSeed = (
  seed: number,
  fallback = DEFAULT_LEGACY_RUNTIME_SEED
): number => {
  const normalizedSeed = toFiniteIntegerSeed(seed);
  if (normalizedSeed !== null && normalizedSeed > 0) {
    return normalizedSeed;
  }

  const normalizedFallback = toFiniteIntegerSeed(fallback);
  return normalizedFallback !== null && normalizedFallback > 0
    ? normalizedFallback
    : DEFAULT_LEGACY_RUNTIME_SEED;
};

export const parseLegacyRuntimeSeed = (search: string): number | null => {
  const trimmedSearch = search.trim();
  if (trimmedSearch.length === 0) {
    return null;
  }

  const params = new URLSearchParams(trimmedSearch.startsWith('?') ? trimmedSearch.slice(1) : trimmedSearch);
  for (const key of LEGACY_RUNTIME_SEED_QUERY_KEYS) {
    const rawSeed = params.get(key);
    if (rawSeed === null || rawSeed.trim().length === 0) {
      continue;
    }

    const parsedSeed = Number(rawSeed);
    if (Number.isFinite(parsedSeed)) {
      return normalizeLegacyRuntimeSeed(parsedSeed);
    }
  }

  return null;
};

export const createLegacyRuntimeRandomSeed = ({
  nowMs = Date.now(),
  previousSeed = DEFAULT_LEGACY_RUNTIME_SEED,
  random = Math.random
}: LegacyRuntimeRandomSeedOptions = {}): number => {
  const randomValue = random();
  const randomPart = Number.isFinite(randomValue)
    ? Math.floor(Math.max(0, Math.min(0.999999999, randomValue)) * MAX_LEGACY_RUNTIME_SEED)
    : 0;
  const timePart = normalizeLegacyRuntimeSeed(nowMs);
  const previousPart = normalizeLegacyRuntimeSeed(previousSeed);
  const mixed = Math.imul((randomPart ^ timePart ^ previousPart) >>> 0, 0x9e3779b1) >>> 0;
  return normalizeLegacyRuntimeSeed(mixed, previousPart);
};

export const resolveInitialLegacyRuntimeSeed = (
  search: string,
  options: LegacyRuntimeRandomSeedOptions = {}
): LegacyRuntimeSeedResolution => {
  const explicitSeed = parseLegacyRuntimeSeed(search);
  if (explicitSeed !== null) {
    return {
      explicit: true,
      seed: explicitSeed
    };
  }

  return {
    explicit: false,
    seed: createLegacyRuntimeRandomSeed(options)
  };
};
