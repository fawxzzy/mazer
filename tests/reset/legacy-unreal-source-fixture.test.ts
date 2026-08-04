import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  buildLegacyUnrealParentWalkCandidates,
  LEGACY_UNREAL_FIXTURE_DIR_NAME,
  LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR,
  resolveLegacyUnrealSource
} from './legacyUnrealSourceFixture';

const ENV_VAR = LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR;
const originalEnvValue = process.env[ENV_VAR];
const originalCwd = process.cwd();
let scratchRoot: string;

function restoreEnv(): void {
  if (originalEnvValue === undefined) {
    delete process.env[ENV_VAR];
  } else {
    process.env[ENV_VAR] = originalEnvValue;
  }
}

beforeEach(() => {
  scratchRoot = mkdtempSync(join(tmpdir(), 'mazer-legacy-fixture-portability-'));
});

afterEach(() => {
  restoreEnv();
  process.chdir(originalCwd);
  rmSync(scratchRoot, { recursive: true, force: true });
});

describe('legacy unreal source fixture resolution', () => {
  test('resolves via the existing same-drive parent-walk when no env var is set and a candidate exists', () => {
    delete process.env[ENV_VAR];
    const fakeCwd = join(scratchRoot, 'checkout', 'nested');
    mkdirSync(fakeCwd, { recursive: true });
    const fixtureRoot = resolve(fakeCwd, '..', '..', 'tmp', LEGACY_UNREAL_FIXTURE_DIR_NAME);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(join(fixtureRoot, 'marker.txt'), 'ok');

    process.chdir(fakeCwd);
    expect(resolveLegacyUnrealSource('marker.txt')).toBe(resolve(fixtureRoot, 'marker.txt'));
  });

  test('simulated cross-drive worktree: parent-walk candidates never reach a fixture rooted elsewhere, and resolution fails without the env var', () => {
    delete process.env[ENV_VAR];
    const isolatedCwd = join(scratchRoot, 'isolated-worktree');
    mkdirSync(isolatedCwd, { recursive: true });

    // No fixture exists anywhere above isolatedCwd -- this is what a worktree on a
    // different drive than the fixture's usual location looks like.
    const candidates = buildLegacyUnrealParentWalkCandidates(isolatedCwd);
    expect(candidates.length).toBeGreaterThan(0);

    process.chdir(isolatedCwd);
    expect(() => resolveLegacyUnrealSource('Source/Mazer/MazerGameModeBase.cpp')).toThrow(
      /Missing local mazer-legacy-unreal-restore fixture/
    );
  });

  test('an explicit fixture-root env var resolves regardless of cwd, simulating a cross-drive worktree', () => {
    const fixtureRoot = join(scratchRoot, 'explicit-root', LEGACY_UNREAL_FIXTURE_DIR_NAME);
    mkdirSync(join(fixtureRoot, 'Source', 'Mazer'), { recursive: true });
    writeFileSync(join(fixtureRoot, 'Source', 'Mazer', 'MazerGameModeBase.cpp'), '// fixture stub');

    process.env[ENV_VAR] = fixtureRoot;
    process.chdir(join(scratchRoot)); // cwd has no relation whatsoever to fixtureRoot

    expect(resolveLegacyUnrealSource('Source', 'Mazer', 'MazerGameModeBase.cpp')).toBe(
      resolve(fixtureRoot, 'Source', 'Mazer', 'MazerGameModeBase.cpp')
    );
  });

  test('a relative env var value is resolved against cwd, not left as a dangling relative path', () => {
    const fixtureRoot = join(scratchRoot, 'relative-target', LEGACY_UNREAL_FIXTURE_DIR_NAME);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(join(fixtureRoot, 'marker.txt'), 'ok');

    process.chdir(join(scratchRoot, 'relative-target'));
    process.env[ENV_VAR] = LEGACY_UNREAL_FIXTURE_DIR_NAME;

    expect(resolveLegacyUnrealSource('marker.txt')).toBe(resolve(fixtureRoot, 'marker.txt'));
  });

  test('missing fixture produces an actionable, non-silent error naming the env var', () => {
    delete process.env[ENV_VAR];
    process.chdir(scratchRoot);
    expect(() => resolveLegacyUnrealSource('anything.txt')).toThrow(LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR);
  });

  test('an env var pointed at a nonexistent directory fails loudly instead of silently falling back', () => {
    const bogusPath = join(scratchRoot, 'does-not-exist', LEGACY_UNREAL_FIXTURE_DIR_NAME);
    process.env[ENV_VAR] = bogusPath;
    // Even if a real fixture happens to exist via parent-walk, the explicit env var takes priority.
    process.chdir(scratchRoot);

    expect(() => resolveLegacyUnrealSource('marker.txt')).toThrow(bogusPath);
  });

  test('an env var explicitly set to an empty string fails loudly instead of silently falling back to parent-walk', () => {
    // A real fixture exists via parent-walk here -- if the empty explicit
    // value were silently treated as "not set," this would incorrectly
    // succeed via the fallback instead of surfacing the misconfiguration.
    const fakeCwd = join(scratchRoot, 'checkout', 'nested');
    mkdirSync(fakeCwd, { recursive: true });
    const fixtureRoot = resolve(fakeCwd, '..', '..', 'tmp', LEGACY_UNREAL_FIXTURE_DIR_NAME);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(join(fixtureRoot, 'marker.txt'), 'ok');

    process.env[ENV_VAR] = '';
    process.chdir(fakeCwd);

    expect(() => resolveLegacyUnrealSource('marker.txt')).toThrow(
      new RegExp(`${ENV_VAR} is set but empty or whitespace-only`)
    );
  });

  test('an env var explicitly set to whitespace-only (spaces) fails loudly instead of silently falling back', () => {
    const fakeCwd = join(scratchRoot, 'checkout', 'nested');
    mkdirSync(fakeCwd, { recursive: true });
    const fixtureRoot = resolve(fakeCwd, '..', '..', 'tmp', LEGACY_UNREAL_FIXTURE_DIR_NAME);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(join(fixtureRoot, 'marker.txt'), 'ok');

    process.env[ENV_VAR] = '   ';
    process.chdir(fakeCwd);

    expect(() => resolveLegacyUnrealSource('marker.txt')).toThrow(
      new RegExp(`${ENV_VAR} is set but empty or whitespace-only`)
    );
  });

  test('an env var explicitly set to tabs/newlines only fails loudly instead of silently falling back', () => {
    const fakeCwd = join(scratchRoot, 'checkout', 'nested');
    mkdirSync(fakeCwd, { recursive: true });
    const fixtureRoot = resolve(fakeCwd, '..', '..', 'tmp', LEGACY_UNREAL_FIXTURE_DIR_NAME);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(join(fixtureRoot, 'marker.txt'), 'ok');

    process.env[ENV_VAR] = '\t\n  \n\t';
    process.chdir(fakeCwd);

    expect(() => resolveLegacyUnrealSource('marker.txt')).toThrow(
      new RegExp(`${ENV_VAR} is set but empty or whitespace-only`)
    );
  });

  test('leaves the fallback-eligible contract intact: truly unset still uses parent-walk, not the blank-value error', () => {
    const fakeCwd = join(scratchRoot, 'checkout', 'nested');
    mkdirSync(fakeCwd, { recursive: true });
    const fixtureRoot = resolve(fakeCwd, '..', '..', 'tmp', LEGACY_UNREAL_FIXTURE_DIR_NAME);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(join(fixtureRoot, 'marker.txt'), 'ok');

    delete process.env[ENV_VAR];
    process.chdir(fakeCwd);

    expect(resolveLegacyUnrealSource('marker.txt')).toBe(resolve(fixtureRoot, 'marker.txt'));
  });

  test('handles a fixture-root path containing spaces', () => {
    const fixtureRoot = join(scratchRoot, 'path with spaces', LEGACY_UNREAL_FIXTURE_DIR_NAME);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(join(fixtureRoot, 'marker.txt'), 'ok');

    process.env[ENV_VAR] = fixtureRoot;
    process.chdir(scratchRoot);

    expect(resolveLegacyUnrealSource('marker.txt')).toBe(resolve(fixtureRoot, 'marker.txt'));
  });

  test('parent-walk stays bounded to three ancestor levels (no unbounded upward traversal)', () => {
    const candidates = buildLegacyUnrealParentWalkCandidates(join(scratchRoot, 'a', 'b', 'c'));
    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(candidate.endsWith(join('tmp', LEGACY_UNREAL_FIXTURE_DIR_NAME))).toBe(true);
    }
  });
});
