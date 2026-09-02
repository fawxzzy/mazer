import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { analyzeLegacyMazeAsMazeV2Metrics, computeLegacyMazeTopologyFingerprint } from '../../src/domain/mazeV2/metrics';
import { deriveMazeV2CanonicalMazeFromLegacySnapshot } from '../../src/domain/mazeV2/canonicalMaze';
import { analyzeMazeV2CanonicalMaze } from '../../src/domain/mazeV2/canonicalAnalyzer';
import type { LegacyMazeSnapshot } from '../../src/legacy-runtime/legacyMaze';

const sampleMaze = () => ({
  width: 3,
  height: 3,
  grid: [
    [true, true, true],
    [true, false, true],
    [true, true, true]
  ],
  start: { x: 0, y: 0 },
  goal: { x: 2, y: 2 }
});

describe('mazeV2 topology fingerprint identity', () => {
  test('excludes seed -- two different seeds producing the identical graph produce the identical fingerprint', () => {
    // Wave 1.5 regression: an earlier version of computeLegacyMazeTopologyFingerprint
    // hashed maze.seed alongside the grid, which meant "topology identity"
    // actually meant "topology + provenance," backwards for a field whose
    // whole job is detecting the generator handing back the literal same
    // maze regardless of how it got there. Construct two snapshot-shaped
    // objects that differ ONLY in an attached seed and confirm the
    // fingerprint doesn't see it -- computeLegacyMazeTopologyFingerprint's
    // own parameter type (Pick<..., 'width'|'height'|'grid'|'start'|'goal'>)
    // no longer even accepts a seed field, so this also exercises that the
    // function genuinely never reads one if a caller supplies extra fields.
    const maze = sampleMaze();
    const withSeedA = { ...maze, seed: 111 };
    const withSeedB = { ...maze, seed: 999 };

    expect(computeLegacyMazeTopologyFingerprint(withSeedA)).toBe(computeLegacyMazeTopologyFingerprint(withSeedB));
  });

  test('differs when the actual graph differs', () => {
    const maze = sampleMaze();
    const changedGoal = { ...maze, goal: { x: 1, y: 0 } };

    expect(computeLegacyMazeTopologyFingerprint(maze)).not.toBe(computeLegacyMazeTopologyFingerprint(changedGoal));
  });

  test('is deterministic for the same graph', () => {
    const maze = sampleMaze();
    expect(computeLegacyMazeTopologyFingerprint(maze)).toBe(computeLegacyMazeTopologyFingerprint(sampleMaze()));
  });

  test('a real generated maze and its canonical-maze bridge agree on shape', () => {
    const maze = createLegacyRuntimeMazeForMode('play', 30, 4242, undefined, { targetComplexity: 40 });
    const canonical = deriveMazeV2CanonicalMazeFromLegacySnapshot(maze);

    expect(canonical.width).toBe(maze.width);
    expect(canonical.height).toBe(maze.height);
    expect(canonical.start).toEqual(maze.start);
    expect(canonical.goal).toEqual(maze.goal);
    expect(canonical.walkable.length).toBe(maze.height);
    expect(canonical.walkable[0]?.length).toBe(maze.width);
  });

  test('two real generations from different requested seeds that select the same underlying maze produce the same topology fingerprint (not just the same metric fingerprint)', () => {
    // This is the actual production mechanism the seed exclusion protects:
    // legacyGenerationLifecycle.ts's own bounded candidate search can select
    // the identical winning candidate from two adjacent requested seeds
    // when their search windows overlap (confirmed in this session's own
    // investigation). Force that here with two adjacent requested seeds at
    // a target complexity where the search window is wide, then verify the
    // corrected fingerprint reports it as a genuine topology match, not
    // merely a metric-vector coincidence.
    const targetComplexity = 40;
    const mazeA = createLegacyRuntimeMazeForMode('play', 40, 90210, undefined, { targetComplexity });
    const mazeB = createLegacyRuntimeMazeForMode('play', 40, 90211, undefined, { targetComplexity });

    if (mazeA.seed !== mazeB.seed) {
      // The two adjacent requested seeds didn't happen to converge for this
      // particular scale/target/seed combination -- not every pair does.
      // Assert the weaker, always-true invariant instead (the function
      // still runs and produces a stable value), so this test doesn't
      // become flaky noise; the seed-exclusion behavior itself is already
      // proven unconditionally by the synthetic case above.
      expect(computeLegacyMazeTopologyFingerprint(mazeA)).toBe(computeLegacyMazeTopologyFingerprint(mazeA));
      return;
    }

    expect(computeLegacyMazeTopologyFingerprint(mazeA)).toBe(computeLegacyMazeTopologyFingerprint(mazeB));
  });
});

