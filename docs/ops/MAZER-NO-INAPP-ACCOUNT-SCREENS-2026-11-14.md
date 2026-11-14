# Mazer keeps no in-app account screens (MAZER-ACCT-043)

Date: 2026-11-14. Status: source change in a PR, headless Chromium only (phone emulation 390x844 @ DPR 3, touch, mobile
user agent; desktop 1280x720), not checked on a real phone, not deployed. This document grants no release, deploy or
provider authority.

Owner rule (Zac, 2026-11-13): there should be no Mazer account screens left in the app, only account.fawxzzy.com screens.

## The rule

Anything whose purpose is signing in, signing up, account settings, credentials, a session or sign-out lives ONLY on
`account.fawxzzy.com`. Mazer keeps no screen for it. Every in-app entry point is a plain hand-off to the matching host
page, or it is deleted. Game-only identity that is not an account (the public leaderboard handle) may stay.

The one exception that cannot be a redirect is the FAILURE FALLBACK of the hand-off. A refused hand-off, an offline
start, a denied or failed return and an explicit sign-out must not redirect again (loop risk, see
`src/legacy-runtime/legacySignedOutHandoff.ts`). That state is now a minimal status state in the loader's visual
language, not an account screen.

## Audit table (code on `origin/main` 9fd0e890, before this change)

| # | Surface | File and trigger | Decision |
|---|---|---|---|
| 1 | Welcome / sign-in screen: `MAZER` marker, `Welcome`, `Create Account \| Reset Password` rail, `Privacy Policy \| Terms of Service` row, `Sign in` dock | `MenuScene.buildAuthOverlay` + `buildSharedAccountEntrySection`, drawn from `legacyAuthScreenView.ts`. Trigger: `authGateLocked` (signed out, offline, refused hand-off, failed return, explicit sign-out) via `enterForcedLegacyAuthOverlay` | REPLACED by the failure fallback (below). The module `legacyAuthScreenView.ts` is deleted; `legacyAccountStatusState.ts` replaces it |
| 2 | Account overlay (authenticated): name, "Manage your profile and account from the shared Fawxzzy account portal", `Reset progress` link, `Account` and `Sign out` docks | `MenuScene.buildAuthenticatedAccountSection`. Trigger: `openOverlay('auth')` while authenticated (only the QA bridge or back-navigation from the reset confirmation reached it; the profile icon already navigates to the host) | DELETED. The profile icon keeps handing off to `https://account.fawxzzy.com/account` |
| 3 | In-scene password-recovery form (two password fields, `Update password`, `Request new link`, `Continue`) | `buildPasswordRecoveryOverlay`, `handleLegacyPasswordRecoveryPrimaryAction`, driven by `/update-password` or the auth library `PASSWORD_RECOVERY` event | DELETED. `/update-password` is redirected to the host before the game boots (`src/boot/main.ts`, untouched). A `PASSWORD_RECOVERY` event is now ignored by the scene |
| 4 | Credential sign-in path: native email/password inputs, key capture, `handleLegacyAuthSubmit`, `signInLegacyAuth`, validation toasts (`Details look good...`), remembered-email prefill, `authAction` diagnostics | `MenuScene` form state (`authForm`, `activeAuthField`, `authNativeInput*`), `legacyAuth.ts` | DELETED with its tests. Not reachable by any control since the OAuth hand-off; the last path in was the recovery flow (row 3) |
| 5 | `Signing you in…` / `Loading…` gate cover | `syncLegacyAuthGateLoadingScreen` over the shared loader (VIS-039) | KEPT. A transient loading label, not an account screen. The wording rule (claim only with evidence) is unchanged |
| 6 | Main menu `Login` button and the profile icon | `createButton('Login')`, `createLegacyMenuProfileButton` -> `openSharedAccountSurface` | KEPT. Plain hand-off: signed out starts the OAuth hand-off, signed in navigates to the account home. The online-counter lane edits the header; not touched here |
| 7 | Settings `Account` section: `Reset progress` and `Sign out` rows | `legacySettingsSheetPlan.ts`, `SIGN_OUT` -> `handleLegacyAuthSignOut` | KEPT as rows of the Settings sheet (they open no screen). `Reset progress` is game data, not an account. `Sign out` still performs the local sign-out until the PWA-007 + ACCT-042 lane lands the host sign-out call (`https://account.fawxzzy.com/signout?returnTo=...`), which owns that function; not duplicated here |
| 8 | Leaderboard username gate, `Edit name` and the inline name editor | `legacyLeaderboardView.ts`, `legacyLeaderboardUsernameEditor.ts`, `MenuScene` editor | KEPT for now, decision below |
| 9 | Guide rows about accounts | `legacyGuideContent.ts` | None exist. Nothing to remove; the Guide drift test still passes |
| 10 | Legal links (Privacy, Terms) | were on the Welcome screen | REMOVED with it. The host owns the legal pages; `src/boot/legalSurface.ts` (other lane) still serves them |

## Handle edit (row 8): decision

Decision: KEEP the leaderboard `Edit name` editor in this change and follow up (card suggested), because the leaderboard
handle is game identity, not an account credential, and moving it to the host would strand players without a way to
rename until two things are proven that this headless-only change cannot prove:

