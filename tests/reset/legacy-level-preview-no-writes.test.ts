import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getLegacyAuthClient } from '../../src/legacy-runtime/legacyAuth';
import {
  createLegacyLevelPreviewAuthSnapshot,
  createLegacyLevelPreviewProgressionState,
  createLegacyLevelPreviewStorage
} from '../../src/legacy-runtime/legacyLevelPreview';
import {
  bootstrapLegacyRemoteAccountStateForRoute,
  hydrateLegacyRemoteAccountState,
  LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY,
  replayLegacyRemoteCompletions,
  writeLegacyRemoteCompletion,
  writeLegacyRemoteCycleReceipt,
  writeLegacyRemoteProgressionState,
  writeLegacyRemoteSettings
} from '../../src/legacy-runtime/legacyRemoteProgression';
import { LEGACY_DEFAULTS } from '../../src/legacy-runtime/legacyDefaults';
import { shouldRunMazerInstallGateForBoot } from '../../src/boot/installGate';

vi.mock('../../src/legacy-runtime/legacyAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/legacy-runtime/legacyAuth')>();
  return {
    ...actual,
    getLegacyAuthClient: vi.fn(async () => null),
    readLegacyAuthSessionSnapshot: vi.fn()
  };
});

// Remote layer fully ENABLED: the only thing standing between a preview session
// and Supabase is the preview identity itself.
const ENABLED_ENV = { [LEGACY_REMOTE_PROGRESSION_ENABLED_ENV_KEY]: 'true' };

const createRealStorageSpy = () => ({
  getItem: vi.fn((): string | null => null),
  removeItem: vi.fn(),
  setItem: vi.fn()
});

beforeEach(() => {
  vi.mocked(getLegacyAuthClient).mockReset().mockResolvedValue(null);
});

describe('level preview never reaches the remote layer or real storage', () => {
  const snapshot = createLegacyLevelPreviewAuthSnapshot();
  const state = createLegacyLevelPreviewProgressionState(100);
  const next = createLegacyLevelPreviewProgressionState(101);

  test('every remote entry point is skipped before a client or storage is touched', async () => {
    const rpc = vi.fn();
    const from = vi.fn();
    vi.mocked(getLegacyAuthClient).mockResolvedValue({ from, rpc } as never);
    const real = createRealStorageSpy();
    const receipt = { id: 'r', surface: 'play' } as never;

    const results = [
      await writeLegacyRemoteCompletion(snapshot, state, next, receipt, ENABLED_ENV, real),
      await writeLegacyRemoteProgressionState(snapshot, next, ENABLED_ENV, 'replace'),
      await writeLegacyRemoteProgressionState(snapshot, next, ENABLED_ENV, 'advance'),
      await writeLegacyRemoteSettings(snapshot, LEGACY_DEFAULTS, ENABLED_ENV),
      await hydrateLegacyRemoteAccountState(snapshot, real, ENABLED_ENV),
      await writeLegacyRemoteCycleReceipt(snapshot, state, receipt, ENABLED_ENV)
    ];
    for (const result of results) {
      expect('synced' in result ? result.synced : false).toBe(false);
    }
    await replayLegacyRemoteCompletions(snapshot, next, ENABLED_ENV, real);

    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(getLegacyAuthClient).not.toHaveBeenCalled();
    expect(real.getItem).not.toHaveBeenCalled();
    expect(real.setItem).not.toHaveBeenCalled();
    expect(real.removeItem).not.toHaveBeenCalled();
  });

  test('the boot account bootstrap is skipped on the preview route and runs on an ordinary one', async () => {
    const bootstrap = vi.fn(async () => null);
    expect(await bootstrapLegacyRemoteAccountStateForRoute('?previewLevel=100', bootstrap)).toBeNull();
    expect(bootstrap).not.toHaveBeenCalled();
    await bootstrapLegacyRemoteAccountStateForRoute('?previewLevel=nope', bootstrap);
    await bootstrapLegacyRemoteAccountStateForRoute('', bootstrap);
    expect(bootstrap).toHaveBeenCalledTimes(2);
  });

  test('sandbox storage is separate from a real Storage even when both exist', () => {
    const real = createRealStorageSpy();
    const sandbox = createLegacyLevelPreviewStorage();
    sandbox.setItem('mazer.progression.v1', '{"x":1}');
    expect(real.setItem).not.toHaveBeenCalled();
    expect(sandbox.getItem('mazer.progression.v1')).toBe('{"x":1}');
  });

  test('install gate: the preview flag no longer lifts it (MAZER-PWA-007); only localhost does', () => {
    const base = {
      forceInstallGate: false,
      isLocalhostRuntime: false,
      legalRouteRequested: false,
      passwordRecoveryRequested: false
    };
    expect(shouldRunMazerInstallGateForBoot(base)).toBe(true);
    // The context type has no preview input at all: an extra key cannot change the answer.
    expect(shouldRunMazerInstallGateForBoot({ ...base, levelPreviewRequested: true } as typeof base)).toBe(true);
    expect(shouldRunMazerInstallGateForBoot({ ...base, isLocalhostRuntime: true })).toBe(false);
  });
});
