/**
 * Wave 5C's shared-account OAuth consumer required regression coverage --
 * currently the forced-auth-gate boot-regression contract this wave's own
 * `src/scenes/MenuScene.ts` changes touch.
 *
 * The same silent gap `navigation-core-required-tests.mjs`/
 * `teleport-required-tests.mjs`/`world-identity-required-tests.mjs` each
 * exist to close: `tests/reset/legacy-auth-gate.test.ts` is picked up by
 * `npm run verify`'s own curated TEST_SPINE (its `tests/reset` directory
 * glob), but `.github/workflows/verify.yml`'s explicit vitest invocation has
 * no directory globbing and never named this file, so CI never actually ran
 * it despite a fully green run. This module is the canonical list both the
 * local runner and CI import from, so they can't drift apart again.
 *
 * Every new Wave 5C test suite must be added here in the same change that
 * adds it -- not assumed to be picked up automatically.
 */

/** The full required set -- what CI (whose own explicit test list has no directory globbing) needs to run in its entirety. */
export const SHARED_ACCOUNT_OAUTH_REQUIRED_TESTS = [
  'tests/reset/legacy-auth-gate.test.ts'
];

/**
 * The subset npm run verify's local runner still needs to add on top of its
 * own existing TEST_SPINE -- that spine already globs the whole
 * `tests/reset` directory, so re-listing the entry above would just run it
 * twice in the same local invocation. CI has no such glob, so it uses the
 * full list unfiltered.
 */
export const SHARED_ACCOUNT_OAUTH_REQUIRED_TESTS_NOT_COVERED_BY_LOCAL_SPINE = SHARED_ACCOUNT_OAUTH_REQUIRED_TESTS.filter(
  (relativePath) => !relativePath.startsWith('tests/reset/')
);
