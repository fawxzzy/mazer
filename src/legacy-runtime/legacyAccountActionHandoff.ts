/**
 * MAZER-UI-100: Sign out and Reset progress live ONLY on the account page (account.fawxzzy.com, reached from the
 * Profile button). Both still finish inside Mazer, because Mazer keeps its own session and its own copy of the
 * progress on this origin: ending the account-host session alone leaves Mazer signed in, and a server-only reset
 * would be merged straight back by the monotonic progression merge. So the account page hands back with one
 * closed-set query key (FawxzzyWeb src/config/mazer-account-actions.ts):
 *
 *   ?accountAction=signed-out      the player pressed Sign out on the account page (that session is already gone)
 *   ?accountAction=reset-progress  the player pressed Reset progress on the account page
 *
 * The key carries no token, code or id and nothing in it is followed. Mazer reads it once on boot and strips it
 * from the address bar (the same scrub as `?notice=`), so a reload or shared link never replays it.
 *
 *  - `signed-out` is honoured only when the page was reached from the account host (document.referrer starts with
 *    MAZER_ACCOUNT_ACTION_REFERRER_PREFIX; the host sends `strict-origin-when-cross-origin`, so the referrer is its
 *    origin). A third-party link to `?accountAction=signed-out` is stripped and ignored (no logout CSRF). Mazer
 *    then runs its ordinary LOCAL sign-out (which records the explicit sign-out, so the launch stays on the Mazer
 *    sign-in screen) and never bounces to the host sign-out again.
 *  - `reset-progress` only opens Mazer's existing confirmation screen (same copy, same arm delay, same reset path);
 *    nothing is reset until the player confirms there, so it needs no referrer. It waits for the auth gate: signed
 *    in it opens once, signed out it is dropped.
 *
 * Pure apart from the injected location/history and the one module-level pending slot the boot fills and
 * MenuScene drains; the browser binding is src/boot/main.ts.
 */
import { MAZER_ACCOUNT_PORTAL_ORIGIN } from './legacyAccountPortal';

/** The account host's origin as the referrer it sends (src/boot/loaderHandoff.ts uses the same prefix). */
export const MAZER_ACCOUNT_ACTION_REFERRER_PREFIX = `${MAZER_ACCOUNT_PORTAL_ORIGIN}/`;

export const MAZER_ACCOUNT_ACTION_PARAM = 'accountAction';

export type MazerAccountAction = 'signed-out' | 'reset-progress';

const MAZER_ACCOUNT_ACTIONS: ReadonlySet<string> = new Set<MazerAccountAction>(['signed-out', 'reset-progress']);

/** Exactly one `accountAction` value from the closed set, else null. */
export const parseMazerAccountAction = (search: string): MazerAccountAction | null => {
  const values = new URLSearchParams(search).getAll(MAZER_ACCOUNT_ACTION_PARAM);
  if (values.length !== 1) {
    return null;
  }
  const [value] = values;
  return MAZER_ACCOUNT_ACTIONS.has(value) ? (value as MazerAccountAction) : null;
};

/** True when the page was opened from the account host (the only place that may send `signed-out`). */
export const isMazerAccountHostReferrer = (referrer: string | null | undefined): boolean => (
  (referrer ?? '').startsWith(MAZER_ACCOUNT_ACTION_REFERRER_PREFIX)
);

export interface MazerAccountActionLocation {
  hash: string;
  pathname: string;
  search: string;
}

export interface MazerAccountActionHistory {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

/**
 * Reads the action and strips every `accountAction` key from the address bar (other keys and the hash stay).
 * Returns null (key still stripped) for an unknown or repeated value, for `signed-out` without the account-host
 * referrer, and when `ignore` is set (an OAuth callback on the same URL is the more specific story). No key: the
 * address bar is not touched.
 */
export const captureAndScrubMazerAccountAction = (
  location: MazerAccountActionLocation,
  history: MazerAccountActionHistory,
  options: { ignore?: boolean; referrer?: string | null } = {}
): MazerAccountAction | null => {
  const query = new URLSearchParams(location.search);
  if (!query.has(MAZER_ACCOUNT_ACTION_PARAM)) {
    return null;
  }
  const action = parseMazerAccountAction(location.search);
  query.delete(MAZER_ACCOUNT_ACTION_PARAM);
  const search = query.toString();
  history.replaceState(null, '', `${location.pathname}${search.length > 0 ? `?${search}` : ''}${location.hash}`);
  if (options.ignore === true || action === null) {
    return null;
  }
  if (action === 'signed-out' && !isMazerAccountHostReferrer(options.referrer)) {
    return null;
  }
  return action;
};

export type MazerAccountActionStep = 'wait' | 'open-reset-confirmation' | 'drop';

/**
 * What MenuScene does with a pending `reset-progress` this frame: wait while the auth gate is still resolving (or
 * the forced sign-in screen is up), open the confirmation once signed in, drop it for a signed-out player.
 */
export const resolveMazerAccountActionStep = (facts: {
  authResolved: boolean;
  pending: MazerAccountAction | null;
  signedIn: boolean;
}): MazerAccountActionStep | null => {
  if (facts.pending !== 'reset-progress') {
    return null;
  }
  if (!facts.authResolved) {
    return 'wait';
  }
  return facts.signedIn ? 'open-reset-confirmation' : 'drop';
};

let pendingMazerAccountAction: MazerAccountAction | null = null;

/** Boot: hold `reset-progress` for MenuScene (only that action waits for the game). */
export const holdMazerPendingAccountAction = (action: MazerAccountAction | null): void => {
  pendingMazerAccountAction = action === 'reset-progress' ? action : null;
};

export const peekMazerPendingAccountAction = (): MazerAccountAction | null => pendingMazerAccountAction;

/** MenuScene: drop the pending action once it has been answered (opened or dropped). */
export const clearMazerPendingAccountAction = (): void => {
  pendingMazerAccountAction = null;
};
