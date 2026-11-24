/**
 * MAZER-FB-001: the build id the in-game feedback popup sends (mazer.mazer_feedback.build_id). It is the short commit
 * sha injected by vite.config.ts (`define`), validated here against the same pattern the database enforces
 * (^[A-Za-z0-9._+-]{1,64}$). With no sha at build time it is null and the popup sends no build id: the rating is never
 * lost over a missing context field.
 */
export const LEGACY_BUILD_ID_PATTERN = /^[A-Za-z0-9._+-]{1,64}$/;

export const sanitizeLegacyBuildId = (value: unknown): string | null => (
  typeof value === 'string' && LEGACY_BUILD_ID_PATTERN.test(value) ? value : null
);

export const resolveLegacyBuildId = (): string | null => (
  typeof __MAZER_BUILD_ID__ === 'undefined' ? null : sanitizeLegacyBuildId(__MAZER_BUILD_ID__)
);
