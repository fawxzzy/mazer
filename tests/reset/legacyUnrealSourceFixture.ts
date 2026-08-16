import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export const LEGACY_UNREAL_FIXTURE_DIR_NAME = 'mazer-legacy-unreal-restore';
export const LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR = 'MAZER_LEGACY_UNREAL_RESTORE_ROOT';

const PARENT_WALK_DEPTHS = [1, 2, 3];

export function buildLegacyUnrealParentWalkCandidates(cwd: string): string[] {
  return PARENT_WALK_DEPTHS.map((depth) => resolve(cwd, ...Array(depth).fill('..'), 'tmp', LEGACY_UNREAL_FIXTURE_DIR_NAME));
}

function resolveLegacyUnrealRoot(): string {
  const rawValue = process.env[LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR];

  // Distinguish "not set at all" (undefined -- parent-walk fallback is fine)
  // from "set, but blank after trimming" (a real misconfiguration -- e.g. a
  // CI/shell env template that substitutes an empty value). Trimming and
  // then checking truthiness alone conflates the two, since `''` and
  // `undefined` are both falsy: an explicitly-set-but-whitespace-only value
  // would silently and indistinguishably fall through to parent-walk
  // discovery instead of failing loudly on the misconfiguration.
  if (rawValue !== undefined) {
    const explicitRoot = rawValue.trim();
    if (!explicitRoot) {
      throw new Error(
        `${LEGACY_UNREAL_FIXTURE_ROOT_ENV_VAR} is set but empty or whitespace-only. Unset it entirely to use ` +
          `automatic parent-directory discovery, or set it to an absolute path to the ` +
          `${LEGACY_UNREAL_FIXTURE_DIR_NAME} fixture directory.`
      );
    }

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
