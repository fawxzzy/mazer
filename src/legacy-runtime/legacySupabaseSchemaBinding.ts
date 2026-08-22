// Which Postgres schema a Supabase client binds to (`db.schema` in
// createClient's options) is project-specific, not a constant -- Mazer has
// two known Supabase projects with two different answers:
//
//   - geknvnrmktchljnyddwp (legacy/rollback project): tables live in the
//     default `public` schema, as they always have.
//   - bxtcuhkotumitoqtrcej (shared consolidation target): Mazer's tables
//     were moved into their own `mazer` schema (see
//     docs/MAZER_SUPABASE_STORAGE.md), isolated from the Fitness app's
//     tables that also live in this project.
//
// Hardcoding `db.schema = 'mazer'` unconditionally (the previous behavior)
// is correct for the second project and silently wrong for the first --
// PostgREST rejects a schema it hasn't been configured to expose with a 406
// "Invalid schema" error, which is exactly what happened when production's
// VITE_SUPABASE_URL still pointed at the legacy project while the client
// asked for `mazer`. This module makes that binding an explicit, strictly
// allowlisted lookup instead of an assumption, and fails closed (no client
// construction) for any project this table doesn't recognize -- guessing a
// schema for an unrecognized project is exactly how a client ends up
// reading or writing the wrong project's data without anyone noticing.

/**
 * Every Supabase project Mazer is known to talk to, and the single Postgres
 * schema its tables live in on that project. Deliberately exhaustive and
 * flat (no wildcard/default entry) -- adding a new project means adding a
 * new line here, not falling through to a guess.
 */
export const LEGACY_SUPABASE_SCHEMA_BY_PROJECT_REF: Readonly<Record<string, string>> = Object.freeze({
  // Legacy/rollback Mazer project -- retained as a rollback source per
  // docs/MAZER_SUPABASE_STORAGE.md. Tables here still live in `public`.
  geknvnrmktchljnyddwp: 'public',
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

  return LEGACY_SUPABASE_SCHEMA_BY_PROJECT_REF[projectRef] ?? null;
};
