// Registered through `setupFiles` in vitest.config.ts (MAZER-GOV-009).
//
// Why: a vitest worker reports task updates to the runner over RPC with a fixed 60 s timeout (birpc default, not
// configurable). Several suites run synchronous CPU-heavy tests back to back (the progression ladder alone is
// 36 s + 26 s + 16 s of pure sync work). While one is running the worker's event loop cannot process the runner's
// reply to an update it already sent, so two or three consecutive long tests add up past 60 s and the run ends
// with `Timeout calling "onTaskUpdate"` as an unhandled error, exit code 1, with every test passing.
//
// What: after any test that ran longer than a second, give the event loop one turn so pending runner replies are
// processed before the next test starts. The longest stretch without a turn becomes one test instead of a chain.
// Nothing about what a test asserts changes.
import { afterEach, beforeEach } from 'vitest';

const LONG_TEST_MS = 1000;
const YIELD_MS = 20;
let startedAt = 0;

beforeEach(() => {
  startedAt = performance.now();
});

afterEach(async () => {
  if (performance.now() - startedAt >= LONG_TEST_MS) {
    await new Promise<void>((resolve) => { setTimeout(resolve, YIELD_MS); });
  }
});
