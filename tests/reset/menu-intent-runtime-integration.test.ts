import { describe, expect, test } from 'vitest';
import type { MazeEpisode } from '../../src/domain/maze';
import { createMenuIntentRuntimeSession } from '../../src/scenes/menuIntentRuntime';

// This suite locks in the integration contract across the full chain
// (maze episode -> spectator plan -> intent runtime host -> session
// getters) that tests/scenes/menu-intent-runtime.test.ts's existing
// coverage doesn't explicitly assert: malformed/out-of-bounds cursor
// handling, freedom from duplicate-effect growth on repeated/backward
// advancement, absence of input mutation, deterministic reconstruction, and
// clean-slate behavior for a fresh session (the menu-restart case). None of
// these were found to be defective -- every property below was independently
// verified against the real runtime before writing the assertions -- this
// is coverage of an already-correct contract, not a bug fix.
const createShippingSpectatorEpisode = (pathLength = 8): MazeEpisode => ({
  accepted: true,
  checkpointsCreated: 0,
  difficulty: 'standard',
  family: 'classic',
  pathLength,
  placementStrategy: 'farthest-pair',
  presentationPreset: 'classic',
  raster: {
    width: pathLength,
    height: 1,
    tiles: new Uint8Array(pathLength).fill(1),
    startIndex: 0,
    endIndex: pathLength - 1,
    pathIndices: Array.from({ length: pathLength }, (_, index) => index)
  },
  score: 0,
  seed: 1204,
  shortcutsCreated: 0,
  size: 'medium'
} as unknown as MazeEpisode);

