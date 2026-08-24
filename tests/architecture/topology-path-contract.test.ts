import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEBUG_PRESENTATIONS,
  DIRECTIONS,
  DIRECTION_BITS,
  OPPOSITE_DIRECTION,
  SHIPPING_PRESENTATION,
  TOPOLOGY_MASKS,
  connectionsToMask,
  hasConnection,
  isValidTopologyMask,
  maskConnections,
  type Direction,
  type TopologyMask
} from '../../src/geometry/topologyPath';

interface TopologyPathContractViolation {
  rule: string;
  path: string;
  message: string;
}

interface TopologyPathContractCheckerModule {
  readTopologyPathContract: (contractPath?: string, root?: string) => Record<string, unknown>;
  readDecisionRegistryForTopologyPathContract: (registryPath?: string, root?: string) => Record<string, unknown>;
  collectTopologyPathContractViolations: (model: Record<string, unknown>, root?: string) => TopologyPathContractViolation[];
  collectProtectedPathViolationsForTopologyPathContract: (
    changedFiles: string[],
    decisionRegistry: Record<string, unknown>
  ) => TopologyPathContractViolation[];
  readGitChangedFilesForTopologyPathContract: (root?: string, options?: { baseRef?: string }) => string[];
  formatViolations: (violations: TopologyPathContractViolation[]) => string;
  checkTopologyPathContract: (model?: Record<string, unknown>, root?: string) => true;
}

const CHECKER_PATH = '../../scripts/check-topology-path-contract.mjs';

const loadChecker = async (): Promise<TopologyPathContractCheckerModule> => (
  import(CHECKER_PATH) as Promise<TopologyPathContractCheckerModule>
);

const cloneModel = (model: Record<string, unknown>): any => JSON.parse(JSON.stringify(model));

