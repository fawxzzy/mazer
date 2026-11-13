// Offline mirror of the keyword screen in the read-only Supabase wrapper
// (~/.claude/skills/atlas-supabase/sb-query.ps1). That wrapper strips block and line
// comments, lower-cases the file, and refuses it in read-only mode if ANY of these words
// appears as a whole word ANYWHERE, string literals included. Keeping a mirror here lets a
// query file be checked in CI and before any network call.
export const DANGER_WORDS = [
  'insert', 'update', 'delete', 'drop', 'alter', 'create', 'grant', 'revoke', 'truncate',
  'vacuum', 'reindex', 'cluster', 'call', 'do', 'copy', 'lock', 'notify', 'listen', 'refresh',
  'merge', 'comment', 'security', 'reset', 'set', 'begin', 'commit', 'rollback'
];

const DANGER_RE = new RegExp(String.raw`\b(${DANGER_WORDS.join('|')})\b`, 'g');

export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
}

/** Returns the sorted unique danger words the wrapper would trip on (empty array = accepted). */
export function screenReadOnly(sql) {
  const clean = stripSqlComments(sql).toLowerCase();
  return [...new Set(clean.match(DANGER_RE) ?? [])].sort();
}

/**
 * The wrapper returns only the LAST statement's rows, so a pack file must hold exactly one
 * statement. Counts semicolons outside single-quoted strings after comments are stripped.
 */
export function countStatements(sql) {
  const clean = stripSqlComments(sql);
  let inString = false;
  let count = 0;
  let pending = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (inString) {
      if (ch === "'" && clean[i + 1] === "'") { i += 1; } else if (ch === "'") { inString = false; }
      continue;
    }
    if (ch === "'") { inString = true; pending = true; continue; }
    if (ch === ';') { if (pending) count += 1; pending = false; continue; }
    if (!/\s/.test(ch)) pending = true;
  }
  return count + (pending ? 1 : 0);
}
