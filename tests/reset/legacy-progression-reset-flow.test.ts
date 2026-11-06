import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  INITIAL_LEGACY_PROGRESSION_RESET_STATE,
  LEGACY_PROGRESSION_RESET_ARM_DELAY_MS,
  LEGACY_PROGRESSION_RESET_COPY,
  LEGACY_PROGRESSION_RESET_LOCAL_EFFECTS,
  applyLegacyProgressionResetLocalEffects,
  buildLegacyProgressionResetConfirmView,
  reduceLegacyProgressionReset,
  resetLegacyProgressionState,
  resolveLegacyProgressionResetStatusLine,
  resolveLegacyProgressionResetStrategy,
  type LegacyProgressionResetEvent,
  type LegacyProgressionResetState
} from '../../src/legacy-runtime/legacyProgressionResetFlow';
import {
  LEGACY_PROGRESSION_STORAGE_KEY,
  createEmptyLegacyProgressionState,
  normalizeLegacyProgressionState,
  readLegacyProgressionState,
  type LegacyProgressionState
} from '../../src/legacy-runtime/legacyProgression';
import { MAZE_CYCLE_TELEMETRY_STORAGE_KEY } from '../../src/legacy-runtime/mazeCycleTelemetry';
import { LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY } from '../../src/legacy-runtime/legacyRemoteProgression';

const NOW = '2026-11-06T12:00:00.000Z';

const advancedState = (): LegacyProgressionState => {
  const base = createEmptyLegacyProgressionState();
  return {
    ...base,
    tracks: {
      'ai-runner': { ...base.tracks['ai-runner'], completedCycles: '12', level: '13', targetComplexity: 80 },
      player: { ...base.tracks.player, completedCycles: '41', level: '42', peakComplexity: 120, targetComplexity: 90 }
    },
    updatedAt: '2026-11-05T08:00:00.000Z'
  };
};

describe('resetLegacyProgressionState', () => {
  test('returns both tracks to the baseline (matches mazer_reset_progression, which also resets menu-runner)', () => {
    const reset = resetLegacyProgressionState(advancedState(), NOW);
    const baseline = createEmptyLegacyProgressionState();
    expect(reset.tracks.player).toEqual(baseline.tracks.player);
    expect(reset.tracks['ai-runner']).toEqual(baseline.tracks['ai-runner']);
    expect(reset.tracks.player.level).toBe('1');
    expect(reset.tracks.player.completedCycles).toBe('0');
    expect(reset.updatedAt).toBe(NOW);
    expect(reset.version).toBe(1);
  });

  test('keeps the current baseline versions and provenance sentinel so the save is not failed closed on read', () => {
    const reset = resetLegacyProgressionState(advancedState(), NOW);
    expect(reset.playerProgressionBaselineVersion).toBe(createEmptyLegacyProgressionState().playerProgressionBaselineVersion);
    expect(reset.aiRunnerBaselineVersion).toBe(createEmptyLegacyProgressionState().aiRunnerBaselineVersion);
    expect(normalizeLegacyProgressionState(reset)).toEqual(reset);
  });

  test('is idempotent, and an already-baseline state is returned unchanged including updatedAt', () => {
    const once = resetLegacyProgressionState(advancedState(), NOW);
    const twice = resetLegacyProgressionState(once, '2027-01-01T00:00:00.000Z');
    expect(twice).toEqual(once);
    expect(twice.updatedAt).toBe(NOW);
    const fresh = createEmptyLegacyProgressionState();
    expect(resetLegacyProgressionState(fresh, NOW)).toEqual(normalizeLegacyProgressionState(fresh));
    expect(resetLegacyProgressionState(fresh, NOW).updatedAt).toBeNull();
  });

  test('does not mutate its input and handles ordinals beyond Number.MAX_SAFE_INTEGER', () => {
    const base = createEmptyLegacyProgressionState();
    const huge: LegacyProgressionState = {
      ...base,
      tracks: {
        ...base.tracks,
        player: { ...base.tracks.player, completedCycles: '9007199254740993', level: '9007199254740994' }
      }
    };
    const snapshot = JSON.stringify(huge);
    const reset = resetLegacyProgressionState(huge, NOW);
    expect(JSON.stringify(huge)).toBe(snapshot);
    expect(reset.tracks.player.level).toBe('1');
  });

  test('state carries no account, profile or settings fields to preserve: only progression keys exist', () => {
    expect(Object.keys(createEmptyLegacyProgressionState()).sort()).toEqual([
      'aiRunnerBaselineVersion',
      'playerProgressionBaselineVersion',
      'tracks',
      'updatedAt',
      'version'
    ]);
  });
});

