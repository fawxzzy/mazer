// Corrected collision classification for the mazeV2 offline lab.
//
// Wave 1.5 correction: an earlier version of this lab bucketed only by the
// measured-metric fingerprint and reported every bucket with more than one
// level as one undifferentiated "collision" -- unable to tell "the
// generator reused the literal same maze" apart from "two different mazes
// happen to measure the same on every rounded axis." A later correction
// added a second bucket (topology fingerprint) but still only reported two
// categories. This module reports the six genuinely distinct questions a
// collision can actually answer, from the narrowest/most severe identity
// match to the loosest.
export interface MazeV2LabCollisionSample {
  level: number;
  requestedSeed: number;
  selectedSeed: number;
  topologyFingerprint: string;
  metricFingerprint: string;
  recipeDigest: string;
}

export interface MazeV2LabCollisionGroup {
  levels: readonly number[];
  key: string;
}

export interface MazeV2LabCollisionReport {
  // 1. Same requested seed AND same selected seed -- only possible when a
  //    strategy deliberately repeats a requested seed across levels ('fixed',
  //    or 'corpus' revisiting the same corpus entry). Not itself proof of a
  //    reused maze: two different levels can request+select the identical
  //    seed and still generate different mazes, since target complexity and
  //    generation profile both vary with level even when the seed doesn't.
  sameRequestedAndSelectedSeed: readonly MazeV2LabCollisionGroup[];
  // 2. Different requested seed, but the SAME selected seed -- the original
  //    Wave 1 bug mechanism: overlapping candidate-search windows across
  //    adjacent levels converging on one winning candidate. Real evidence
  //    the generator reused a maze, from seeds that were never supposed to
  //    match.
  differentRequestedSameSelectedSeed: readonly MazeV2LabCollisionGroup[];
  // 3. Different selected seed, but the exact same topology -- a genuine
  //    generator collision independent of seed-window mechanics: two
  //    unrelated seeds produced the identical graph. Rare; worth flagging
  //    specifically because it's a property of the generator's own
  //    candidate space, not of this lab's seed strategy.
  differentSelectedSeedSameTopology: readonly MazeV2LabCollisionGroup[];
  // 4. Different topology, but the same (rounded) metric fingerprint --
  //    coincidental similarity, not a duplicate maze. Bears on how
  //    discriminating the metric vector itself is, not on generator novelty.
  differentTopologySameMetricFingerprint: readonly MazeV2LabCollisionGroup[];
  // 5. Same recipe digest -- expected to be a subset of (1) in practice
  //    (the digest includes level, so it can only collide across a level
  //    that appears more than once in the sample set, e.g. a 'corpus'
  //    strategy revisiting the same level+seed pair, which the seed-plan
  //    generator does not currently produce -- so this is expected empty
  //    for every strategy this lab implements, and reported as a genuine
  //    empty finding rather than omitted, so a future change to the seed
  //    plan that DOES produce a repeat is caught here rather than silently
  //    unreported.
  sameRecipeDigest: readonly MazeV2LabCollisionGroup[];
  // 6. Actual SHA-256 digest collision between two DIFFERENT recipes --
  //    structurally undetectable by any dataset this lab could produce
  //    (SHA-256 collision resistance), reported as an always-expected-empty
  //    category rather than silently unimplemented. If this is ever
  //    non-empty, treat it as a hashing-implementation bug, not a maze
  //    finding.
  digestCollisionAcrossDifferentRecipes: readonly MazeV2LabCollisionGroup[];
}

const groupBy = <TSample>(
  samples: readonly TSample[],
  keyOf: (sample: TSample) => string
): Map<string, TSample[]> => {
  const groups = new Map<string, TSample[]>();
  for (const sample of samples) {
    const key = keyOf(sample);
    const existing = groups.get(key);
    if (existing) {
      existing.push(sample);
    } else {
      groups.set(key, [sample]);
    }
  }
  return groups;
};

const toGroups = <TSample extends { level: number }>(
  groups: Map<string, TSample[]>
): MazeV2LabCollisionGroup[] => (
  [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({ key, levels: members.map((member) => member.level) }))
);

export const classifyMazeV2LabCollisions = (
  samples: readonly MazeV2LabCollisionSample[]
): MazeV2LabCollisionReport => {
  const requestedAndSelectedGroups = toGroups(
    groupBy(samples, (sample) => `${sample.requestedSeed}:${sample.selectedSeed}`)
  );

  const selectedSeedGroups = groupBy(samples, (sample) => String(sample.selectedSeed));
  const differentRequestedSameSelectedSeed = [...selectedSeedGroups.entries()]
    .map(([selectedSeed, members]) => ({
      selectedSeed,
      members,
      distinctRequestedSeeds: new Set(members.map((member) => member.requestedSeed))
    }))
    .filter((group) => group.members.length > 1 && group.distinctRequestedSeeds.size > 1)
    .map((group) => ({ key: group.selectedSeed, levels: group.members.map((member) => member.level) }));

  const topologyGroups = groupBy(samples, (sample) => sample.topologyFingerprint);
  const differentSelectedSeedSameTopology = [...topologyGroups.entries()]
    .map(([topologyFingerprint, members]) => ({
      topologyFingerprint,
      members,
      distinctSelectedSeeds: new Set(members.map((member) => member.selectedSeed))
    }))
    .filter((group) => group.members.length > 1 && group.distinctSelectedSeeds.size > 1)
    .map((group) => ({ key: group.topologyFingerprint, levels: group.members.map((member) => member.level) }));

  const metricGroups = groupBy(samples, (sample) => sample.metricFingerprint);
  const differentTopologySameMetricFingerprint = [...metricGroups.entries()]
    .map(([metricFingerprint, members]) => ({
      metricFingerprint,
      members,
      distinctTopologies: new Set(members.map((member) => member.topologyFingerprint))
    }))
    .filter((group) => group.members.length > 1 && group.distinctTopologies.size > 1)
    .map((group) => ({ key: group.metricFingerprint, levels: group.members.map((member) => member.level) }));

  const sameRecipeDigest = toGroups(groupBy(samples, (sample) => sample.recipeDigest));

  return {
    sameRequestedAndSelectedSeed: requestedAndSelectedGroups,
    differentRequestedSameSelectedSeed,
    differentSelectedSeedSameTopology,
    differentTopologySameMetricFingerprint,
    sameRecipeDigest,
    // See this category's own doc comment above: structurally undetectable,
    // always reported empty rather than silently unimplemented.
    digestCollisionAcrossDifferentRecipes: []
  };
};
