/**
 * Auth Surface v2 follow-up: a stopped sign-in comes back to Mazer with a notice.
 *
 * When the account host cannot finish an authorization (the request expired, was invalid, or belongs to another
 * signed-in account) it sends the player to the constant `https://mazer.fawxzzy.com/?notice=expired`; when the
 * account service or the approval call failed it sends `?notice=unavailable` (FawxzzyWeb `mazerSignInNoticeUrl`).
 * The key is a closed set and is never an OAuth callback: it carries no code, state or error, and nothing in it is
 * followed. Mazer reads it once on boot, shows the matching copy-matrix line in the signed-out status box, and
 * strips the key from the address bar the same way the callback scrub strips code/state.
 *
 * Unknown values (and a repeated key) are ignored: no line is shown and the plain sign-in screen stays. The key is
 * still stripped so a reload or a shared link never replays it.
 *
 * Pure apart from the injected location/history; the browser binding is src/boot/main.ts.
 */
import { AUTH_SURFACE_MESSAGES } from '../brand/authSurfaceCopy';
import type { MazerOAuthFailureCategory } from './legacyAccountPortal';

export const MAZER_AUTH_RETURN_NOTICE_PARAM = 'notice';

export type MazerAuthReturnNotice = 'expired' | 'unavailable';

const MAZER_AUTH_RETURN_NOTICES: ReadonlySet<string> = new Set<MazerAuthReturnNotice>(['expired', 'unavailable']);

/**
 * The copy-matrix line each notice shows. `expired` covers every "start again from Mazer" case the host sends
 * (expired, invalid or other-account request), so it reads as the callback line; the matrix has no separate
 * expired sign-in row. `unavailable` is the outage line.
 */
export const MAZER_AUTH_RETURN_NOTICE_COPY: Readonly<Record<MazerAuthReturnNotice, string>> = Object.freeze({
  expired: AUTH_SURFACE_MESSAGES['signin.callback'],
  unavailable: AUTH_SURFACE_MESSAGES['signin.unavailable']
});

/**
 * The boot failure category each notice is recorded as, so the existing held-failure plumbing (status box notice,
 * toast suppression, feedback lifetime) shows it exactly like a callback failure. Both categories already map to
 * the lines above (legacyPlayerMessage.ts: expired_or_missing_state -> contextLost -> signin.callback,
 * provider_unreachable -> providerUnreachable -> signin.unavailable); tests pin that the two tables agree.
 */
export const MAZER_AUTH_RETURN_NOTICE_CATEGORY: Readonly<Record<MazerAuthReturnNotice, MazerOAuthFailureCategory>> =
  Object.freeze({
    expired: 'expired_or_missing_state',
    unavailable: 'provider_unreachable'
  });

/** Exactly one `notice` value from the closed set, else null. */
export const parseMazerAuthReturnNotice = (search: string): MazerAuthReturnNotice | null => {
  const values = new URLSearchParams(search).getAll(MAZER_AUTH_RETURN_NOTICE_PARAM);
  if (values.length !== 1) {
    return null;
  }
  const [value] = values;
  return MAZER_AUTH_RETURN_NOTICES.has(value) ? (value as MazerAuthReturnNotice) : null;
};

export interface MazerAuthReturnNoticeLocation {
  hash: string;
  pathname: string;
  search: string;
}

export interface MazerAuthReturnNoticeHistory {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

/**
 * Reads the notice and strips every `notice` key from the address bar (other query keys and the hash stay).
 * With `ignore` set (an OAuth callback is on the same URL, and its outcome is the more specific story) the key is
 * stripped but no notice is returned. No `notice` key: the address bar is not touched.
 */
export const captureAndScrubMazerAuthReturnNotice = (
  location: MazerAuthReturnNoticeLocation,
  history: MazerAuthReturnNoticeHistory,
  options: { ignore?: boolean } = {}
): MazerAuthReturnNotice | null => {
  const query = new URLSearchParams(location.search);
  if (!query.has(MAZER_AUTH_RETURN_NOTICE_PARAM)) {
    return null;
  }
  const notice = parseMazerAuthReturnNotice(location.search);
  query.delete(MAZER_AUTH_RETURN_NOTICE_PARAM);
  const search = query.toString();
  history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
  return options.ignore === true ? null : notice;
};
