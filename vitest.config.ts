import { availableParallelism } from 'node:os';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Load sensitivity (MAZER-GOV-009). Several suites are CPU heavy (generation ladders, pixel
// renders) or spawn child processes / git fixtures. On a busy machine (a second dev server,
// two test runs at once, a worktree install) the same test takes several times longer, so the
// 5 s vitest default fired on tests that pass alone every time, and a worker starved of CPU
// stopped answering the runner ("Timeout calling onTaskUpdate").
//
// This config changes only how long a test may take and how many files run at once; it does
// not change what any test asserts. CI passes `--maxWorkers=1` on the command line, which
// overrides maxWorkers here.
const cpuCount = availableParallelism();

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // A hung test still fails, just not at 5 s. Heavy named tests carry their own larger timeout.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    teardownTimeout: 30_000,
    // Lets the runner answer a worker between long synchronous tests (see the file for the failure it prevents).
    setupFiles: ['./tests/fixtures/vitest-runner-yield.ts'],
    // Leave CPU for the runner process (it answers every worker's task updates) and for other
    // work on the machine: half the logical CPUs, never fewer than 2.
    maxWorkers: Math.max(2, Math.floor(cpuCount / 2))
  }
}));
