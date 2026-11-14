/**
 * MAZER-ACCT-042: the host-loader -> Mazer-loader hand-off.
 *
 * The account host shows its own loader while it finishes the sign-in redirect and holds it until 500 ms after its
 * first paint, then navigates to Mazer. If Mazer's loader then waited its usual 150 ms (LOADER_SHOW_DELAY_MS) before
 * showing the icon, the player would see icon -> dark gap -> icon. So when the page was reached FROM the account
 * host (document.referrer is the host origin) or carries OAuth callback parameters, the HTML splash stage is shown
 * INSTANTLY (no delay, no fade-in) and the in-game cover starts opaque under it (MenuScene already starts the cover
 * `instant` while the splash is present). Ordinary cold opens keep the 150 ms delay.
 *
 * The same test runs as a tiny inline script in index.html (before first paint, it sets
 * `data-mazer-loader="instant"` on <html>); this module is the pure, unit-tested twin and
 * tests/reset/loader-handoff.test.ts evaluates the inline script against it so they cannot drift.
 */
export const MAZER_ACCOUNT_HOST_REFERRER_PREFIX = 'https://account.fawxzzy.com/';
export const MAZER_LOADER_HANDOFF_ATTRIBUTE = 'data-mazer-loader';
export const MAZER_LOADER_HANDOFF_INSTANT_VALUE = 'instant';

const OAUTH_CALLBACK_PARAMETER_PATTERN = /[?&](code|state|error|error_description)=/;

export const isMazerLoaderHandoff = (facts: { referrer?: string | null; search?: string | null }): boolean => (
  (facts.referrer ?? '').startsWith(MAZER_ACCOUNT_HOST_REFERRER_PREFIX)
  || OAUTH_CALLBACK_PARAMETER_PATTERN.test(facts.search ?? '')
);
