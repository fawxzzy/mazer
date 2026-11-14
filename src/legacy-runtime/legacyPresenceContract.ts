/**
 * MAZER-UI-024: pure rules for the main-menu "online now" counter.
 *
 * Ported from the website's contract (FawxzzyWeb `src/lib/presence/presence-contract.mjs`,
 * docs/live-presence.md) with the channel name and the origin allow-list as Mazer's own,
 * so Web and Mazer counts never mix. No I/O, no Phaser, no DOM.
 *
 * Definition: the number of Mazer tabs that are visible in a browser right now, one per tab,
 * anonymous. A person with two visible windows counts twice. Nothing identifying is sent or
 * stored: each tab joins with a random in-memory key that disappears when the tab closes.
 */

/** Public Supabase Realtime presence channel. Separate from the website's `web-presence-v1`. */
export const MAZER_PRESENCE_CHANNEL = 'mazer-presence-v1';

/** Only the real production Mazer origin runs presence. Previews, localhost, other hosts stay inert. */
export const MAZER_PRESENCE_ORIGINS: readonly string[] = Object.freeze(['https://mazer.fawxzzy.com']);

export const isMazerPresenceOrigin = (origin: string | null | undefined): boolean => (
  typeof origin === 'string' && MAZER_PRESENCE_ORIGINS.includes(origin)
);

/**
 * Snapshot semantics: always recompute from the current presence state, never accumulate
 * join/leave deltas. State shape is `{ [presenceKey]: [meta, ...] }`.
 */
export const countPresence = (state: unknown): number => {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    return 0;
  }
  return Object.values(state as Record<string, unknown>)
    .filter((entries) => Array.isArray(entries) && entries.length > 0)
    .length;
};

/** Realtime websocket URL for a Supabase project URL, or null when it is not an https `<ref>.supabase.co` origin. */
export const resolvePresenceRealtimeUrl = (supabaseUrl: string | null | undefined): string | null => {
  if (typeof supabaseUrl !== 'string') {
    return null;
  }
  try {
    const parsed = new URL(supabaseUrl.trim());
    if (
      parsed.protocol !== 'https:'
      || !/^[a-z0-9]{10,40}\.supabase\.co$/u.test(parsed.hostname)
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
      || parsed.username
      || parsed.password
    ) {
      return null;
    }
    return `wss://${parsed.hostname}/realtime/v1`;
  } catch {
    return null;
  }
};

const decodeJwtRole = (token: string): string | null => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/gu, '+').replace(/_/gu, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(globalThis.atob(padded)) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
};

/**
 * Defense in depth: refuse anything that is recognizably a server-side secret before it goes to a
 * browser websocket. Mazer already ships its anon key to the browser for sign-in; this only guards
 * against a mis-wired build value.
 */
export const isBrowserSafePresenceKey = (key: string | null | undefined): key is string => {
  if (typeof key !== 'string') {
    return false;
  }
  const trimmed = key.trim();
  if (trimmed.length < 20 || /\s/u.test(trimmed) || trimmed.startsWith('sb_secret_')) {
    return false;
  }
  const role = decodeJwtRole(trimmed);
  return role === null || role === 'anon';
};

/** The only metadata a tab ever tracks. */
export const MAZER_PRESENCE_TRACK_PAYLOAD = Object.freeze({ v: 1 });

/**
 * Site-style text: never a number for an unknown, zero or invalid count (no false precision).
 * 1,234 reads `1.2k`.
 */
export const formatOnline = (count: number | null | undefined): string | null => {
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
    return null;
  }
  if (count < 1000) {
    return String(count);
  }
  if (count < 10000) {
    return `${(Math.floor(count / 100) / 10).toString().replace(/\.0$/u, '')}k`;
  }
  return `${Math.floor(count / 1000)}k`;
};

/**
 * Text for the tile glyph font (letters and digits only, no punctuation): 1..999 verbatim,
 * then whole thousands (`1K`, `12K`), capped at `99K`. A zero or unknown count is null.
 */
export const formatOnlineGlyph = (count: number | null | undefined): string | null => {
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
    return null;
  }
  if (count < 1000) {
    return String(count);
  }
  return `${Math.min(99, Math.floor(count / 1000))}K`;
};
