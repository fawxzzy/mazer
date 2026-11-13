// The public-text screens for card text that the owner board publishes (title, description, criteria, blocker and
// verify wording). ONE definition: tests/project-board-owner-export.test.mjs and the board-sync scripts both import
// it, so the test that guards the exported board and the tool that writes it cannot drift apart.
// They mirror the screens FawxzzyWeb applies before it publishes a card title or summary.
export const PUBLIC_TEXT_SCREENS = Object.freeze([
  ["url", /\bhttps?:\/\//i],
  ["drive or backslash path", /(?:\b[A-Za-z]:[\\/]|\\)/],
  ["relative or home path", /(?:\b(?:repos|runtime|docs|handoff|secrets|packages|scripts|config|exports|planning|tmp|src|api|supabase)\/[\w.-]+|~\/|\/(?:Users|home|etc|var)\/)/i],
  ["file name", /\b[\w-]+\.(?:env|dpapi|json|mjs|cjs|js|ts|tsx|md|zip|docx?|xlsx?|pem|key|log|sql|ps1|sh|ya?ml|toml|exe)\b/i],
  ["long token-like run", /(?:[A-Za-z0-9+/]{32,}={0,2}|\b[a-f0-9]{32,}\b)/],
  ["secret or credential word", /\b(?:passwords?|passwd|secrets?|credentials?|api[ -]?keys?|private[ -]keys?|access[ -]keys?|tokens?|cookies?|jwt|session id)\b/i],
  ["security finding word", /\b(?:security|vulnerabilit\w*|advisor|dependabot|leak(?:ed|s)?|incident|exploit\w*|cve-\d+)\b/i],
  ["money word", /\b(?:monetiz\w*|premium|paid|payments?|billing|invoices?|stripe|subscriptions?|pricing|revenue|paywall)\b/i],
  ["personal data word", /\b(?:personal data|e-?mail|ssn|phone number|home address|career)\b/i],
].map((screen) => Object.freeze(screen)));

const SHOWN = 48;
const shown = (value) => (value.length > SHOWN ? `${value.slice(0, SHOWN)}...` : value);

/** Every screen that matches: [{ screen, match }]. Non-strings match nothing (shape rules report those). */
export function screenMatches(text) {
  if (typeof text !== "string") return [];
  const out = [];
  for (const [screen, pattern] of PUBLIC_TEXT_SCREENS) {
    const found = text.match(pattern);
    if (found) out.push({ screen, match: found[0] });
  }
  return out;
}

/** Problem lines naming the field, the exact screen and the offending substring (cut at 48 chars). */
export function screenProblems(label, text) {
  return screenMatches(text).map(({ screen, match }) => `${label} fails the public-text "${screen}" screen: "${shown(match)}"`);
}