describe('menu intent runtime integration', () => {
  test('advanceToStep is idempotent: repeating or lowering the target step never grows intentDeliveries', () => {
    const session = createMenuIntentRuntimeSession(createShippingSpectatorEpisode());

    session.advanceToStep(6);
    const lengthAfterFirst = session.intentDeliveries.length;

    session.advanceToStep(6);
    expect(session.intentDeliveries.length).toBe(lengthAfterFirst);

    session.advanceToStep(3);
    expect(session.intentDeliveries.length).toBe(lengthAfterFirst);

    session.advanceToStep(0);
    expect(session.intentDeliveries.length).toBe(lengthAfterFirst);
  });

  test('advanceToStep accepts a negative or fractional step without throwing, clamping to a valid target', () => {
    const session = createMenuIntentRuntimeSession(createShippingSpectatorEpisode());

    expect(() => session.advanceToStep(-10)).not.toThrow();
    expect(session.intentDeliveries.length).toBeGreaterThan(0);

    const lengthAfterNegative = session.intentDeliveries.length;
    expect(() => session.advanceToStep(2.7)).not.toThrow();
    expect(session.intentDeliveries.length).toBeGreaterThanOrEqual(lengthAfterNegative);
  });

  test('getFeedState and getBoardState clamp out-of-bounds and malformed cursors instead of returning garbage or throwing', () => {
    const session = createMenuIntentRuntimeSession(createShippingSpectatorEpisode());
    session.advanceToStep(6);

    expect(() => session.getFeedState(-5)).not.toThrow();
    expect(session.getFeedState(-5)).not.toBeNull();

    expect(() => session.getFeedState(99_999)).not.toThrow();
    expect(session.getFeedState(99_999)).not.toBeNull();

    expect(() => session.getFeedState(Number.NaN)).not.toThrow();
    expect(session.getFeedState(Number.NaN)).not.toBeNull();

    expect(() => session.getBoardState(-1)).not.toThrow();
    expect(session.getBoardState(-1)).not.toBeNull();

    expect(() => session.getBoardState(99_999)).not.toThrow();
    expect(session.getBoardState(99_999)).not.toBeNull();
  });

  test('an out-of-bounds cursor resolves to the same state as the latest reached step, not a distinct or empty one', () => {
    const session = createMenuIntentRuntimeSession(createShippingSpectatorEpisode());
    session.advanceToStep(6);

    const atLatest = session.getBoardState(session.latestStep);
    const beyondLatest = session.getBoardState(99_999);
    expect(beyondLatest).toEqual(atLatest);

    const beforeStart = session.getBoardState(-100);
    expect(beforeStart).toEqual(session.getBoardState(0));
  });

  test('does not mutate the input episode object', () => {
    const episode = createShippingSpectatorEpisode();
    const episodeJsonBefore = JSON.stringify(episode, (_key, value) => (value instanceof Uint8Array ? Array.from(value) : value));

    const session = createMenuIntentRuntimeSession(episode);
    session.advanceToStep(6);
    session.getFeedState(6);
    session.getBoardState(6);

    const episodeJsonAfter = JSON.stringify(episode, (_key, value) => (value instanceof Uint8Array ? Array.from(value) : value));
    expect(episodeJsonAfter).toBe(episodeJsonBefore);
  });

  test('two sessions constructed from the same episode produce an identical intent sequence', () => {
    const episode = createShippingSpectatorEpisode();

    const sessionA = createMenuIntentRuntimeSession(episode);
    const sessionB = createMenuIntentRuntimeSession(episode);
    sessionA.advanceToStep(6);
    sessionB.advanceToStep(6);

    const kindsA = sessionA.intentDeliveries.flatMap((delivery) => delivery.bus.records.map((record) => record.kind));
    const kindsB = sessionB.intentDeliveries.flatMap((delivery) => delivery.bus.records.map((record) => record.kind));
    expect(kindsB).toEqual(kindsA);

    const boardStateA = sessionA.getBoardState(6);
    const boardStateB = sessionB.getBoardState(6);
    expect(boardStateB).toEqual(boardStateA);
  });

  test('a fresh session (menu restart) starts with zero intent deliveries regardless of a prior session\'s state', () => {
    const episode = createShippingSpectatorEpisode();

    const priorSession = createMenuIntentRuntimeSession(episode);
    priorSession.advanceToStep(6);
    expect(priorSession.intentDeliveries.length).toBeGreaterThan(0);

    const freshSession = createMenuIntentRuntimeSession(episode);
    expect(freshSession.intentDeliveries.length).toBe(0);
    expect(freshSession.latestStep).toBe(-1);
    expect(freshSession.getFeedState()).toBeNull();
    expect(freshSession.getBoardState()).toBeNull();
  });

  test('core-only content profile never emits mechanic-telegraph intent kinds, even across a full traversal', () => {
    const session = createMenuIntentRuntimeSession(createShippingSpectatorEpisode(), 'core-only');
    session.advanceToStep(6);

    const kinds = new Set(session.intentDeliveries.flatMap((delivery) => delivery.bus.records.map((record) => record.kind)));
    for (const mechanicKind of ['trap-inferred', 'enemy-seen', 'item-spotted', 'puzzle-state-observed'] as const) {
      expect(kinds.has(mechanicKind)).toBe(false);
    }

    const boardState = session.getBoardState(6);
    expect(boardState?.telegraphs).toEqual([]);
  });

  test('a short path below the spectator segment floor falls back to core-only board state, matching the unit-level contract', () => {
    // demoSpectator.ts's own unit tests already prove the segment-count
    // floor boundary for createDemoSpectatorPlan directly (the floor is
    // DEMO_SPECTATOR_FULL_PROFILE_MINIMUM_SEGMENT_COUNT, currently 17);
    // this proves the same boundary is honored end-to-end once wired
    // through the runtime host.
    const shortEpisode = createShippingSpectatorEpisode(6); // segmentCount = 5, below the floor
    const session = createMenuIntentRuntimeSession(shortEpisode, 'full');
    session.advanceToStep(4);

    const boardState = session.getBoardState();
    expect(boardState?.telegraphs).toEqual([]);
  });
});
