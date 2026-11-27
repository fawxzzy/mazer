/**
 * Wave 4D-A's Navigation Core v1 required regression coverage -- the
 * continuous trail's pure geometry/shine-state logic, its canvas
 * compositor, the player-glow and goal-halo canvas compositors, BootScene's
 * floor-texture failure-safe fallback, the Trail-Fade path-origin
 * connectivity fix, and the decision-registry/UI-state-model ownership
 * contracts this work touches.
 *
 * A real gap this list exists to close: neither `npm run verify`'s own
 * curated TEST_SPINE (scripts/verify/run-test-verify.mjs) NOR
 * .github/workflows/verify.yml's explicit vitest invocation ever actually
 * ran these files -- confirmed by adding tests to tests/render/ repeatedly
 * across a long session and observing neither pipeline's own reported test
 * count ever change. (Since PR #727 CI globs the whole tests/reset folder and
 * tests/core, cosmetics, tutorial, architecture, brand and legacy-runtime, and
 * its "whole tests/render folder" step globs tests/render, so the tests/reset,
 * tests/architecture and tests/render entries below are now also reached
 * there; tests/analysis is still not globbed by CI.) This module is the single
 * canonical list both the local runner and CI import from, so they can't
 * drift apart again.
 *
 * Every new tests/render/*.ts suite added for this wave must be added here
 * too, in the same change that adds the suite -- a rendering module without
 * its test wired into required verification is exactly the gap this list
 * exists to close, not a one-time fix for the files it happened to name
 * first.
 */

/** The full required set -- what CI's dedicated required-coverage step runs in its entirety (the tests/reset and tests/architecture entries are also reached by CI's folder globs since #727). */
export const NAVIGATION_CORE_REQUIRED_TESTS = [
  'tests/render/navigationCoreTrail.test.ts',
  'tests/render/navigationCoreTrailCanvas.test.ts',
  'tests/render/navigationCorePlayerGlowCanvas.test.ts',
  'tests/render/navigationCoreGoalHaloCanvas.test.ts',
  // tests/analysis/ is a specific-file list in TEST_SPINE, not a glob (see
  // scripts/verify/run-test-verify.mjs) -- a new file there is exactly the
  // same silent-gap class this whole module exists to close, so it's
  // listed here rather than assumed to be picked up automatically.
  'tests/analysis/rasterCompare.test.ts',
  'tests/architecture/boot-payload-budget.test.ts',
  'tests/reset/legacy-playable-graph.test.ts',
  'tests/architecture/decision-registry-contract.test.ts',
  'tests/architecture/ui-state-model-contract.test.ts'
  // tests/scenes/menu-render-frame.test.ts is already required elsewhere
  // (both npm run verify's own TEST_SPINE and CI's "Verify menu scene and
  // legacy-runtime UI boundaries" step) -- deliberately not
  // duplicated here.
];

/**
 * The subset npm run verify's local runner still needs to add on top of
 * its own existing TEST_SPINE -- that spine already globs the whole
 * `tests/reset` directory, so re-listing the tests/reset/* entry
 * above would just run them twice in the same local invocation. CI's
 * required-coverage step does not filter: it runs the full list unfiltered.
 */
export const NAVIGATION_CORE_REQUIRED_TESTS_NOT_COVERED_BY_LOCAL_SPINE = NAVIGATION_CORE_REQUIRED_TESTS.filter(
  (relativePath) => !relativePath.startsWith('tests/reset/')
);