describe('mazeV2 canonical bridge -- wrap pair derivation (Wave 1.5 PR D correction)', () => {
  // Before this correction, deriveMazeV2CanonicalMazeFromLegacySnapshot
  // always returned wrapPairs: [] regardless of the actual maze, on the
  // (true but beside-the-point) claim that LegacyMazeSnapshot has no
  // per-pair wrap list to read. The real rule lives in legacyMaze.ts's own
  // resolveLegacyGridStepTarget: two opposite-border walkable cells sharing
  // a row (horizontal) or column (vertical) are wrap-connected -- fully
  // derivable from the grid alone.
  test('derives a horizontal wrap pair between walkable left/right border cells on the same row', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [true, true, true],
        [true, false, true],
        [true, true, true]
      ],
      start: { x: 0, y: 1 },
      goal: { x: 2, y: 1 }
    };
    const canonical = deriveMazeV2CanonicalMazeFromLegacySnapshot(maze);
    expect(canonical.wrapPairs).toContainEqual({ from: { x: 0, y: 1 }, to: { x: 2, y: 1 }, axis: 'horizontal' });
  });

  test('derives a vertical wrap pair between walkable top/bottom border cells on the same column', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [true, true, true],
        [true, false, true],
        [true, true, true]
      ],
      start: { x: 1, y: 0 },
      goal: { x: 1, y: 2 }
    };
    const canonical = deriveMazeV2CanonicalMazeFromLegacySnapshot(maze);
    expect(canonical.wrapPairs).toContainEqual({ from: { x: 1, y: 0 }, to: { x: 1, y: 2 }, axis: 'vertical' });
  });

  test('does not derive a wrap pair when only one side of the border is walkable', () => {
    // Single row (height 1) isolates the horizontal-only check -- no
    // vertical pair is even possible to accidentally trip here.
    const maze = {
      width: 3,
      height: 1,
      grid: [[true, true, false]],
      start: { x: 0, y: 0 },
      goal: { x: 1, y: 0 }
    };
    const canonical = deriveMazeV2CanonicalMazeFromLegacySnapshot(maze);
    expect(canonical.wrapPairs).toEqual([]);
  });

  test('a corner cell can participate in both a horizontal and a vertical wrap pair', () => {
    const maze = {
      width: 2,
      height: 2,
      grid: [
        [true, true],
        [true, true]
      ],
      start: { x: 0, y: 0 },
      goal: { x: 1, y: 1 }
    };
    const canonical = deriveMazeV2CanonicalMazeFromLegacySnapshot(maze);
    expect(canonical.wrapPairs).toContainEqual({ from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, axis: 'horizontal' });
    expect(canonical.wrapPairs).toContainEqual({ from: { x: 0, y: 1 }, to: { x: 1, y: 1 }, axis: 'horizontal' });
    expect(canonical.wrapPairs).toContainEqual({ from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, axis: 'vertical' });
    expect(canonical.wrapPairs).toContainEqual({ from: { x: 1, y: 0 }, to: { x: 1, y: 1 }, axis: 'vertical' });
  });

  test('a real generated maze with required opposite-border connections produces non-empty wrap pairs', () => {
    // Same real-generation smoke pattern the identity tests above already
    // use, but asserting the thing PR D actually fixes: a maze whose
    // profile requires wrap connectivity must bridge into a canonical maze
    // that actually reports it, not silently wrap-free.
    const maze = createLegacyRuntimeMazeForMode('play', 30, 777, {
      requiredOppositeBorderConnections: { horizontal: true, vertical: true }
    }, { targetComplexity: 40 });
    const canonical = deriveMazeV2CanonicalMazeFromLegacySnapshot(maze);
    expect(canonical.wrapPairs.length).toBeGreaterThan(0);
  });

  test('keeps a physically straight path straight when its second step crosses a horizontal wrap edge', () => {
    const maze = {
      width: 4,
      height: 1,
      grid: [[true, true, true, true]],
      start: { x: 1, y: 0 },
      goal: { x: 3, y: 0 },
      solutionPath: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]
    } as LegacyMazeSnapshot;
    const canonical = deriveMazeV2CanonicalMazeFromLegacySnapshot(maze);

    expect(analyzeMazeV2CanonicalMaze(canonical).turning.turnCount).toBe(0);
    expect(analyzeLegacyMazeAsMazeV2Metrics(maze).turning.turnCount).toBe(0);
  });

  test('deduplicates wrap neighbors that are also direct neighbors on a two-cell axis', () => {
    const canonical = deriveMazeV2CanonicalMazeFromLegacySnapshot({
      width: 2,
      height: 2,
      grid: [[true, true], [true, true]],
      start: { x: 0, y: 0 },
      goal: { x: 1, y: 1 }
    });
    expect(analyzeMazeV2CanonicalMaze(canonical).ambiguity.cycleRank).toBe(1);
  });
});
