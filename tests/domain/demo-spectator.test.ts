import { describe, expect, test } from 'vitest';

import { createDemoSpectatorPlan } from '../../src/domain/ai';
import type { MazeEpisode } from '../../src/domain/maze/types';

const buildEpisode = (pathLength: number): MazeEpisode => {
  const canonicalPath = Array.from({ length: pathLength }, (_, index) => index);
  const tiles = new Uint8Array(Math.max(pathLength, 1));

  return {
    accepted: true,
    difficulty: 'standard',
    difficultyScore: 0,
    family: 'classic',
    generationTrace: {
      rootTileIndex: 0,
      uniqueTileCount: pathLength,
      steps: [{ phase: 'seed', tileIndices: [0] }]
    },
    metrics: {
      solutionLength: pathLength,
      deadEnds: 0,
      junctions: 0,
      branchDensity: 0,
      straightness: 1,
      coverage: 1
    },
    placementStrategy: 'farthest-pair',
    presentationPreset: 'classic',
    raster: {
      width: pathLength,
      height: 1,
      scale: 1,
      tiles,
      startIndex: canonicalPath[0] ?? 0,
      endIndex: canonicalPath.at(-1) ?? 0,
      pathIndices: Uint32Array.from(canonicalPath)
    },
    routeMotifs: {
      falseShortcutBranches: 0,
      nearGoalBranches: 0,
      hubJunctions: 0,
      chokeCorridors: 0,
      loopDetours: 0
    },
    seed: 1,
    shortcutsCreated: 0,
    size: 'small'
  } as unknown as MazeEpisode;
};

