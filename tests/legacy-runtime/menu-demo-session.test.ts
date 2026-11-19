import { describe, expect, it } from 'vitest';
import {
  advanceLegacyMenuDemoSession,
  applyLegacyMenuDemoSession,
  createLegacyMenuDemoSessionProgressionStorage,
  overlayLegacyMenuDemoSession,
  resolveLegacyMenuDemoSessionUserId,
  startLegacyMenuDemoSessionTrack
} from '../../src/legacy-runtime/legacyMenuDemoSession';
import { seedLegacyMenuDemoTrackFromPlayer } from '../../src/legacy-runtime/legacyMenuDemoTrack';
import {
  createEmptyLegacyProgressionState,
  LEGACY_PROGRESSION_MAX_COMPLEXITY,
  LEGACY_PROGRESSION_STORAGE_KEY,
  type LegacyProgressionState,
  type LegacyProgressionTrack
} from '../../src/legacy-runtime/legacyProgression';

const withLevel = (track: LegacyProgressionTrack, level: number): LegacyProgressionTrack => ({
  ...track,
  completedCycles: String(level - 1),
  level: String(level),
  peakComplexity: 8 + (level - 1) * 4,
  targetComplexity: 8 + (level - 1) * 4
});

const stateWith = (playerLevel: number, aiLevel: number): LegacyProgressionState => {
  const base = createEmptyLegacyProgressionState();
  return {
    ...base,
    tracks: {
      player: withLevel(base.tracks.player, playerLevel),
      'ai-runner': { ...withLevel(base.tracks['ai-runner'], aiLevel), paceScore: 7 }
    }
  };
};

describe('resolveLegacyMenuDemoSessionUserId', () => {
  it('returns the user id only for an authenticated snapshot outside level preview', () => {
    expect(resolveLegacyMenuDemoSessionUserId({ status: 'authenticated', userId: 'u1' })).toBe('u1');
    expect(resolveLegacyMenuDemoSessionUserId({ status: 'guest', userId: null })).toBeNull();
    expect(resolveLegacyMenuDemoSessionUserId({ status: 'authenticated', userId: null })).toBeNull();
    expect(resolveLegacyMenuDemoSessionUserId({ status: 'authenticated', userId: '' })).toBeNull();
    expect(resolveLegacyMenuDemoSessionUserId({ status: 'authenticated', userId: 'u1' }, { levelPreview: true })).toBeNull();
    expect(resolveLegacyMenuDemoSessionUserId(null)).toBeNull();
  });
});

