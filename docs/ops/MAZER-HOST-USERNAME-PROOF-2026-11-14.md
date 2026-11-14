# Does the account host rename the Mazer leaderboard name? (MAZER-ACCT-044, part 1)

Date: 2026-11-14. Status: read of source plus one read-only live check with the standing QA account. Headless desktop
Chromium only; nothing was checked on a real phone. This document grants no release, deploy or provider authority.

Question (left open by MAZER-ACCT-043): the owner rule is "no Mazer account screens, only account.fawxzzy.com screens".
The leaderboard `Edit name` editor was kept because nobody had proved that a username save on the account host also
renames the Mazer leaderboard profile. Can the editor be replaced by a hand-off to the host?

## Answer: NO. The host has no username save at all.

Source (FawxzzyWeb `origin/main` e878be4):

- `src/components/account/account-portal.tsx`, the signed-in account page: the Username field
  (`id="account-current-username"`) and the Email field are both `readOnly` inputs that only display
  `session.displayName` and `session.email`. There is no Save control and no submit handler for them.
- `src/lib/auth/browser-adapter.ts`: the only account writes are `signUp` (sets `data: { display_name, username }` once,
  at sign-up), `updateUser({ email })` and `updateUser({ password })`. There is no `updateUser({ data: ... })` for the
  username and no call to a Mazer RPC. `mazer_set_username` is not referenced anywhere in FawxzzyWeb.
- Mazer side: `mazer.mazer_set_username(p_expected_user_id, p_username)` writes only `mazer.mazer_profiles.username`
  (migration `20260827190000`); the in-game save is `saveLegacyAccountUsername` in `src/legacy-runtime/legacyAuth.ts`,
  which calls it through the `mazer` schema client. Sign-in username and leaderboard username are two stores:
  `auth.users` `user_metadata.username` (shown by the host) and `mazer_profiles.username` (shown on the leaderboard).

Live (production, 2026-11-14, QA account `mzr-qa-1112` signed in through the real Mazer to host hand-off, desktop
1280x720): `https://account.fawxzzy.com/account` rendered `#account-current-username` with `readOnly: true`, value
`mzr-qa-1112`; controls on the page were Reset Password, Privacy Policy, Terms of Service and Sign out; a Playwright
`fill` on the field was refused (timeout, not editable). Nothing was renamed, so the QA name needed no restore; it
still reads `mzr-qa-1112`. Screenshot kept locally at `C:\ATLAS\tmp\wt\mazer-qa-1112\acct044\host-account-page-desktop.png`
(not committed: it shows the QA mailbox address).

## Consequence

The `Edit name` editor stays. Removing it would leave the player with no way to change the leaderboard name anywhere.

## What the host would have to do (FawxzzyWeb change, no SQL change)

1. Make the Username field editable with a Save action.
2. On save, call the existing RPC through the `mazer` schema with the signed-in client:
   `client.schema('mazer').rpc('mazer_set_username', { p_expected_user_id: <auth uid>, p_username })`. Treat
   `MAZER_PROFILE_MISSING` by calling `mazer_ensure_profile` once and retrying (as `saveLegacyAccountUsername` does),
   map `23505` to a taken-name message and `MAZER_USERNAME_INVALID` to the existing 2 to 15 character rule.
3. Decide the identity question below, which is why this was not built without the owner.

Owner decision needed: should the account username and the leaderboard name be the same value? Today they are
separate on purpose (docs/current-truth: the sign-in name is shared by every app and is deliberately left alone by a
Mazer rename; the guard trigger `account_guard_username_claim` also watches username claims on `auth.users`).
Recommendation: yes, one name. The host save writes the Mazer profile through the RPC above and then mirrors it with
`auth.updateUser({ data: { username, display_name } })` so the host page, the sign-in lookup and the leaderboard agree;
prove it live with the QA account after the host deploy (rename on the host, reload the Mazer leaderboard You row,
restore, read back) before removing `Edit name` and its Guide rows from Mazer.
