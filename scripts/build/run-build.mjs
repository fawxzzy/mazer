import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(SCRIPT_PATH, '..', '..', '..');
const MAX_OLD_SPACE_MB = process.env.MAZER_BUILD_MAX_OLD_SPACE_MB ?? '4096';

const stripEnvQuotes = (value) => value.replace(/^['"]|['"]$/g, '');

const loadLocalViteEnv = () => {
  if (process.env.MAZER_PREFER_LOCAL_VITE_ENV === '0') {
    return;
  }

  const localEnvPath = resolve(REPO_ROOT, '.env.local');
  if (!existsSync(localEnvPath)) {
    return;
  }

  const localEnv = readFileSync(localEnvPath, 'utf8');
  for (const line of localEnv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (!key.startsWith('VITE_')) {
      continue;
    }

    process.env[key] = stripEnvQuotes(rawValue.trim());
  }
};

const runNodeScript = (scriptPath, args = []) => {
  execFileSync(process.execPath, [`--max-old-space-size=${MAX_OLD_SPACE_MB}`, scriptPath, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  });
};

loadLocalViteEnv();
runNodeScript(resolve(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), ['--noEmit']);
runNodeScript(resolve(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), ['build']);