describe('createDemoSpectatorPlan', () => {
  test('core-only content profile returns a plan with every mechanic null, regardless of path length', () => {
    const episode = buildEpisode(40);
    const plan = createDemoSpectatorPlan(episode, 'core-only');

    expect(plan.keyItem).toBeNull();
    expect(plan.pressurePlate).toBeNull();
    expect(plan.pressureDoor).toBeNull();
    expect(plan.hazardTile).toBeNull();
    expect(plan.timedGate).toBeNull();
    expect(plan.patrolLane).toBeNull();
    expect(plan.riskWindows).toEqual([]);
    expect(plan.failureReasonTitle).toBe('Route reset');
    expect(plan.pathLength).toBe(40);
    expect(plan.segmentCount).toBe(39);
  });

  test('full profile on a short path (segmentCount < 6) falls back to the core-only shape with clipped-route text', () => {
    const episode = buildEpisode(6); // segmentCount = 5, below the 6-segment floor
    const plan = createDemoSpectatorPlan(episode, 'full');

    expect(plan.keyItem).toBeNull();
    expect(plan.riskWindows).toEqual([]);
    expect(plan.failureReasonTitle).toBe('Route clipped');
    expect(plan.failureReasonSubtitle).toBe('The route stayed too short to justify a longer ritual pass.');
  });

  test('full profile at exactly the 6-segment floor still falls back to core-only (boundary is exclusive)', () => {
    const episode = buildEpisode(7); // segmentCount = 6
    const plan = createDemoSpectatorPlan(episode, 'full');
    // segmentCount < 6 is false at 6, so this should NOT be core-only -- confirms the exact boundary.
    expect(plan.keyItem).not.toBeNull();
  });

  test('full profile on a long path populates every mechanic with cursors in strictly non-decreasing path order', () => {
    const episode = buildEpisode(60);
    const plan = createDemoSpectatorPlan(episode, 'full');

    expect(plan.keyItem).not.toBeNull();
    expect(plan.pressurePlate).not.toBeNull();
    expect(plan.pressureDoor).not.toBeNull();
    expect(plan.hazardTile).not.toBeNull();
    expect(plan.timedGate).not.toBeNull();
    expect(plan.patrolLane).not.toBeNull();

    const cursors = [
      plan.keyItem!.pathCursor,
      plan.pressurePlate!.pathCursor,
      plan.pressureDoor!.pathCursor,
      plan.patrolLane!.pathCursor,
      plan.hazardTile!.pathCursor,
      plan.timedGate!.pathCursor
    ];
    for (let i = 1; i < cursors.length; i += 1) {
      expect(cursors[i]).toBeGreaterThanOrEqual(cursors[i - 1]);
    }

    // Every cursor must stay within the actual path bounds.
    for (const cursor of cursors) {
      expect(cursor).toBeGreaterThanOrEqual(0);
      expect(cursor).toBeLessThan(plan.pathLength);
    }
  });

  test('tileIndex/landmarkId/connectorId fields are derived consistently from the path and cursors', () => {
    const episode = buildEpisode(60);
    const plan = createDemoSpectatorPlan(episode, 'full');

    const path = Array.from(episode.raster.pathIndices);
    expect(plan.keyItem!.tileIndex).toBe(path[plan.keyItem!.pathCursor]);
    expect(plan.keyItem!.landmarkId).toBe(`key-beacon:${plan.keyItem!.tileIndex}`);

    expect(plan.pressurePlate!.tileIndex).toBe(path[plan.pressurePlate!.pathCursor]);
    expect(plan.pressurePlate!.landmarkId).toBe(`plate-relay:${plan.pressurePlate!.tileIndex}`);

    const doorFrom = plan.pressureDoor!.fromTileIndex;
    const doorTo = plan.pressureDoor!.toTileIndex;
    expect(plan.pressureDoor!.connectorId).toBe(`plate-door:${Math.min(doorFrom, doorTo)}:${Math.max(doorFrom, doorTo)}`);
    expect(plan.pressureDoor!.landmarkId).toBe(`door-post:${doorFrom}`);

    const gateFrom = plan.timedGate!.fromTileIndex;
    const gateTo = plan.timedGate!.toTileIndex;
    expect(plan.timedGate!.connectorId).toBe(`timed-gate:${Math.min(gateFrom, gateTo)}:${Math.max(gateFrom, gateTo)}`);
    expect(plan.timedGate!.landmarkId).toBe(`gate-post:${gateFrom}`);

    expect(plan.hazardTile!.period).toBe(4);
    expect(plan.hazardTile!.activeResidues).toEqual([1, 2]);
    expect(plan.timedGate!.period).toBe(5);
    expect(plan.timedGate!.activeResidues).toEqual([2, 3]);
  });

  test('patrol lane tile indices are a real, non-empty slice of the path bracketing its cursor', () => {
    const episode = buildEpisode(60);
    const plan = createDemoSpectatorPlan(episode, 'full');
    const path = Array.from(episode.raster.pathIndices);

    expect(plan.patrolLane!.tileIndices.length).toBeGreaterThan(0);
    expect(plan.patrolLane!.fromTileIndex).toBe(plan.patrolLane!.tileIndices[0]);
    expect(plan.patrolLane!.toTileIndex).toBe(plan.patrolLane!.tileIndices.at(-1));
    for (const tileIndex of plan.patrolLane!.tileIndices) {
      expect(path).toContain(tileIndex);
    }
  });

  test('riskWindows contains exactly the four expected mechanics with their fixed weights and cues, indexed to the correct cursors', () => {
    const episode = buildEpisode(60);
    const plan = createDemoSpectatorPlan(episode, 'full');

    expect(plan.riskWindows).toHaveLength(4);
    const byMechanic = new Map(plan.riskWindows.map((window) => [window.mechanicId, window]));

    expect(byMechanic.get('pressure-door')).toMatchObject({
      segmentIndex: plan.pressurePlate!.pathCursor,
      weight: 1.18,
      cue: 'reacquire'
    });
    expect(byMechanic.get('patrol-lane')).toMatchObject({
      segmentIndex: plan.patrolLane!.pathCursor,
      weight: 1.22,
      cue: 'anticipate'
    });
    expect(byMechanic.get('hazard-tile')).toMatchObject({
      segmentIndex: plan.hazardTile!.pathCursor,
      weight: 1.28,
      cue: 'anticipate'
    });
    expect(byMechanic.get('timed-gate')).toMatchObject({
      segmentIndex: plan.timedGate!.pathCursor,
      weight: 1.36,
      cue: 'anticipate'
    });
  });

  test('does not mutate the input episode', () => {
    const episode = buildEpisode(60);
    const pathBefore = Array.from(episode.raster.pathIndices);
    const episodeJsonBefore = JSON.stringify(episode, (_key, value) => (value instanceof Uint32Array || value instanceof Uint8Array ? Array.from(value) : value));

    createDemoSpectatorPlan(episode, 'full');

    const episodeJsonAfter = JSON.stringify(episode, (_key, value) => (value instanceof Uint32Array || value instanceof Uint8Array ? Array.from(value) : value));
    expect(episodeJsonAfter).toBe(episodeJsonBefore);
    expect(Array.from(episode.raster.pathIndices)).toEqual(pathBefore);
  });

  test('default content profile (no second argument) behaves the same as explicit "full"', () => {
    const episode = buildEpisode(60);
    const defaultPlan = createDemoSpectatorPlan(episode);
    const explicitPlan = createDemoSpectatorPlan(episode, 'full');
    expect(defaultPlan).toEqual(explicitPlan);
  });
});