1. The host username save (`account-portal.tsx` username field) changes the Mazer leaderboard profile. The Mazer
   rename is a database function (`MAZER-ACCT-025`: it sets both the username and the display name); the account
   host's save writes Auth metadata. Whether the host calls the Mazer rename is unknown and would need a read of the
   FawxzzyWeb source plus a live check with the standing test account.
2. A taken-name error on the host reads as well as the in-game one does (`MAZER-ACCT-029` is merged but not live).

If both hold, the right end state is: the leaderboard shows the handle read-only and `Edit name` becomes a hand-off to
the account page. Recommendation: do that as a separate card after the host proof, then delete
`legacyLeaderboardUsernameEditor.ts`.

## The failure fallback

Drawn by `MenuScene.buildAuthOverlay` from `src/legacy-runtime/legacyAccountStatusState.ts`:

- the app icon and halo in the same place and size as the boot splash and the gate cover (`resolveLoaderLayout`), as
  still images (the halo is the reduced-motion pose);
- ONE status line under the icon: the failure copy (`LEGACY_OAUTH_FAILURE_MESSAGE_COPY` classes, or the generic
  connection line), `You are signed out.` after an explicit sign-out or a return without a session, or
  `Still opening. Try again.` once the 10 s timeout elapsed;
- ONE full-width bottom button: `Try again`, which re-runs the same hand-off (`handleSharedAccountAuthorization`,
  provider pre-flight included). While the redirect is in flight it reads `Opening…` and is disabled;
- no title, no marker, no fields, no rail, no legal row, no `Create Account`, no `Sign in` / `Sign up` wording, no
  guest, skip or back action.

Loop guard and explicit-sign-out semantics are unchanged: `legacySignedOutHandoff.ts` still decides when a boot may
redirect by itself, and still stays on this state after an explicit sign-out or a return inside the attempt window.
`?autoSignIn=0` still opts a boot out of the automatic hand-off (QA of this state).

Wording issue (fixed by MAZER-ACCT-044): the generic connection line (`MAZER_OAUTH_SAFE_ERROR_MESSAGE`) used to say "Return to Mazer and try again", which read oddly inside Mazer. It now reads "Could not reach your account. Try again." (the constant and `LEGACY_OAUTH_FAILURE_MESSAGE_COPY.generic`; the two edits shipped as a Wave 3B and a Wave 5C PR).

## Evidence

Screenshots (phone emulation 390x844 @ DPR 3, touch, iPhone user agent; headless Chromium; installed-app display mode
could not be emulated here) are in `C:\.playwright-mcp` on the author's machine and are not committed:

- before: `before-02-settings-signout-row.png` (Settings, Account section), `before-03-leaderboard.png`,
  `before-04-account-overlay-authenticated.png` (the deleted Account overlay), `acct038-welcome-390.png` and
  `acct038-welcome-1280.png` (the deleted Welcome screen);
- after: `after-01-fallback-failed-390.png`, `after-02-fallback-signedout-390.png`, `after-03-fallback-1280.png`.

## Deleted

Code: `legacyAuthScreenView.ts`, `legacyAuthPresentation.ts`, the credential form, recovery form, native input and key
capture, `authAction` diagnostics, the form-state types and helpers in `legacyAuth.ts` (`signInLegacyAuth`,
`updateLegacyPassword*`, `resolveLegacyPasswordUpdateSubmitState`, the recovery URL helpers, `createEmptyLegacyAuthFormState`,
`resolveLegacyAuthSubmitState`, the remembered-email read/write wrappers). Tests, inventory rows and the evidence
entries that cited the deleted code went with them.

Kept on purpose (live): `isLegacyPasswordRecoveryRuntimeLocation` and `LEGACY_PASSWORD_RECOVERY_PATH` (used by
`src/boot/main.ts` to redirect `/update-password`), `signOutLegacyAuth`, session restore, the remembered-identity
state used by diagnostics and re-auth, the OAuth hand-off and its failure categories.

## Follow-ups not done here

- Wave 3B (`legacyPlayerMessage.ts`): done by MAZER-ACCT-044. `resolveLegacyPasswordRecoveryError`, `resolveLegacyAuthValidationMessage` and the copy rows `loginReady`, `enterEmail`, `passwordMinimum`, `passwordMismatch`, `passwordRecoveryInvalid`, `passwordRecoveryUpdated`, `passwordResetNotConfigured`, `passwordResetSent` are deleted with their tests and inventory rows. `emailInvalid` and `passwordPolicy` stay: `resolveLegacyAuthFeedbackMessage` still maps provider error text to them (diagnostics only).
- Wave 0C: `scripts/analysis/capture-ui-surfaces.mjs` still expects the Welcome labels; separate PR for the same reason.
- Wave 1C: `formMode` and `invalidFields` in the runtime diagnostics are published as constants until the diagnostics
  type drops them.
- The back-chevron plumbing in `MenuScene` (`overlayBackChevronBounds` and its handler) has no producer any more.
- Move the leaderboard handle edit to the host (see above).
