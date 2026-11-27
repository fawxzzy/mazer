/**
 * Shared by the five `run-*-required-tests.mjs` runners and `check-test-coverage.mjs`.
 *
 * The required-coverage lists (`*-required-tests.mjs`) name files that must never silently drop out of verification.
 * CI and `npm test` now run whole folders (FOLDER_RUNS), so a listed file inside one of those folders already runs there;
 * running it again in the runner only doubled the time. The runner now (1) fails if a listed file is missing, (2) fails if a
 * listed file is neither inside a whole-folder run nor run by the runner itself, and (3) runs only the files no folder reaches.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAVIGATION_CORE_REQUIRED_TESTS } from './navigation-core-required-tests.mjs';
import { TELEPORT_REQUIRED_TESTS } from './teleport-required-tests.mjs';
import { WORLD_IDENTITY_REQUIRED_TESTS } from './world-identity-required-tests.mjs';
import { SHARED_ACCOUNT_OAUTH_REQUIRED_TESTS } from './shared-account-oauth-required-tests.mjs';
import { MEASURED_BASELINE_REQUIRED_TESTS } from './measured-baseline-required-tests.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

/**
 * Folders run whole, exactly once, by CI (.github/workflows/verify.yml) and by `npm test` / scripts/verify/run-test-verify.mjs.
 * check-test-coverage.mjs fails when the workflow and this list disagree about which files run.
 */
export const LEFTOVER_FOLDERS = [
  'tests/ai',
  'tests/analysis',
  'tests/config',
  'tests/future-runtime',
  'tests/maze',
  'tests/mazeV2',
  'tests/projections',
  'tests/proof-surfaces',
  'tests/scenes',
  'tests/settings',
  'tests/telemetry',
  'tests/theme',
  'tests/topology-proof',
  'tests/ui',
  'tests/visual'
];

export const FOLDER_RUNS = [
  'tests/core',
  'tests/cosmetics',
  'tests/tutorial',
  'tests/architecture',
  'tests/brand',
  'tests/legacy-runtime',
  'tests/reset',
  'tests/render',
  // The leftover folders (the "remaining test folders" CI job): the same whole-folder rule.
  ...LEFTOVER_FOLDERS
];

export const RUNNER_FILES = {
  'run-navigation-core-required-tests.mjs': ['Navigation Core', NAVIGATION_CORE_REQUIRED_TESTS],
  'run-teleport-required-tests.mjs': ['Teleport', TELEPORT_REQUIRED_TESTS],
  'run-world-identity-required-tests.mjs': ['World Identity', WORLD_IDENTITY_REQUIRED_TESTS],
  'run-shared-account-oauth-required-tests.mjs': ['shared-account OAuth', SHARED_ACCOUNT_OAUTH_REQUIRED_TESTS],
  'run-measured-baseline-required-tests.mjs': ['measured-baseline', MEASURED_BASELINE_REQUIRED_TESTS]
};

export const insideFolderRun = (file, folderRuns = FOLDER_RUNS) => folderRuns.some((folder) => file.startsWith(`${folder}/`));

/** The listed files that no whole-folder run reaches: the only ones the runner still has to run itself. */
export const runnerExtraFiles = (runnerName) => {
  const entry = RUNNER_FILES[runnerName];
  return entry ? entry[1].filter((file) => !insideFolderRun(file)) : [];
};

/** Body of a run-*-required-tests.mjs runner. Returns the vitest args to run, or null when nothing is left to run. */
export const planRequiredRun = (runnerName) => {
  const [label, listed] = RUNNER_FILES[runnerName];
  const missing = listed.filter((file) => !existsSync(resolve(ROOT, file)));
  if (missing.length > 0) {
    console.error(`FATAL: ${label} required test file(s) missing -- cannot verify coverage: ${missing.join(', ')}`);
    process.exitCode = 1;
    return null;
  }
  const extra = runnerExtraFiles(runnerName);
  console.log(`[required-tests] ${label}: ${listed.length} required file(s); ${listed.length - extra.length} run in the whole-folder steps (not run again here), ${extra.length} run here.`);
  return extra.length > 0 ? [...extra, '--maxWorkers=1'] : null;
};
