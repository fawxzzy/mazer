import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export const LEGACY_UNREAL_FIXTURE_DIR_NAME = 'mazer-legacy-unreal-restore';
export const LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR = 'MAZER_LEGACY_UNREAL_RESTORE_ROOT';

const PARENT_WALK_DEPTHS = [1, 2, 3];

export function buildLegacyUnrealParentWalkCandidates(cwd: string): string[] {
  return PARENT_WALK_DEPTHS.map((depth) => resolve(cwd, ...Array(depth).fill('..'), 'tmp', LEGACY_UNREAL_FIXTURE_DIR_NAME));
}

function resolveLegacyUnrealRoot(): string {
  const explicitRoot = process.env[LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR]?.trim();

  if (explicitRoot) {
    const candidate = isAbsolute(explicitRoot) ? explicitRoot : resolve(process.cwd(), explicitRoot);
    if (!existsSync(candidate)) {
      throw new Error(
        `${LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR} is set to "${explicitRoot}" but no directory exists at ` +
          `"${candidate}". Point it at a local checkout of the ${LEGACY_UNREAL_FIXTURE_DIR_NAME} fixture.`
      );
    }
    return candidate;
  }

  const parentCandidates = buildLegacyUnrealParentWalkCandidates(process.cwd());
  const found = parentCandidates.find((candidate) => existsSync(candidate));
  if (found) {
    return found;
  }

  throw new Error(
    `Missing local ${LEGACY_UNREAL_FIXTURE_DIR_NAME} fixture. Searched ${parentCandidates.length} ` +
      `parent-relative location(s) above "${process.cwd()}" and found none. This is expected when the ` +
      `current checkout is isolated from the fixture's usual location (for example, a worktree on a ` +
      `different drive). Set ${LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR} to an absolute path to the fixture ` +
      `directory to run this test from an isolated checkout.`
  );
}

export function resolveLegacyUnrealSource(...segments: string[]): string {
  return resolve(resolveLegacyUnrealRoot(), ...segments);
}
