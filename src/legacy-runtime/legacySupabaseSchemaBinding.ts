// Mazer's only admitted Supabase project is the shared master. Its tables
// live in `mazer`, isolated from the other apps sharing that project.
// The legacy project was deleted on 2026-10-10; retained recovery archives
// are not live client targets (see docs/MAZER_SUPABASE_STORAGE.md).
// Keep schema selection strictly allowlisted: stale legacy configuration
// and unknown projects must fail closed before client construction.

/**
 * Every Supabase project Mazer is allowed to talk to, and the single Postgres
 * schema its tables live in on that project. Deliberately exhaustive and
 * flat (no wildcard/default entry) -- adding a new project means adding a
 * new line here, not falling through to a guess.
 */
export const LEGACY_SUPABASE_SCHEMA_BY_PROJECT_REF: Readonly<Record<string, string>> = Object.freeze({
  // Shared consolidation target. Mazer's tables live in their own `mazer`
  // schema on this project, isolated from other apps sharing it.
  bxtcuhkotumitoqtrcej: 'mazer'
});

// Matches exactly `https://<project-ref>.supabase.co` (optionally with a
// single trailing slash) -- nothing else. A project ref is a lowercase
// alphanumeric Supabase-assigned identifier; requiring the full expected
// host shape (rather than e.g. just splitting on '.') means a URL that
// merely *contains* something ref-shaped, has an unexpected extra path
// segment, uses http instead of https, or points at a different host
// entirely is rejected as unparsable rather than silently misread.
const LEGACY_SUPABASE_URL_PATTERN = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/;

/**
 * Extracts the project ref from a Supabase project URL, or null if the URL
 * doesn't match the exact expected shape. Case-insensitive on the ref itself
 * (Supabase refs are lowercase in practice, but this normalizes rather than
 * rejecting on case) -- everything else about the shape is strict.
 */
export const resolveLegacySupabaseProjectRef = (url: string): string | null => {
  const match = LEGACY_SUPABASE_URL_PATTERN.exec(url.trim().toLowerCase());
  return match ? match[1]! : null;
};

/**
 * The one function every call site should use to decide which schema to
 * bind a Supabase client to. Returns null -- fail closed -- when the URL
 * doesn't parse as a Supabase project URL at all, or when it parses to a
 * project ref that isn't in the explicit allowlist above. Never falls back
 * to `public` or `mazer` as a default; an unrecognized project must be
 * treated as unusable, not guessed at.
 */
export const resolveLegacySupabaseSchemaForUrl = (url: string): string | null => {
  const projectRef = resolveLegacySupabaseProjectRef(url);
  if (projectRef === null) {
    return null;
  }

  // A plain object's inherited keys (for example `constructor`) are not
  // admitted project refs, even though they satisfy the URL's syntax.
  return Object.prototype.hasOwnProperty.call(LEGACY_SUPABASE_SCHEMA_BY_PROJECT_REF, projectRef)
    ? LEGACY_SUPABASE_SCHEMA_BY_PROJECT_REF[projectRef]!
    : null;
};