describe('local effects plan', () => {
  test('key bases equal the real storage keys and exclude settings, auth and sync metadata', () => {
    expect(LEGACY_PROGRESSION_RESET_LOCAL_EFFECTS.map((e) => e.keyBase)).toEqual([
      LEGACY_PROGRESSION_STORAGE_KEY,
      LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY,
      MAZE_CYCLE_TELEMETRY_STORAGE_KEY
    ]);
    for (const effect of LEGACY_PROGRESSION_RESET_LOCAL_EFFECTS) {
      expect(effect.keyBase).not.toMatch(/game-toggles|auth|account-sync|tutorial/);
    }
  });

  test('applies only to the scoped progression/outbox/telemetry keys and leaves every other key untouched', () => {
    const store = new Map<string, string>([
      ['mazer.progression.v1:user:abc', JSON.stringify(advancedState())],
      ['mazer.remote-completion-outbox.v1:user:abc', '{"entries":[{"x":1}],"version":1}'],
      ['mazer.cycle-telemetry.v1:user:abc', '{"receipts":[1]}'],
      ['mazer.game-toggles.v1:user:abc', '{"camScale":3}'],
      ['mazer.auth.remembered-identity.v1', '{"u":"abc"}'],
      ['mazer.remote-account-sync.v1:user:abc', '{"progressionRevision":7}'],
      ['mazer.progression.v1:user:other', 'KEEP']
    ]);
    const storage = {
      removeItem: (key: string) => { store.delete(key); },
      setItem: (key: string, value: string) => { store.set(key, value); }
    };
    const result = applyLegacyProgressionResetLocalEffects(storage, (base) => `${base}:user:abc`, NOW);
    expect(result.ok).toBe(true);
    expect(store.has('mazer.remote-completion-outbox.v1:user:abc')).toBe(false);
    expect(store.has('mazer.cycle-telemetry.v1:user:abc')).toBe(false);
    expect(store.get('mazer.game-toggles.v1:user:abc')).toBe('{"camScale":3}');
    expect(store.get('mazer.auth.remembered-identity.v1')).toBe('{"u":"abc"}');
    expect(store.get('mazer.remote-account-sync.v1:user:abc')).toBe('{"progressionRevision":7}');
    expect(store.get('mazer.progression.v1:user:other')).toBe('KEEP');
    const read = readLegacyProgressionState({
      getItem: (key: string) => store.get(key.replace(LEGACY_PROGRESSION_STORAGE_KEY, `${LEGACY_PROGRESSION_STORAGE_KEY}:user:abc`)) ?? null,
      setItem: () => undefined
    });
    expect(read.tracks.player.level).toBe('1');
    expect(read).toEqual(result.state);
  });

  test('reports ok:false instead of throwing when storage fails', () => {
    const result = applyLegacyProgressionResetLocalEffects({
      removeItem: () => { throw new Error('quota'); },
      setItem: () => { throw new Error('quota'); }
    }, (base) => base, NOW);
    expect(result.ok).toBe(false);
  });
});

describe('strategy', () => {
  const base = { online: true, remoteProgressionEnabled: true, userId: 'u1' };

  test('signed in + remote on + online: server first', () => {
    expect(resolveLegacyProgressionResetStrategy(base)).toEqual({ kind: 'server-first', scope: 'account' });
  });

  test('offline signed-in account is blocked, never faked locally', () => {
    expect(resolveLegacyProgressionResetStrategy({ ...base, online: false })).toEqual({ kind: 'blocked', reason: 'offline' });
  });

  test('guest and remote-disabled reset this device only; offline is fine there', () => {
    expect(resolveLegacyProgressionResetStrategy({ ...base, online: false, userId: null })).toEqual({ kind: 'local-only', scope: 'device' });
    expect(resolveLegacyProgressionResetStrategy({ ...base, online: false, remoteProgressionEnabled: false })).toEqual({ kind: 'local-only', scope: 'device' });
  });

  test('a pending session blocks before anything else', () => {
    expect(resolveLegacyProgressionResetStrategy({ ...base, sessionPending: true })).toEqual({ kind: 'blocked', reason: 'session-pending' });
  });
});