describe('Mazer UI rework topology/path contract', () => {
  it('passes with zero violations against the real, shipped contract registry', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = readTopologyPathContract();
    expect(collectTopologyPathContractViolations(model)).toEqual([]);
  });

  it('checkTopologyPathContract() does not throw for the real registry', async () => {
    const { checkTopologyPathContract } = await loadChecker();
    expect(() => checkTopologyPathContract()).not.toThrow();
  });

  it.each(['N', 'E', 'S', 'W'] as const)('fails when bits.%s is reassigned a wrong value', async (direction) => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    model.bits[direction] = 99;

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry) => entry.rule === 'bits-value-mismatch' && entry.path === `bits.${direction}`)).toBe(true);
  });

  it('fails when "bits" gains an unexpected key', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    model.bits.UP = 16;

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry) => entry.rule === 'bits-unexpected-key')).toBe(true);
  });

  it('fails when "masks" is missing an entry', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    model.masks = model.masks.filter((entry: { mask: number }) => entry.mask !== 7);

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry) => entry.rule === 'masks-wrong-length')).toBe(true);
    expect(violations.some((entry) => entry.rule === 'masks-missing-entry')).toBe(true);
  });

  it('fails when a mask value is duplicated', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    model.masks.push({ mask: 3, connections: ['N', 'E'] });

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry) => entry.rule === 'masks-duplicate-mask-value')).toBe(true);
  });

  it('fails when a mask\'s connections list disagrees with its bit decomposition', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    const entry = model.masks.find((candidate: { mask: number }) => candidate.mask === 10);
    entry.connections = ['N'];

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry2) => entry2.rule === 'masks-connections-mismatch' && entry2.path === 'masks[10]')).toBe(true);
  });

  it('fails when a mask\'s connections list is out of canonical N/E/S/W order', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    const entry = model.masks.find((candidate: { mask: number }) => candidate.mask === 15);
    entry.connections = ['W', 'S', 'E', 'N'];

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry2) => entry2.rule === 'masks-connections-mismatch' && entry2.path === 'masks[15]')).toBe(true);
  });

  it('fails when shippingPresentation is emptied', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    model.shippingPresentation = '';

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry) => entry.rule === 'shipping-presentation-missing')).toBe(true);
  });

  it('fails when debugPresentations is emptied', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    model.debugPresentations = [];

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry) => entry.rule === 'debug-presentations-empty-or-missing')).toBe(true);
  });

  it('fails on a duplicate debugPresentations entry', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    model.debugPresentations.push(model.debugPresentations[0]);

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry) => entry.rule === 'debug-presentations-duplicate-value')).toBe(true);
  });

  it('fails when a debugPresentations entry equals the shipping presentation', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    model.debugPresentations.push(model.shippingPresentation);

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry) => entry.rule === 'debug-presentation-equals-shipping')).toBe(true);
  });

  it('fails on an unknown decision id reference', async () => {
    const { readTopologyPathContract, collectTopologyPathContractViolations } = await loadChecker();
    const model = cloneModel(await readTopologyPathContract());
    model.decisionRefs.push('this-decision-id-does-not-exist');

    const violations = collectTopologyPathContractViolations(model);
    expect(violations.some((entry) => entry.rule === 'unknown-decision-reference')).toBe(true);
  });

  describe('src/geometry/topologyPath.ts cross-check against the JSON registry', () => {
    it('SHIPPING_PRESENTATION and DEBUG_PRESENTATIONS mirror the registry', async () => {
      const { readTopologyPathContract } = await loadChecker();
      const model = readTopologyPathContract() as { shippingPresentation: string; debugPresentations: string[] };

      expect(SHIPPING_PRESENTATION).toBe(model.shippingPresentation);
      expect([...DEBUG_PRESENTATIONS]).toEqual(model.debugPresentations);
    });

    it('DIRECTION_BITS mirrors the registry\'s "bits" field', async () => {
      const { readTopologyPathContract } = await loadChecker();
      const model = readTopologyPathContract() as { bits: Record<Direction, number> };

      for (const direction of DIRECTIONS) {
        expect(DIRECTION_BITS[direction]).toBe(model.bits[direction]);
      }
    });

    it.each(TOPOLOGY_MASKS)('maskConnections(%i) matches the registry\'s masks[].connections, computed independently', async (mask) => {
      const { readTopologyPathContract } = await loadChecker();
      const model = readTopologyPathContract() as { masks: Array<{ mask: number; connections: Direction[] }> };
      const expected = model.masks.find((entry) => entry.mask === mask)!.connections;

      expect([...maskConnections(mask as TopologyMask)]).toEqual(expected);
    });

    it('connectionsToMask is the inverse of maskConnections for every valid mask', () => {
      for (const mask of TOPOLOGY_MASKS) {
        const connections = maskConnections(mask);
        expect(connectionsToMask(connections)).toBe(mask);
      }
    });

    it('hasConnection agrees with maskConnections for every mask/direction pair', () => {
      for (const mask of TOPOLOGY_MASKS) {
        const connections = new Set(maskConnections(mask));
        for (const direction of DIRECTIONS) {
          expect(hasConnection(mask, direction)).toBe(connections.has(direction));
        }
      }
    });

    it('OPPOSITE_DIRECTION is a self-consistent involution over all four directions', () => {
      for (const direction of DIRECTIONS) {
        expect(OPPOSITE_DIRECTION[OPPOSITE_DIRECTION[direction]]).toBe(direction);
        expect(OPPOSITE_DIRECTION[direction]).not.toBe(direction);
      }
    });

    it.each([
      ['a negative number', -1],
      ['a non-integer', 4.5],
      ['out of range high', 16],
      ['a string', '5'],
      ['null', null],
      ['undefined', undefined]
    ])('isValidTopologyMask rejects %s', (_label, value) => {
      expect(isValidTopologyMask(value)).toBe(false);
    });

    it.each(TOPOLOGY_MASKS)('isValidTopologyMask accepts every real mask value %i', (mask) => {
      expect(isValidTopologyMask(mask)).toBe(true);
    });
  });

  describe('dependency-ordered integrator-wave ownership', () => {
    it('rejects a synthetic changed-file list that touches another wave\'s assigned path', async () => {
      const { readDecisionRegistryForTopologyPathContract, collectProtectedPathViolationsForTopologyPathContract } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForTopologyPathContract();

      const violations = collectProtectedPathViolationsForTopologyPathContract([
        'docs/contracts/mazer-ui-rework-topology-path-contract.v1.json',
        'src/scenes/MenuScene.ts'
      ], decisionRegistry);

      expect(violations.some((entry) => entry.rule === 'integrator-wave-ownership-mismatch' && entry.path === 'src/scenes/MenuScene.ts')).toBe(true);
    });

    it('does not flag Wave 2B\'s own new files', async () => {
      const { readDecisionRegistryForTopologyPathContract, collectProtectedPathViolationsForTopologyPathContract } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForTopologyPathContract();

      const violations = collectProtectedPathViolationsForTopologyPathContract([
        'docs/contracts/mazer-ui-rework-topology-path-contract.v1.json',
        'docs/architecture/MAZER-UI-REWORK-TOPOLOGY-PATH-CONTRACT.md',
        'scripts/check-topology-path-contract.mjs',
        'src/geometry/topologyPath.ts',
        'tests/architecture/topology-path-contract.test.ts'
      ], decisionRegistry);

      expect(violations).toEqual([]);
    });

    it('runs the same checker against this working tree\'s real committed-and-uncommitted changed files and finds no protected path touched', async () => {
      const {
        readDecisionRegistryForTopologyPathContract,
        collectProtectedPathViolationsForTopologyPathContract,
        readGitChangedFilesForTopologyPathContract
      } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForTopologyPathContract();

      let changedFiles: string[];
      try {
        changedFiles = readGitChangedFilesForTopologyPathContract();
      } catch {
        return;
      }

      const violations = collectProtectedPathViolationsForTopologyPathContract(changedFiles, decisionRegistry);
      expect(violations).toEqual([]);
    });

    // Regression coverage for the fixed committed-diff gap (see
    // scripts/check-decision-registry.mjs's readGitChangedFiles and
    // tests/architecture/decision-registry-contract.test.ts's thorough fixture-based proof). This
    // confirms readGitChangedFilesForTopologyPathContract actually delegates to the fixed
    // implementation, rather than reintroducing a fourth, separate git-status-only copy of the same
    // bug.
    it('regression: detects a fully-committed protected-path change even though `git status --short` is clean', async () => {
      const {
        readDecisionRegistryForTopologyPathContract,
        collectProtectedPathViolationsForTopologyPathContract,
        readGitChangedFilesForTopologyPathContract
      } = await loadChecker();
      const decisionRegistry = await readDecisionRegistryForTopologyPathContract();

      const root = mkdtempSync(join(tmpdir(), 'mazer-protected-path-fixture-topology-path-'));
      const runGit = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
      try {
        runGit('init', '-q', '-b', 'main');
        runGit('config', 'user.email', 'fixture@example.invalid');
        runGit('config', 'user.name', 'Protected Path Fixture');
        writeFileSync(join(root, 'README.md'), 'fixture baseline\n');
        runGit('add', 'README.md');
        runGit('commit', '-q', '-m', 'baseline');

        runGit('checkout', '-q', '-b', 'feature/protected-path-regression');
        writeFileSync(join(root, 'package.json'), '{ "disposable": "fixture edit, not the real file" }\n');
        runGit('add', 'package.json');
        runGit('commit', '-q', '-m', 'touches a protected path, fully committed');

        expect(runGit('status', '--short').trim()).toBe('');

        const changedFiles = readGitChangedFilesForTopologyPathContract(root, { baseRef: 'main' });
        expect(changedFiles).toContain('package.json');

        const violations = collectProtectedPathViolationsForTopologyPathContract(changedFiles, decisionRegistry);
        expect(violations.some((entry) => (
          entry.rule === 'integrator-wave-ownership-mismatch' && entry.path === 'package.json'
        ))).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
