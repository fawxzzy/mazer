import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOLDER_RUNS, RUNNER_FILES, runnerExtraFiles } from './required-tests-lib.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(SCRIPT_PATH, '..', '..', '..');
const CWD_MUTATING_FIXTURE = 'tests/reset/legacy-unreal-source-fixture.test.ts';

// The same set CI runs: whole folders (FOLDER_RUNS in required-tests-lib.mjs, checked against .github/workflows/verify.yml by
// scripts/verify/check-test-coverage.mjs), minus the files in config/ci-test-exclusions.json. No file is named one by one.
const EXCLUDED_FILES = Object.keys(
  JSON.parse(readFileSync(resolve(REPO_ROOT, 'config', 'ci-test-exclusions.json'), 'utf8')).files
);

const runVitest = (args) => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', ['npx', 'vitest', 'run', ...args].join(' ')], {
      cwd: REPO_ROOT,
      stdio: 'inherit'
    });
    return;
  }

  execFileSync('npx', ['vitest', 'run', ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  });
};

// Required-coverage lists (navigation-core, teleport, ...): every listed file must exist and be inside a whole-folder run.
// Any listed file outside FOLDER_RUNS is added here, so it is never silently dropped.
const REQUIRED_EXTRAS = Object.keys(RUNNER_FILES).flatMap((runner) => runnerExtraFiles(runner));

// The deterministic room-corpus cases intentionally run longer than Vitest's
// fork-worker RPC heartbeat. They are pure and safe in one worker thread. The
// one fixture that deliberately calls process.chdir must stay in a fork.
runVitest([
  ...FOLDER_RUNS,
  ...REQUIRED_EXTRAS,
  '--exclude', CWD_MUTATING_FIXTURE,
  ...EXCLUDED_FILES.flatMap((file) => ['--exclude', file]),
  '--maxWorkers', '1',
  '--pool=threads',
  '--poolOptions.threads.singleThread'
]);
runVitest([CWD_MUTATING_FIXTURE, '--maxWorkers', '1']);