describe('reset reducer', () => {
  const serverFirst = { kind: 'server-first', scope: 'account' } as const;
  const request = (overrides: Partial<Extract<LegacyProgressionResetEvent, { type: 'request' }>> = {}): LegacyProgressionResetEvent => ({
    level: '42',
    nowMs: 1000,
    runActive: false,
    strategy: serverFirst,
    type: 'request',
    ...overrides
  });
  const run = (events: LegacyProgressionResetEvent[], from: LegacyProgressionResetState = INITIAL_LEGACY_PROGRESSION_RESET_STATE): LegacyProgressionResetState => (
    events.reduce(reduceLegacyProgressionReset, from)
  );
  const armedAt = 1000 + LEGACY_PROGRESSION_RESET_ARM_DELAY_MS;

  test('starts idle; request opens confirm with the level and scope, nothing is reset yet', () => {
    expect(run([request()])).toEqual({ level: '42', openedAtMs: 1000, phase: 'confirm', scope: 'account' });
  });

  test('happy path: idle -> confirm -> working -> done', () => {
    const done = run([request(), { nowMs: armedAt, type: 'confirm' }, { type: 'succeeded' }]);
    expect(done).toEqual({ phase: 'done', previousLevel: '42', scope: 'account' });
    expect(run([{ type: 'dismiss' }], done)).toEqual({ phase: 'idle' });
  });

  test('cancel path: confirm -> cancelled -> idle', () => {
    const cancelled = run([request(), { type: 'cancel' }]);
    expect(cancelled).toEqual({ phase: 'cancelled' });
    expect(run([{ type: 'dismiss' }], cancelled)).toEqual({ phase: 'idle' });
  });

  test('a confirm tap before the arm delay is ignored (ghost or double tap)', () => {
    const confirming = run([request()]);
    expect(run([{ nowMs: 1000 + LEGACY_PROGRESSION_RESET_ARM_DELAY_MS - 1, type: 'confirm' }], confirming)).toBe(confirming);
    expect(run([{ nowMs: armedAt, type: 'confirm' }], confirming).phase).toBe('working');
  });

  test('confirm from idle, cancelled, done or failed can never start a reset', () => {
    for (const state of [
      { phase: 'idle' },
      { phase: 'cancelled' },
      { phase: 'done', previousLevel: '3', scope: 'device' },
      { failure: 'network', level: '3', phase: 'failed', scope: 'account' }
    ] as LegacyProgressionResetState[]) {
      expect(reduceLegacyProgressionReset(state, { nowMs: 10 ** 9, type: 'confirm' })).toBe(state);
    }
  });

  test('succeeded and failed only apply to an in-flight reset', () => {
    const idle = INITIAL_LEGACY_PROGRESSION_RESET_STATE;
    expect(reduceLegacyProgressionReset(idle, { type: 'succeeded' })).toBe(idle);
    const confirming = run([request()]);
    expect(reduceLegacyProgressionReset(confirming, { type: 'succeeded' })).toBe(confirming);
    expect(reduceLegacyProgressionReset(confirming, { failure: 'unknown', type: 'failed' })).toBe(confirming);
  });

  test('failure keeps the level, offers cancel, and reports a conflict distinctly', () => {
    const failed = run([request(), { nowMs: armedAt, type: 'confirm' }, { failure: 'conflict', type: 'failed' }]);
    expect(failed).toEqual({ failure: 'conflict', level: '42', phase: 'failed', scope: 'account' });
    if (failed.phase !== 'failed') {
      throw new Error('expected failed');
    }
    expect(resolveLegacyProgressionResetStatusLine(failed)).toBe(LEGACY_PROGRESSION_RESET_COPY.failedConflict);
    expect(run([{ type: 'cancel' }], failed)).toEqual({ phase: 'cancelled' });
  });

  test('working cannot be cancelled or re-requested while the server call is in flight', () => {
    const working = run([request(), { nowMs: armedAt, type: 'confirm' }]);
    expect(reduceLegacyProgressionReset(working, { type: 'cancel' })).toBe(working);
    expect(reduceLegacyProgressionReset(working, request())).toBe(working);
    expect(reduceLegacyProgressionReset(working, { type: 'dismiss' })).toBe(working);
  });

  test('re-requesting while the sheet is open is a no-op', () => {
    const confirming = run([request()]);
    expect(reduceLegacyProgressionReset(confirming, request({ level: '99', nowMs: 5000 }))).toBe(confirming);
  });

  test('an active run blocks the request (reset while a run is active)', () => {
    expect(run([request({ runActive: true })])).toEqual({ phase: 'blocked', reason: 'run-active' });
  });

  test('blocked strategies surface as blocked with the reason and expose the status line', () => {
    const offline = run([request({ strategy: { kind: 'blocked', reason: 'offline' } })]);
    expect(offline).toEqual({ phase: 'blocked', reason: 'offline' });
    if (offline.phase !== 'blocked') {
      throw new Error('expected blocked');
    }
    expect(resolveLegacyProgressionResetStatusLine(offline)).toBe(LEGACY_PROGRESSION_RESET_COPY.blockedOffline);
    expect(run([{ type: 'cancel' }], offline)).toEqual({ phase: 'cancelled' });
  });

  test('a level change while the sheet is open updates the shown level and re-arms the confirm button', () => {
    const confirming = run([request()]);
    const changed = run([{ level: '43', nowMs: 5000, type: 'level-changed' }], confirming);
    expect(changed).toEqual({ level: '43', openedAtMs: 5000, phase: 'confirm', scope: 'account' });
    expect(run([{ nowMs: 5000 + LEGACY_PROGRESSION_RESET_ARM_DELAY_MS - 1, type: 'confirm' }], changed)).toBe(changed);
    expect(reduceLegacyProgressionReset(confirming, { level: '42', nowMs: 5000, type: 'level-changed' })).toBe(confirming);
  });

  test('the reducer is total: every state x event returns a defined state and never mutates', () => {
    const states: LegacyProgressionResetState[] = [
      { phase: 'idle' },
      { phase: 'blocked', reason: 'offline' },
      { level: '5', openedAtMs: 0, phase: 'confirm', scope: 'device' },
      { level: '5', phase: 'working', scope: 'device' },
      { phase: 'done', previousLevel: '5', scope: 'device' },
      { failure: 'unknown', level: '5', phase: 'failed', scope: 'device' },
      { phase: 'cancelled' }
    ];
    const events: LegacyProgressionResetEvent[] = [
      request(),
      { type: 'cancel' },
      { nowMs: 10 ** 6, type: 'confirm' },
      { level: '6', nowMs: 10, type: 'level-changed' },
      { type: 'succeeded' },
      { failure: 'network', type: 'failed' },
      { type: 'dismiss' }
    ];
    for (const state of states) {
      const frozen = JSON.stringify(state);
      for (const event of events) {
        expect(reduceLegacyProgressionReset(state, event)).toBeDefined();
        expect(JSON.stringify(state)).toBe(frozen);
      }
    }
  });
});

