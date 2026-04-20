import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(SCRIPT_PATH, '..', '..', '..');
const MAX_OLD_SPACE_MB = process.env.MAZER_BUILD_MAX_OLD_SPACE_MB ?? '4096';

const runNodeScript = (scriptPath, args = []) => {
  execFileSync(process.execPath, [`--max-old-space-size=${MAX_OLD_SPACE_MB}`, scriptPath, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  });
};

runNodeScript(resolve(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), ['--noEmit']);
runNodeScript(resolve(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), ['build']);
