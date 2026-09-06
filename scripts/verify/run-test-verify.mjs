import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAVIGATION_CORE_REQUIRED_TESTS_NOT_COVERED_BY_LOCAL_SPINE } from './navigation-core-required-tests.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(SCRIPT_PATH, '..', '..', '..');
const CWD_MUTATING_FIXTURE = 'tests/reset/legacy-unreal-source-fixture.test.ts';
const TEST_SPINE = [
  'tests/reset',
  'tests/ai/demo-walker.test.ts',
  'tests/ai/demo-walker-known-frontier.test.ts',
  'tests/ai/demo-walker-rank-ladder.test.ts',
  'tests/ai/demo-walker-recovery-diagnostics.test.ts',
  'tests/analysis/ai-navigation-acceptance.test.ts',
  'tests/scenes/menu-render-frame.test.ts',
  'tests/analysis/maze-cycle-telemetry-report.test.mjs',
  'tests/analysis/ai-run-corpus-audit.test.mjs'
];

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

// The deterministic room-corpus cases intentionally run longer than Vitest's
// fork-worker RPC heartbeat. They are pure and safe in one worker thread. The
// one fixture that deliberately calls process.chdir must stay in a fork.
runVitest([
  ...TEST_SPINE,
  // Wave 4D-A's Navigation Core v1 required coverage (tests/render,
  // tests/architecture) that TEST_SPINE above never actually included --
  // see navigation-core-required-tests.mjs's own header for why this list
  // exists and is shared with CI. Filtered to skip tests/reset/* entries,
  // which TEST_SPINE's own 'tests/reset' glob above already runs.
  ...NAVIGATION_CORE_REQUIRED_TESTS_NOT_COVERED_BY_LOCAL_SPINE,
  '--exclude', CWD_MUTATING_FIXTURE,
  '--maxWorkers', '1',
  '--pool=threads',
  '--poolOptions.threads.singleThread'
]);
runVitest([CWD_MUTATING_FIXTURE, '--maxWorkers', '1']);
