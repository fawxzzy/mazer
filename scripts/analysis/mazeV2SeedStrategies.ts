// Pure seed-strategy logic for the mazeV2 offline lab, extracted into its
// own module specifically so it's unit-testable without running the full
// CLI script (mazev2-lab.ts executes main() unconditionally at module
// scope, which makes importing it directly for a test run the whole lab).
//
// Wave 1.5 correction: the lab used to derive every level's requested seed
// as `baseSeed + level` unconditionally. legacyGenerationLifecycle.ts's own
// bounded candidate search (selectLegacyRuntimeMazeForMode) inspects up to
// LEGACY_GENERATION_SELECTION_MAX_CANDIDATES + pressure-retry + adaptive-
// retry candidates starting from the requested seed -- consecutive levels'
// requested seeds only 1 apart meant their candidate search WINDOWS
// overlapped, so two adjacent levels could select the literal same winning
// candidate. That's a real, confirmed mechanism (see PR #309's own findings
// applying the corrected topology fingerprint over levels 1-200), and it
// silently corrupted "felt difficulty flatness" conclusions: a flat run of
// identical adjacent metric fingerprints could mean either "the generator
// keeps reusing one maze" or "the seed windows happened to overlap," and
// the old lab couldn't tell which.
//
// Three explicit strategies replace that one implicit default, each
// isolating a different question:
//   - fixed: does the generator's own profile/recipe response to level
//     alone produce variety, holding the seed perfectly constant?
//   - sequential-nonoverlapping: does normal seed-stepping gameplay produces
//     produce variety, guaranteed free of the seed-window-overlap artifact
//     above?
//   - corpus: how much does any ONE level's own output vary across many
//     different seeds -- a distribution per level, not a single sample.

// Mirrors legacyGenerationLifecycle.ts's own bounds exactly (kept as a
// literal here, not imported, so this lab has no import-time dependency on
// legacy-runtime beyond what generateSample already needs -- see that
// module's own LEGACY_GENERATION_SELECTION_MAX_CANDIDATES /
// LEGACY_GENERATION_SELECTION_PRESSURE_RETRY_CANDIDATES /
// LEGACY_GENERATION_SELECTION_ADAPTIVE_RETRY_CANDIDATES for the source of
// truth this must stay in sync with): the worst case a single generation
// call can consume is 9 (initial window) + 3 (pressure retry) + 3 (adaptive
// retry) = 15 candidate seeds, each occupying one integer starting at the
// requested seed. A stride of 16 -- one more than the worst case -- is the
// minimum that guarantees two adjacent levels' candidate windows can never
// overlap regardless of how each level's search actually plays out.
export const MAZE_V2_LAB_MAX_CANDIDATE_WINDOW = 9 + 3 + 3;
export const MAZE_V2_LAB_NONOVERLAPPING_STRIDE = MAZE_V2_LAB_MAX_CANDIDATE_WINDOW + 1;

export type MazeV2LabSeedStrategyId = 'fixed' | 'sequential-nonoverlapping' | 'corpus';

export const MAZE_V2_LAB_SEED_STRATEGY_IDS: readonly MazeV2LabSeedStrategyId[] = [
  'fixed',
  'sequential-nonoverlapping',
  'corpus'
];

export const isMazeV2LabSeedStrategyId = (value: string): value is MazeV2LabSeedStrategyId => (
  (MAZE_V2_LAB_SEED_STRATEGY_IDS as readonly string[]).includes(value)
);

// Versioned, committed default seed corpus for the 'corpus' strategy --
// deterministically generated (splitmix32, fixed seed 0xC0FFEE) once and
// then frozen here; regenerating it would silently invalidate any
// previously-committed corpus-strategy baseline, so treat this array as
// append-only-by-replacement (bump MAZE_V2_LAB_DEFAULT_SEED_CORPUS_VERSION
// below if it's ever deliberately replaced).
export const MAZE_V2_LAB_DEFAULT_SEED_CORPUS_VERSION = 'mazev2-lab-seed-corpus-v1' as const;

