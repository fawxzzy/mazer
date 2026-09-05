/**
 * Wave 4D-A's Navigation Core v1 required regression coverage -- the
 * continuous trail's pure geometry/shine-state logic, its canvas
 * compositor, BootScene's floor-texture failure-safe fallback, the
 * Trail-Fade path-origin connectivity fix, and the decision-registry/
 * UI-state-model ownership contracts this work touches.
 *
 * A real gap this list exists to close: neither `npm run verify`'s own
 * curated TEST_SPINE (scripts/verify/run-test-verify.mjs) NOR
 * .github/workflows/verify.yml's explicit vitest invocation ever actually
 * ran these files -- confirmed by adding tests to tests/render/ repeatedly
 * across a long session and observing neither pipeline's own reported test
 * count ever change. This module is the single canonical list both the
 * local runner and CI import from, so they can't drift apart again.
 */

/** The full required set -- what CI (whose own explicit test list has no directory globbing) needs to run in its entirety. */
export const NAVIGATION_CORE_REQUIRED_TESTS = [
  'tests/render/navigationCoreTrail.test.ts',
  'tests/render/navigationCoreTrailCanvas.test.ts',
  'tests/reset/boot-floor-texture.test.ts',
  'tests/reset/legacy-playable-graph.test.ts',
  'tests/architecture/decision-registry-contract.test.ts',
  'tests/architecture/ui-state-model-contract.test.ts'
  // tests/scenes/menu-render-frame.test.ts is already required elsewhere
  // (both npm run verify's own TEST_SPINE and CI's "Verify progression,
  // RPC, leaderboard, and UI boundaries" step) -- deliberately not
  // duplicated here.
];

/**
 * The subset npm run verify's local runner still needs to add on top of
 * its own existing TEST_SPINE -- that spine already globs the whole
 * `tests/reset` directory, so re-listing the two tests/reset/* entries
 * above would just run them twice in the same local invocation. CI has no
 * such glob, so it uses the full list unfiltered.
 */
export const NAVIGATION_CORE_REQUIRED_TESTS_NOT_COVERED_BY_LOCAL_SPINE = NAVIGATION_CORE_REQUIRED_TESTS.filter(
  (relativePath) => !relativePath.startsWith('tests/reset/')
);