describe('applyLegacyMenuDemoSession', () => {
  it('signed out: exactly today\'s seed and no session', () => {
    for (const state of [stateWith(30, 5), stateWith(5, 30), stateWith(1, 1)]) {
      const resolved = applyLegacyMenuDemoSession(state, null, null);
      expect(resolved.session).toBeNull();
      expect(resolved.state).toEqual(seedLegacyMenuDemoTrackFromPlayer(state));
    }
    // A stale session from a signed-out account is dropped.
    const stale = { track: stateWith(9, 9).tracks['ai-runner'], userId: 'u1' };
    expect(applyLegacyMenuDemoSession(stateWith(2, 3), stale, null).session).toBeNull();
  });

  it('signed in: starts on the player level even when the persisted demo is higher', () => {
    const state = stateWith(12, 80);
    const resolved = applyLegacyMenuDemoSession(state, null, 'u1');
    const ai = resolved.state.tracks['ai-runner'];
    expect(ai.level).toBe('12');
    expect(ai.targetComplexity).toBe(state.tracks.player.targetComplexity);
    expect(ai.rank).toBe(state.tracks.player.rank);
    // The demo's own pace history and cursor are kept.
    expect(ai.paceScore).toBe(7);
    expect(ai.completedCycles).toBe(state.tracks['ai-runner'].completedCycles);
    expect(resolved.state.tracks.player).toBe(state.tracks.player);
    expect(resolved.session).toEqual({ track: ai, userId: 'u1' });
    // The input state is not mutated.
    expect(state.tracks['ai-runner'].level).toBe('80');
  });

  it('signed in: starts on the player level when the persisted demo is lower', () => {
    const resolved = applyLegacyMenuDemoSession(stateWith(40, 2), null, 'u1');
    expect(resolved.state.tracks['ai-runner'].level).toBe('40');
  });

  it('same account: keeps the session climb, lifts it to a higher hydrated player level, never drops it', () => {
    const start = applyLegacyMenuDemoSession(stateWith(10, 1), null, 'u1');
    const climbed = advanceLegacyMenuDemoSession(start.session!, {
      tracks: { ...start.state.tracks, 'ai-runner': withLevel(start.state.tracks['ai-runner'], 13) }
    });
    // A reload from storage (persisted ai-runner at 1) keeps the climbed session.
    const reload = applyLegacyMenuDemoSession(stateWith(10, 1), climbed, 'u1');
    expect(reload.state.tracks['ai-runner'].level).toBe('13');
    expect(reload.session).toBe(climbed);
    // A late account hydration says the player is at 20: lift.
    const hydrated = applyLegacyMenuDemoSession(stateWith(20, 1), climbed, 'u1');
    expect(hydrated.state.tracks['ai-runner'].level).toBe('20');
    expect(hydrated.session?.track.level).toBe('20');
  });

  it('a different account starts a fresh session on its own player level', () => {
    const first = applyLegacyMenuDemoSession(stateWith(50, 1), null, 'u1');
    const second = applyLegacyMenuDemoSession(stateWith(3, 1), first.session, 'u2');
    expect(second.session?.userId).toBe('u2');
    expect(second.state.tracks['ai-runner'].level).toBe('3');
  });

  it('clamps the session target complexity to the ladder bounds', () => {
    const base = createEmptyLegacyProgressionState();
    const wild = { ...base.tracks.player, level: '9999', targetComplexity: 1_000_000 };
    expect(startLegacyMenuDemoSessionTrack(wild, base.tracks['ai-runner']).targetComplexity)
      .toBe(LEGACY_PROGRESSION_MAX_COMPLEXITY);
    const nan = { ...base.tracks.player, targetComplexity: Number.NaN };
    expect(startLegacyMenuDemoSessionTrack(nan, base.tracks['ai-runner']).targetComplexity).toBe(8);
  });
});

describe('overlayLegacyMenuDemoSession', () => {
  it('is the identity with no session and puts the session track back otherwise', () => {
    const state = stateWith(4, 9);
    expect(overlayLegacyMenuDemoSession(state, null)).toBe(state);
    const session = applyLegacyMenuDemoSession(stateWith(4, 9), null, 'u1').session!;
    expect(overlayLegacyMenuDemoSession(state, session).tracks['ai-runner']).toBe(session.track);
  });
});

class MemoryStorage {
  public readonly values = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('createLegacyMenuDemoSessionProgressionStorage', () => {
  it('keeps the stored ai-runner track on progression writes and passes everything else through', () => {
    const storage = new MemoryStorage();
    const stored = stateWith(5, 2);
    storage.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(stored));
    const wrapped = createLegacyMenuDemoSessionProgressionStorage(storage, LEGACY_PROGRESSION_STORAGE_KEY)!;

    const next = stateWith(6, 44);
    wrapped.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(next));
    const written = JSON.parse(storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY)!) as LegacyProgressionState;
    expect(written.tracks.player.level).toBe('6');
    expect(written.tracks['ai-runner'].level).toBe('2');
    expect(wrapped.getItem(LEGACY_PROGRESSION_STORAGE_KEY)).toBe(storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY));

    wrapped.setItem('other-key', 'x');
    expect(storage.getItem('other-key')).toBe('x');
  });

  it('writes the empty demo track when nothing was stored yet', () => {
    const storage = new MemoryStorage();
    const wrapped = createLegacyMenuDemoSessionProgressionStorage(storage, LEGACY_PROGRESSION_STORAGE_KEY)!;
    wrapped.setItem(LEGACY_PROGRESSION_STORAGE_KEY, JSON.stringify(stateWith(6, 44)));
    const written = JSON.parse(storage.getItem(LEGACY_PROGRESSION_STORAGE_KEY)!) as LegacyProgressionState;
    expect(written.tracks['ai-runner']).toEqual(createEmptyLegacyProgressionState().tracks['ai-runner']);
    expect(createLegacyMenuDemoSessionProgressionStorage(undefined, LEGACY_PROGRESSION_STORAGE_KEY)).toBeUndefined();
  });
});
