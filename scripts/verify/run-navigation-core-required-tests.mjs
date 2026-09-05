import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAVIGATION_CORE_REQUIRED_TESTS } from './navigation-core-required-tests.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(SCRIPT_PATH, '..', '..', '..');

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

// Fail loudly on a missing required test file (a rename/delete that would
// otherwise silently drop it from coverage) rather than letting vitest's
// own file-not-found behavior be the only signal.
const missing = NAVIGATION_CORE_REQUIRED_TESTS.filter(
  (relativePath) => !existsSync(resolve(REPO_ROOT, relativePath))
);
if (missing.length > 0) {
  console.error(`FATAL: Navigation Core required test file(s) missing -- cannot verify coverage: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  runVitest([...NAVIGATION_CORE_REQUIRED_TESTS, '--maxWorkers=1']);
}
