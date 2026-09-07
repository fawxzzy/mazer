/**
 * Wave 4D-B's Teleport System v1 required regression coverage.
 *
 * Mirrors navigation-core-required-tests.mjs's own reasoning exactly (see
 * that module's header): neither `npm run verify`'s curated TEST_SPINE
 * (scripts/verify/run-test-verify.mjs) nor .github/workflows/verify.yml's
 * explicit vitest invocations glob tests/render/ automatically -- a new
 * file there is silently never run unless it's listed in one of these
 * shared canonical lists. Kept as its own Teleport-scoped module (not
 * folded into NAVIGATION_CORE_REQUIRED_TESTS) so Teleport coverage is never
 * mislabeled as Navigation-Core-only coverage.
 *
 * Every new tests/render/*.test.ts suite this wave adds must be added here
 * too, in the same change that adds the suite.
 */

/** The full required set -- what CI needs to run in its entirety. */
export const TELEPORT_REQUIRED_TESTS = [
  'tests/render/teleportPrimaryAnchor.test.ts',
  'tests/render/teleportAnchorPose.test.ts',
  'tests/render/teleportTransferPresentation.test.ts',
  'tests/render/teleportTransferConduitCanvas.test.ts'
];

/**
 * The subset npm run verify's local runner still needs to add on top of its
 * own existing TEST_SPINE. None of this wave's required tests currently
 * live under tests/reset/ (which TEST_SPINE already globs), so this is
 * presently identical to the full list above -- kept as its own export,
 * matching navigation-core-required-tests.mjs's convention, so a future
 * tests/reset/* addition here would be filtered out the same way without
 * anyone needing to remember to add the filter later.
 */
export const TELEPORT_REQUIRED_TESTS_NOT_COVERED_BY_LOCAL_SPINE = TELEPORT_REQUIRED_TESTS.filter(
  (relativePath) => !relativePath.startsWith('tests/reset/')
);
