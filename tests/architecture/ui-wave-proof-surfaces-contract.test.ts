import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// MAZER-UI-028: a UI rework wave cannot be done without a committed headless capture of each surface it changes.

interface Surface { id: string; description: string; captureScript: string }
interface Proof { status: 'not-captured' | 'captured'; done: boolean; evidenceDir: string | null }
interface Wave { wave: string; title: string; surfaces: Surface[]; proof: Proof }
interface Manifest {
  evidenceRoot: string;
  waivers: { wave: string; reason: string }[];
  waves: Wave[];
}

const root = process.cwd();
const readJson = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T;
const manifest = readJson<Manifest>('docs/contracts/mazer-ui-rework-wave-proof-surfaces.v1.json');
const registry = readJson<{ integratorWaveOwnership: { assignments: { wave: string; status: string }[] } }>(
  'docs/contracts/mazer-ui-rework-decision-registry.v1.json'
);

/** Wave ids that may be done without a committed capture today. Ratchet: this list only ever shrinks. */
const MAX_WAIVED_WAVES: readonly string[] = ['3A'];

interface ProofProblem { wave: string; problem: string }

const collectWaveProofProblems = (
  waves: readonly Wave[],
  registryStatus: Readonly<Record<string, string>>,
  waivedWaves: readonly string[],
  fileExists: (path: string) => boolean,
  listDir: (path: string) => string[]
): ProofProblem[] => {
  const problems: ProofProblem[] = [];
  for (const entry of waves) {
    const done = entry.proof.done || registryStatus[entry.wave] === 'completed';
    if (entry.surfaces.length === 0 && done) {
      problems.push({ wave: entry.wave, problem: 'done wave lists no surfaces' });
    }
    for (const surface of entry.surfaces) {
      if (!fileExists(surface.captureScript)) {
        problems.push({ wave: entry.wave, problem: `capture script missing for ${surface.id}: ${surface.captureScript}` });
      }
    }
    if (!done) {
      continue;
    }
    const captured = entry.proof.status === 'captured'
      && entry.proof.evidenceDir !== null
      && fileExists(`${entry.proof.evidenceDir}/metadata.json`)
      && listDir(entry.proof.evidenceDir).some((name) => /\.(png|webp|jpe?g)$/i.test(name));
    if (!captured && !waivedWaves.includes(entry.wave)) {
      problems.push({ wave: entry.wave, problem: 'marked done without a committed capture (evidenceDir with an image and metadata.json)' });
    }
    if (captured && waivedWaves.includes(entry.wave)) {
      problems.push({ wave: entry.wave, problem: 'waiver is stale: the capture exists, remove the waiver' });
    }
  }
  return problems;
};

const registryStatus = Object.fromEntries(
  registry.integratorWaveOwnership.assignments.map((assignment) => [assignment.wave, assignment.status])
);
const fileExists = (path: string): boolean => existsSync(resolve(root, path));
const listDir = (path: string): string[] => (existsSync(resolve(root, path)) ? readdirSync(resolve(root, path)) : []);

describe('UI rework wave proof surfaces (MAZER-UI-028)', () => {
  test('every wave in the integrator ownership table has a manifest row', () => {
    const manifestWaves = new Set(manifest.waves.map((entry) => entry.wave));
    const missing = Object.keys(registryStatus).filter((wave) => !manifestWaves.has(wave));
    expect(missing, 'add these waves to docs/contracts/mazer-ui-rework-wave-proof-surfaces.v1.json').toEqual([]);
    expect(manifestWaves.size).toBe(manifest.waves.length);
  });

  test('every wave lists at least one surface', () => {
    for (const entry of manifest.waves) {
      expect(entry.surfaces.length, `${entry.wave} lists no surface`).toBeGreaterThan(0);
    }
  });

  test('no wave is done without its capture, apart from the shrinking waiver list', () => {
    const problems = collectWaveProofProblems(manifest.waves, registryStatus, manifest.waivers.map((w) => w.wave), fileExists, listDir);
    expect(problems).toEqual([]);
  });

  test('waivers only shrink and each carries a reason', () => {
    for (const waiver of manifest.waivers) {
      expect(MAX_WAIVED_WAVES, `${waiver.wave} is a new waiver`).toContain(waiver.wave);
      expect(waiver.reason.length).toBeGreaterThan(20);
    }
  });

  test('registry-completed waves are in the manifest as done', () => {
    for (const [wave, status] of Object.entries(registryStatus)) {
      if (status === 'completed') {
        expect(manifest.waves.find((entry) => entry.wave === wave)?.proof.done, `${wave} is completed in the registry`).toBe(true);
      }
    }
  });

  describe('validator', () => {
    const wave = (proof: Proof, surfaces: Surface[] = [{ id: 's', description: 'd', captureScript: 'x.mjs' }]): Wave => ({ wave: 'T', title: 't', surfaces, proof });
    const exists = (path: string): boolean => path !== 'missing.mjs' && path !== 'ev/metadata.json';

    test('rejects a done wave with no capture', () => {
      const result = collectWaveProofProblems([wave({ status: 'not-captured', done: true, evidenceDir: null })], {}, [], () => true, () => []);
      expect(result.map((p) => p.problem).join()).toContain('without a committed capture');
    });

    test('rejects a registry-completed wave even when the manifest says not done', () => {
      const result = collectWaveProofProblems([wave({ status: 'not-captured', done: false, evidenceDir: null })], { T: 'completed' }, [], () => true, () => []);
      expect(result).toHaveLength(1);
    });

    test('rejects captured status when metadata.json or an image is missing', () => {
      const noMeta = collectWaveProofProblems([wave({ status: 'captured', done: true, evidenceDir: 'ev' })], {}, [], exists, () => ['a.png']);
      expect(noMeta).toHaveLength(1);
      const noImage = collectWaveProofProblems([wave({ status: 'captured', done: true, evidenceDir: 'ev' })], {}, [], () => true, () => ['metadata.json']);
      expect(noImage).toHaveLength(1);
    });

    test('accepts a done wave with image and metadata, and flags a stale waiver', () => {
      const ok = wave({ status: 'captured', done: true, evidenceDir: 'ev' });
      expect(collectWaveProofProblems([ok], {}, [], () => true, () => ['a.png', 'metadata.json'])).toEqual([]);
      expect(collectWaveProofProblems([ok], {}, ['T'], () => true, () => ['a.png', 'metadata.json'])[0]?.problem).toContain('stale');
    });

    test('rejects a missing capture script and a done wave with no surfaces', () => {
      const missing = collectWaveProofProblems([wave({ status: 'not-captured', done: false, evidenceDir: null }, [{ id: 's', description: 'd', captureScript: 'missing.mjs' }])], {}, [], exists, () => []);
      expect(missing[0]?.problem).toContain('capture script missing');
      const none = collectWaveProofProblems([wave({ status: 'not-captured', done: true, evidenceDir: null }, [])], {}, ['T'], () => true, () => []);
      expect(none.map((p) => p.problem)).toContain('done wave lists no surfaces');
    });
  });
});