export const MAZE_V2_LAB_DEFAULT_SEED_CORPUS: readonly number[] = [
  3435661860, 2140156627, 3619332797, 4235004737, 900582976, 805492869,
  3227266743, 1009037877, 430752234, 1691019342, 1250820109, 2756323181,
  2370709299, 305778068, 1725301059, 3882337482, 2859912452, 2141436748,
  1914645926, 276261730, 3602639656, 115211820, 988855297, 1767484253,
  2888663088, 3116806203, 1705632770, 3037610431, 666019685, 3734894697,
  2307416441, 1137206384
];

export interface MazeV2LabLevelSeedPlan {
  level: number;
  // One requested seed per (level, corpus-index) pair -- for 'fixed' and
  // 'sequential-nonoverlapping', corpusIndex is always 0 and there is
  // exactly one entry per level; for 'corpus', there is one entry per
  // corpus seed, all sharing the same level.
  corpusIndex: number;
  requestedSeed: number;
}

export interface MazeV2LabSeedPlanOptions {
  strategy: MazeV2LabSeedStrategyId;
  baseSeed: number;
  minLevel: number;
  maxLevel: number;
  seedCorpus?: readonly number[];
}

// Builds the full (level, requestedSeed) plan for a run, without generating
// anything -- generation is the caller's job (mazev2-lab.ts's own
// generateSample), so this stays pure and independently testable.
export const resolveMazeV2LabSeedPlan = (options: MazeV2LabSeedPlanOptions): MazeV2LabLevelSeedPlan[] => {
  const { strategy, baseSeed, minLevel, maxLevel } = options;
  const seedCorpus = options.seedCorpus ?? MAZE_V2_LAB_DEFAULT_SEED_CORPUS;
  const plan: MazeV2LabLevelSeedPlan[] = [];

  for (let level = minLevel; level <= maxLevel; level += 1) {
    if (strategy === 'fixed') {
      plan.push({ level, corpusIndex: 0, requestedSeed: baseSeed >>> 0 });
      continue;
    }
    if (strategy === 'sequential-nonoverlapping') {
      const levelIndex = level - minLevel;
      plan.push({
        level,
        corpusIndex: 0,
        requestedSeed: (baseSeed + (levelIndex * MAZE_V2_LAB_NONOVERLAPPING_STRIDE)) >>> 0
      });
      continue;
    }
    // 'corpus': every level gets one sample per corpus seed, unmodified --
    // the corpus itself already IS the seed set; a level index offset here
    // would just make it a worse version of sequential-nonoverlapping.
    seedCorpus.forEach((corpusSeed, corpusIndex) => {
      plan.push({ level, corpusIndex, requestedSeed: corpusSeed >>> 0 });
    });
  }

  return plan;
};

// Verifies the nonoverlapping guarantee against what a run ACTUALLY
// observed, rather than only trusting the stride arithmetic above --
// legacyGenerationLifecycle.ts's own candidate-search behavior is the
// source of truth, not this module's mirrored constant. Returns the first
// overlapping pair found, or null if none.
export const findMazeV2LabCandidateWindowOverlap = (
  samples: readonly { level: number; candidateSeeds: readonly number[] }[]
): { firstLevel: number; secondLevel: number; sharedSeed: number } | null => {
  const seenBySeed = new Map<number, number>();
  for (const sample of samples) {
    for (const candidateSeed of sample.candidateSeeds) {
      const previousLevel = seenBySeed.get(candidateSeed);
      if (previousLevel !== undefined && previousLevel !== sample.level) {
        return { firstLevel: previousLevel, secondLevel: sample.level, sharedSeed: candidateSeed };
      }
      seenBySeed.set(candidateSeed, sample.level);
    }
  }
  return null;
};