describe('confirm view', () => {
  const confirming: Extract<LegacyProgressionResetState, { phase: 'confirm' }> = { level: '42', openedAtMs: 0, phase: 'confirm', scope: 'account' };

  test('shows the level being lost, a short consequence line, Cancel first and default, destructive second', () => {
    const view = buildLegacyProgressionResetConfirmView(confirming, LEGACY_PROGRESSION_RESET_ARM_DELAY_MS);
    expect(view.levelLine).toBe('Level 42 → Level 1');
    expect(view.consequence).toBe(LEGACY_PROGRESSION_RESET_COPY.accountConsequence);
    expect(view.consequence.length).toBeLessThanOrEqual(160);
    expect(view.buttons.map((b) => b.id)).toEqual(['cancel', 'confirm']);
    expect(view.buttons[0]).toMatchObject({ emphasis: 'primary', enabled: true, isDefault: true });
    expect(view.buttons[1]).toMatchObject({ emphasis: 'danger', enabled: true, isDefault: false, label: 'Reset to Level 1' });
  });

  test('the destructive button is disabled until armed and while working', () => {
    expect(buildLegacyProgressionResetConfirmView(confirming, 0).buttons[1].enabled).toBe(false);
    expect(buildLegacyProgressionResetConfirmView({ level: '42', phase: 'working', scope: 'account' }, 10 ** 6).buttons[1].enabled).toBe(false);
  });

  test('device scope uses the device consequence line', () => {
    expect(buildLegacyProgressionResetConfirmView({ ...confirming, scope: 'device' }, 10 ** 6).consequence).toBe(LEGACY_PROGRESSION_RESET_COPY.deviceConsequence);
  });

  test('copy never names the account as being deleted, never uses rank/skill vocabulary, and says what stays', () => {
    const all = Object.values(LEGACY_PROGRESSION_RESET_COPY).join(' ');
    expect(all).not.toMatch(/\brank\b|skill/i);
    expect(LEGACY_PROGRESSION_RESET_COPY.accountConsequence).toMatch(/account, username and settings stay/);
    expect(LEGACY_PROGRESSION_RESET_COPY.accountConsequence).toMatch(/can.t be undone/);
  });
});

describe('contract with the existing server operation (source pins)', () => {
  const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

  test('the client already calls mazer_reset_progression in the replace write mode, and the migration resets both tracks', () => {
    const client = read('src/legacy-runtime/legacyRemoteProgression.ts');
    expect(client).toContain("rpc('mazer_reset_progression'");
    expect(client).toContain("'advance' | 'replace'");
    const migration = read('supabase/migrations/20260822000100_mazer_endless_completion_rpc.sql');
    expect(migration).toContain('public.mazer_reset_progression');
    expect(migration).toContain("'menu-runner'");
    expect(migration).toMatch(/player_level = 1/);
  });
});
