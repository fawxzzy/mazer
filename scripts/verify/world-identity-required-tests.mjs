/**
 * Wave 4E's ("World Identity") required regression coverage.
 *
 * Mirrors navigation-core-required-tests.mjs's own reasoning exactly (see
 * that module's header): neither `npm run verify`'s curated TEST_SPINE
 * (scripts/verify/run-test-verify.mjs) nor .github/workflows/verify.yml's
 * explicit vitest invocations glob every relevant directory automatically.
 * tests/reset/legacy-menu-backdrop.test.ts happens to sit under a directory
 * TEST_SPINE globs, so it silently runs locally -- but CI's own explicit
 * list never named it, so a green CI run was never actually proof this
 * suite passed. Kept as its own World-Identity-scoped module (not folded
 * into NAVIGATION_CORE_REQUIRED_TESTS or TELEPORT_REQUIRED_TESTS) so this
 * coverage is never mislabeled as Navigation-Core- or Teleport-only work.
 *
 * Every new test this wave adds for the backdrop/starfield or other World
 * Identity surfaces must be added here too, in the same change that adds
 * the suite.
 */

/** The full required set -- what CI needs to run in its entirety. */
export const WORLD_IDENTITY_REQUIRED_TESTS = [
  'tests/reset/legacy-menu-backdrop.test.ts',
  'tests/architecture/world-identity-star-render-contract.test.ts'
];

/**
 * The subset npm run verify's local runner still needs to add on top of its
 * own existing TEST_SPINE, which already globs tests/reset -- so that entry
 * would otherwise run twice in the same local invocation. CI has no such
 * glob, so it uses the full list unfiltered.
 */
export const WORLD_IDENTITY_REQUIRED_TESTS_NOT_COVERED_BY_LOCAL_SPINE = WORLD_IDENTITY_REQUIRED_TESTS.filter(
  (relativePath) => !relativePath.startsWith('tests/reset/')
);
