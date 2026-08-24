import { describe, expect, it } from 'vitest';

interface Violation {
  rule: string;
  path: string;
  message: string;
}

interface Checker {
  readComponentRegistry: () => Record<string, any>;
  readDecisionRegistryForComponents: () => Record<string, any>;
  collectComponentRegistryViolations: (registry: Record<string, any>) => Violation[];
  collectWaveOwnershipViolationsForComponents: (paths: string[], registry: Record<string, any>) => Violation[];
  checkComponentRegistry: () => true;
}

const loadChecker = async (): Promise<Checker> => import('../../scripts/check-ui-component-registry.mjs') as Promise<Checker>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('Mazer UI component registry contract', () => {
  it('matches the authoritative component categories exactly', async () => {
    const { readComponentRegistry, collectComponentRegistryViolations, checkComponentRegistry } = await loadChecker();
    const registry = readComponentRegistry();
    expect(collectComponentRegistryViolations(registry)).toEqual([]);
    expect(checkComponentRegistry()).toBe(true);
    expect(registry.shared).toContain('UiStore');
    expect(registry.domFoundation).toContain('MazerPasswordField');
    expect(registry.domProduct).toContain('GameplayHUD');
    expect(registry.domProduct).toContain('LeaderboardScreen');
    expect(registry.phaser).toContain('CorridorRenderer');
    expect(registry.internal).toContain('CaptureMetadata');
  });

  it('fails closed on missing, reordered, extra, or multiply-owned components', async () => {
    const { readComponentRegistry, collectComponentRegistryViolations } = await loadChecker();
    const missing = clone(readComponentRegistry());
    missing.shared.shift();
    expect(collectComponentRegistryViolations(missing).some((entry) => entry.rule === 'component-contract-drift')).toBe(true);

    const reordered = clone(readComponentRegistry());
    reordered.phaser.reverse();
    expect(collectComponentRegistryViolations(reordered).some((entry) => entry.rule === 'component-contract-drift')).toBe(true);

    const duplicate = clone(readComponentRegistry());
    duplicate.internal.push('UiStore');
    const duplicateViolations = collectComponentRegistryViolations(duplicate);
    expect(duplicateViolations.some((entry) => entry.rule === 'duplicate-component-owner')).toBe(true);

    const unknownCategory = clone(readComponentRegistry());
    unknownCategory.unownedWidgets = ['MysteryWidget'];
    expect(collectComponentRegistryViolations(unknownCategory)).toEqual([
      expect.objectContaining({ rule: 'unknown-component-category', path: 'unownedWidgets' })
    ]);
  });

  it('keeps DOM and Phaser ownership disjoint under Wave 1A', async () => {
    const { readDecisionRegistryForComponents, collectWaveOwnershipViolationsForComponents } = await loadChecker();
    const decisions = readDecisionRegistryForComponents();
    expect(collectWaveOwnershipViolationsForComponents([
      'docs/contracts/mazer-ui-rework-component-registry.v1.json',
      'docs/architecture/MAZER-UI-REWORK-COMPONENT-REGISTRY.md',
      'scripts/check-ui-component-registry.mjs',
      'tests/architecture/ui-component-registry-contract.test.ts'
    ], decisions)).toEqual([]);
    expect(collectWaveOwnershipViolationsForComponents(['src/scenes/menuRuntimeDiagnostics.ts'], decisions)).toEqual([
      expect.objectContaining({ rule: 'integrator-wave-ownership-mismatch', path: 'src/scenes/menuRuntimeDiagnostics.ts' })
    ]);
  });
});
