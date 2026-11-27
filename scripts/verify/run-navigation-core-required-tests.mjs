import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRequiredRun } from './required-tests-lib.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(SCRIPT_PATH, '..', '..', '..');

// Required-coverage guarantee, without running a file twice: the list in ./navigation-core-required-tests.mjs
// must exist (fails loudly otherwise), and every listed file must be inside a whole-folder run (CI's folder steps and
// `npm test`) or be run here. See required-tests-lib.mjs.
const vitestArgs = planRequiredRun(basename(SCRIPT_PATH));
if (vitestArgs) {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', ['npx', 'vitest', 'run', ...vitestArgs].join(' ')], { cwd: REPO_ROOT, stdio: 'inherit' });
  } else {
    execFileSync('npx', ['vitest', 'run', ...vitestArgs], { cwd: REPO_ROOT, stdio: 'inherit' });
  }
}
