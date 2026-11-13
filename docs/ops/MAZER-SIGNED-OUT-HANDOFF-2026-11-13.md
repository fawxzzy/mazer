# Signed-out launch goes straight to the account host (MAZER-ACCT-040)

Owner request (2026-11-13): "when you load into the app the first screen is a mazer specific sign in screen ... can we remove the mazer one and just have it load right to the account one."

## Behaviour

A signed-out launch of the installed app leaves for the account host's sign-in page while the HTML splash is still up, before Phaser exists. The Mazer `Welcome` screen is never drawn on that path. The hand-off is the one the Sign in button already ran (`beginMazerOAuthAuthorization`: storage probe, 4 s provider pre-flight, PKCE pending record, `location.assign`). Returning from the host lands signed in exactly as before (the OAuth callback is consumed in `src/boot/main.ts`).

Code: `src/legacy-runtime/legacySignedOutHandoff.ts` (pure decision, storage records, orchestration), `src/boot/signedOutHandoffBoot.ts` (browser binding), one call in `src/boot/main.ts` after the callback is consumed and the install gate has resolved, before the account bootstrap and `new Phaser.Game`.

The Mazer `Welcome` screen stays, as the FALLBACK only: it is what a signed-out player sees when the automatic redirect did not (or must not) happen. It keeps its held failure line and its `Sign in` button (the retry; the dock label does not change to "Try again").

## When it redirects, and when it does not

First matching reason wins (`decideMazerAutoHandoff`, pinned by `tests/reset/legacy-signed-out-handoff.test.ts`):

| Reason (stay on Mazer) | Why |
| --- | --- |
| signed-in (a stored shared-auth session exists) | One synchronous `localStorage` read. A signed-in launch never redirects and pays nothing. Also settles any stale sign-out/attempt record. |
| oauth-callback (URL carries `code`, `state`, `error`, `error_description`) | Success, denial (`error=access_denied`), state mismatch, expired code, malformed values: the callback was consumed in `main.ts`; a failure shows the held failure line on the fallback screen. Never re-redirect. |
| opted-out (`?autoSignIn=0`) | QA of the fallback screen. |
| localhost | The canonical return URL is `https://mazer.fawxzzy.com/`, so a local dev server would leave for production. |
| level-preview (`?previewLevel=N`) and auth-fixture (`authFixture=authenticated`) | QA bypasses, unchanged. |
| session-quarantined | The scene recovers it and reports the code. |
| explicit-sign-out | See below. |
| attempt-in-flight | Loop guard, see below. |

The install gate is unchanged and runs first: an uninstalled browser tab still gets the install card, never the host, and only an installed (standalone) launch reaches the hand-off. Password recovery and legal routes still redirect to the host as before.

## Loop guard (acceptance a)

Just before leaving, boot writes `mazer.auth.auto-handoff-attempt.v1` (sessionStorage, `{ at }`). While a record is younger than 15 minutes (the PKCE pending TTL, `MAZER_AUTO_HANDOFF_ATTEMPT_WINDOW_MS`) a launch without a session does not redirect again: the player backed out of the host (back button, cancelled login, host error page) and gets the fallback screen. 15 minutes is deliberately stricter than the card's "1 per 60 s" so a player who cancels and returns after two minutes is not bounced back into the host. Cleared when a launch sees a stored session. If sessionStorage is blocked the redirect is not started at all (without the record nothing could stop a loop).

If the hand-off is refused before leaving (`provider_unreachable` pre-flight, offline, `storage_unavailable`, `authorization_unavailable`), the record is removed (nothing left the page, so nothing is in flight), the category is handed to the scene through `recordMazerOAuthBootFailure` and the fallback screen shows the existing held failure line (`Sign-in is unavailable right now. Try again in a few minutes.` for `provider_unreachable`). The next launch (back online) tries again. If the navigation has not taken the page away after 10 s (`MAZER_AUTO_HANDOFF_NAVIGATION_TIMEOUT_MS`), boot continues to the fallback screen instead of sitting on the splash.

## Sign out (acceptance b): decision

Mazer's Sign out is a local sign-out of this device (`signOutLegacyAuth`). It now also writes `mazer.auth.explicit-sign-out.v1` (localStorage). While that flag is set, launches stay on the Mazer fallback screen with its `Sign in` button; they do NOT bounce back to the host. The flag is cleared when a launch sees a stored session (i.e. after the player signs in again). Reason: the host session is shared across Fawxzzy apps and may still be signed in, so an automatic redirect right after Sign out could silently sign the player straight back in, which makes Sign out look broken. A failed Sign out (session still stored) writes nothing. Session expiry or revocation is not a sign-out: the next launch redirects.

Consequence the owner may want to revisit: Mazer Sign out does not end the host session. Observed live (headless, QA account): after Mazer Sign out, tapping Sign in on the fallback screen came straight back signed in with no host login form, because the host session was still alive. Ending it needs a host change (out of scope, see `needsOwner` in the PR).

## Create Account (acceptance e)

The host login page offers account creation; the PKCE `authorize` request that starts at the hand-off is carried through the host, so sign-up returns to Mazer the same way sign-in does. The fallback screen's `Create Account` rail still starts the same hand-off. Not exercised end to end: that would create a production account.

## QA harness (acceptance d)

The standing harness no longer taps a button. Fresh context, standalone display-mode overrides, load `https://mazer.fawxzzy.com/` (no `?runtimeDiagnostics` needed), wait for the URL to match `account.fawxzzy.com/login`, fill the identifier and password, submit, wait for `https://mazer.fawxzzy.com/` and read `scene.authSnapshot.status`. To see the fallback screen instead, load `/?autoSignIn=0`. Local dev servers and `previewLevel` runs never redirect.

## Offline (acceptance c)

A signed-out installed launch with the network down tries the hand-off, the pre-flight reports offline, and the fallback screen shows the provider_unreachable line. `scripts/analysis/verify-offline-shell.mjs` (checks 11 and 12) now asserts exactly that without tapping Sign in.

Side effect: a signed-out FIRST launch redirects before the game is created, and the service worker is registered after game creation, so the worker is first registered on the first signed-in boot. An already-installed worker keeps working offline as before.

## Guide

The in-app Guide has no row about the sign-in screen, so no Guide copy changed (the drift test stays green). No new player-visible strings were added, so the player-message inventory has no new rows; the existing `Welcome` rows now describe the fallback screen.
