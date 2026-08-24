import { describe, expect, it } from 'vitest';
import { PLATFORM_PROFILE_IDS, PLATFORM_PROFILES, resolveUiProfile } from '../../src/state/uiProfiles';

interface Violation {
  rule: string;
  path: string;
  message: string;
}

interface Checker {
  readPlatformProfiles: () => Record<string, any>;
  readDecisionRegistryForProfiles: () => Record<string, any>;
  collectPlatformProfileViolations: (registry: Record<string, any>) => Violation[];
  collectWaveOwnershipViolationsForProfiles: (paths: string[], registry: Record<string, any>) => Violation[];
  checkPlatformProfiles: () => true;
}

const loadChecker = async (): Promise<Checker> => import('../../scripts/check-ui-platform-profiles.mjs') as Promise<Checker>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('Mazer UI platform profile contract', () => {
  it('matches all seven authoritative profiles exactly', async () => {
    const { readPlatformProfiles, collectPlatformProfileViolations, checkPlatformProfiles } = await loadChecker();
    const registry = readPlatformProfiles();
    expect(collectPlatformProfileViolations(registry)).toEqual([]);
    expect(checkPlatformProfiles()).toBe(true);
    expect(Object.keys(registry.profiles)).toEqual([...PLATFORM_PROFILE_IDS]);
    for (const id of PLATFORM_PROFILE_IDS) {
      expect(PLATFORM_PROFILES[id]).toEqual({ id, ...registry.profiles[id] });
      expect(resolveUiProfile(id)).toBe(PLATFORM_PROFILES[id]);
      expect(Object.isFrozen(PLATFORM_PROFILES[id])).toBe(true);
      expect(Object.isFrozen(PLATFORM_PROFILES[id].input)).toBe(true);
    }
    expect(resolveUiProfile('unknown-profile')).toBeNull();
  });

  it('fails closed on missing, extra, and capability-drifted profiles', async () => {
    const { readPlatformProfiles, collectPlatformProfileViolations } = await loadChecker();
    const missing = clone(readPlatformProfiles());
    delete missing.profiles.arcade;
    expect(collectPlatformProfileViolations(missing).some((entry) => entry.rule === 'profile-missing')).toBe(true);

    const extra = clone(readPlatformProfiles());
    extra.profiles.theme = { auth: true, sync: true, input: ['touch'], chrome: 'full' };
    expect(collectPlatformProfileViolations(extra).some((entry) => entry.rule === 'unknown-profile')).toBe(true);

    const drifted = clone(readPlatformProfiles());
    drifted.profiles.obs.auth = true;
    expect(collectPlatformProfileViolations(drifted).some((entry) => entry.rule === 'profile-contract-drift')).toBe(true);
  });

  it('preserves dependency-ordered ownership for this Wave 1A lane', async () => {
    const { readDecisionRegistryForProfiles, collectWaveOwnershipViolationsForProfiles } = await loadChecker();
    const decisions = readDecisionRegistryForProfiles();
    expect(collectWaveOwnershipViolationsForProfiles([
      'docs/contracts/mazer-ui-rework-platform-profiles.v1.json',
      'docs/architecture/MAZER-UI-REWORK-PLATFORM-PROFILES.md',
      'scripts/check-ui-platform-profiles.mjs',
      'src/state/uiProfiles.ts',
      'tests/architecture/ui-platform-profiles-contract.test.ts'
    ], decisions)).toEqual([]);
    expect(collectWaveOwnershipViolationsForProfiles(['src/scenes/MenuScene.ts'], decisions)).toEqual([
      expect.objectContaining({ rule: 'integrator-wave-ownership-mismatch', path: 'src/scenes/MenuScene.ts' })
    ]);
  });
});
