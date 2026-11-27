/**
 * Wave 5C's shared-account OAuth consumer required regression coverage --
 * currently the forced-auth-gate boot-regression contract this wave's own
 * `src/scenes/MenuScene.ts` changes touch.
 *
 * The same silent gap `navigation-core-required-tests.mjs`/
 * `teleport-required-tests.mjs`/`world-identity-required-tests.mjs` each
 * exist to close: `tests/reset/legacy-auth-gate.test.ts` is picked up by
 * `npm run verify`'s own curated TEST_SPINE (its `tests/reset` directory
 * glob), but before PR #727 `.github/workflows/verify.yml`'s explicit vitest
 * invocation had no `tests/reset` directory glob and never named this file,
 * so CI never actually ran it despite a fully green run. Since #727 the
 * "whole tests/reset folder" step globs the directory, so CI now also
 * reaches this file there; this list stays as the explicit
 * run-shared-account-oauth-required-tests.mjs step, which fails loudly if a
 * listed file goes missing. This module is the canonical list both the
 * local runner and CI import from, so they can't drift apart again.
 *
 * Every new Wave 5C test suite must be added here in the same change that
 * adds it -- not assumed to be picked up automatically.
 */

/** The full required set -- what CI's dedicated required-coverage step runs in its entirety (every entry is also reached by CI's tests/reset folder glob since #727). */
export const SHARED_ACCOUNT_OAUTH_REQUIRED_TESTS = [
  'tests/reset/legacy-auth-gate.test.ts',
  // Menu a11y / 320px clipping / hit-target / post-rebuild tap recovery (MenuScene.ts changes).
  'tests/reset/legacy-header-edge-padding.test.ts',
  'tests/reset/legacy-hit-targets.test.ts',
  'tests/reset/legacy-ui-standards.test.ts',
  'tests/reset/legacy-ui-tap-recovery.test.ts'
];

/**
 * The subset npm run verify's local runner still needs to add on top of its
 * own existing TEST_SPINE -- that spine already globs the whole
 * `tests/reset` directory, so re-listing the entry above would just run it
 * twice in the same local invocation. CI's required-coverage step does not
 * filter: it runs the full list unfiltered (so these entries run there and
 * again in CI's tests/reset folder step).
 */
export const SHARED_ACCOUNT_OAUTH_REQUIRED_TESTS_NOT_COVERED_BY_LOCAL_SPINE = SHARED_ACCOUNT_OAUTH_REQUIRED_TESTS.filter(
  (relativePath) => !relativePath.startsWith('tests/reset/')
);
