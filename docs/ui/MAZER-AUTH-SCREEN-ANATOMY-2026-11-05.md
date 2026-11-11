# Mazer Auth Screen Anatomy (shared-account entry)

Date: 2026-11-05. Status: WIRED (wave `claude/mazer-w2-leaderboard-auth-20261105`, source-proven in a local worktree; not
deployed). `MenuScene.buildSharedAccountEntrySection` / `buildAuthOverlay` now draw this view-model and layout. The
opening timeout is 10 s (owner decision) and the dock label is `Opening…`. `Create Account` stays on the OAuth
hand-off because FawxzzyWeb has no sign-up deep link (`LoginPanel` keeps `intent` in React state only; verified
read-only at FawxzzyWeb b0a9f88). First-time signed-out visitors skip the `Signing you in…` cover entirely
(`src/legacy-runtime/legacyAuthGateResolution.ts`). The sections below are the original spec and wiring plan. This
document grants no release, deploy or provider authority.

Wave note: `scripts/analysis/capture-ui-surfaces.mjs` (and `tests/reset/ui-surface-capture-script.test.mjs`) are
owned by Wave 0C, so this wave did NOT edit them (the integrator-wave guard rejects a 0C + 5C mix). Its
`AUTH_EXPECTED_LABELS` still list the old `Create account` / `Reset password`, so `npm run visual:ui-surfaces`
reports a failing `auth-text-labels` check against the Welcome screen until Wave 0C applies the prepared follow-up
(new labels `Sign in`, `Create Account`, `Reset Password`, `Privacy Policy`, `Terms of Service`, an
`evaluateAuthWelcomeAnatomy` check, and `buttons` passed through for the auth surface; 41/41 against this wave's
build). The CI steps `ui-surfaces failure reporting` and `Options/Account reachability` pass unchanged.
`live-auth-persistence-soak.mjs` (Wave 5C) was updated: the Welcome labels are now in `RETIRED_LOCAL_AUTH_CONTROLS`
so they cannot leak onto the signed-out menu.

Implementation: `src/legacy-runtime/legacyAuthScreenView.ts` (pure; no Phaser, storage, network or clock).
Tests: `tests/reset/legacy-auth-screen-view.test.ts`.

Owner request (verbatim): "there's a unified login and auth screens system set up that mazer hasn't gotten fully
wired, it's an account.fawxzzy.com thing that the web page and I think fitness was half way there, but we need to
finish that and make sure it looks how it's supposed to look; ... There's a weird pre login screen thing that
happens when you go to access the app from browser or desktop."

## Decision (reversible)

Keep the in-game forced Account screen (no immediate redirect to the account host) and restyle it to the shared
auth-surface family anatomy (`FawxzzyWeb/docs/auth-surface-family.md`, Fitness as structural reference).

Why this wins: the family contract already says Mazer implements the anatomy inside the Phaser runtime with its
own static background and halted gameplay; an immediate redirect would put a blank/flash page ahead of every cold
start and still needs a Mazer-owned surface for the error, callback-pending and offline cases. Why the others lose:
(a) immediate redirect: no place to show capability-unavailable or stalled-handoff truth, and `current-truth.md`
says Mazer renders no competing login; (b) in-game credential fields: Mazer authenticates through OAuth 2.1 + PKCE
on the account host, so local password fields would duplicate credential authority the contract forbids.
Reversal cost is low: the view-model is renderer-neutral, so a redirect-first variant only changes the scene wiring.

Because authentication is OAuth, this screen has NO identifier or password fields. It is the `Welcome` entry card.

## Anatomy (top to bottom)

| # | Element | Spec | View-model field |
| - | ------- | ---- | ---------------- |
| 1 | Product marker | `MAZER` | `marker.label` |
| 2 | Title | `Welcome`; no subtitle; no remembered-username line (no session yet) | `title`, `subtitle: null` |
| 3 | Status banner (optional) | Error or pending copy, centered in the body zone | `banner` |
| 4 | Secondary rail | `Create Account` , `Reset Password`, separated by a centered 8x14 divider | `secondaryRail` |
| 5 | Legal row | `Privacy Policy` , `Terms of Service` | `legalRow` |
| 6 | Primary dock | ONE full-width action `Sign in`; visible disabled and pending states | `primaryDock` |

Forbidden on this surface: home/back/close action, guest-play action, subtitle, second dock button, credential
fields, display-name field. `anatomy` lists the visible element ids in order and is empty for the loading and
authenticated phases (the authenticated Account section is a different surface and is out of scope).

### Phases

| Phase | Trigger (inputs) | Dock | Banner |
| ----- | ---------------- | ---- | ------ |
| `loading` | `awaitingResolution` | none (loading copy only) | none |
| `authenticated` | `status === 'authenticated'` | none | none |
| `callback-pending` | `hasCallbackInProgress` | `Signing in`, disabled, pending | info: `Signing you in…` |
| `opening` | `submitting`, elapsed < 10000 ms | `Opening…`, disabled, pending | none |
| `opening-slow` | `submitting`, elapsed >= 10000 ms | `Sign in`, enabled (retry) | info: `Still opening. Continue in your browser or try again.` |
| `error` | non-empty `errorMessage`, or `status === 'unavailable'` | `Sign in`, enabled | error: message |
| `entry` | otherwise | `Sign in`, enabled | none |

Rail and legal links are disabled while the dock is pending (`callback-pending`, `opening`) so a mid-handoff tap
cannot navigate away. Precedence: loading > authenticated > callback-pending > opening/opening-slow > error > entry.
A real `errorMessage` always wins the banner over the generic unavailable fallback.

### Copy (stable strings)

Every existing error string is passed through unchanged (trimmed only), including
`MAZER_OAUTH_SAFE_ERROR_MESSAGE` = `Account connection unavailable. Return to Mazer and try again.` (re-exported
from `legacyAuthScreenView.ts`; a test pins it against `legacyAccountPortal.ts` and sweeps every
`LEGACY_AUTH_MESSAGE_COPY` value). New strings live in `LEGACY_AUTH_SCREEN_COPY`: `MAZER`, `Welcome`, `Sign in`,
`Opening`, `Signing in`, `Create Account`, `Reset Password`, `Privacy Policy`, `Terms of Service`, `Loading…`,
`Signing you in…`, `Still opening. Continue in your browser or try again.`

### Loading copy truth table

`resolveLegacyAuthLoadingCopy({ awaitingResolution, hasSession, callbackInProgress })` returns
`Signing you in…` only when `callbackInProgress || (awaitingResolution && hasSession)`; otherwise `Loading…`.

| awaitingResolution | hasSession | callbackInProgress | Copy |
| :-: | :-: | :-: | ---- |
| false | false | false | Loading… |
| false | true | false | Loading… |
| false | false | true | Signing you in… |
| false | true | true | Signing you in… |
| true | false | false | Loading… |
| true | true | false | Signing you in… |
| true | false | true | Signing you in… |
| true | true | true | Signing you in… |

A first-time visitor (no stored session, no callback) therefore never sees `Signing you in…`. `hasSession` is
"a persisted auth session exists to restore"; how MenuScene derives it cheaply is UNKNOWN (candidate: presence of
`MAZER_OAUTH_AUTH_SESSION_KEY` in the auth storage, without reading its value). Until wired, pass `false`, which
is the safe neutral default.

### Bounded `Opening` label

`Opening…` shows only while `submitting` and fewer than `LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS` (10000) ms have
elapsed (`submittingElapsedMs`, supplied by the scene clock). After that the model returns `opening-slow`: the dock
is `Sign in` and enabled and the banner offers `Continue in your browser`. The scene must also clear
`authSubmitting` at that point, because `handleSharedAccountAuthorization` returns early while it is set;
otherwise the retry is re-enabled visually but is inert. Omitting `submittingElapsedMs` keeps the model in
`opening` (never silently times out).

## Layout (`resolveLegacyAuthScreenLayout(width, height, safeArea)`)

Vertical extent reuses `resolveLegacyOverlayPanelLayout` (8 px compact / 16 px regular inset plus safe area).
Left/right safe-area insets are applied locally (the shared helper does not model them). Content column:
`min(420, usable width - 2 x side inset)`, side inset 16 compact / 24 regular, centered. Rows follow the family
contract geometry: two 44 px rows, the legal row's lower edge 16 px above the dock, the rail directly above the
legal row, a centered 8x14 divider. Dock height 52 (min 44 asserted).

Computed values (integers, no safe area unless stated):

| Viewport | Column (left, width) | Marker cy | Title cy | Body (top, h) | Rail top | Legal top | Dock (top, h) |
| -------- | -------------------- | --------- | -------- | ------------- | -------- | --------- | ------------- |
| 390x844 | 24, 342 | 50 | 111 | 147, 501 | 664 | 708 | 768, 52 |
| 390x844, top 47 / bottom 34 | 24, 342 | 97 | 158 | 194, 420 | 630 | 674 | 734, 52 |
| 1280x720 | 430, 420 | 64 | 126 | 162, 346 | 524 | 568 | 628, 52 |

For reference the real account-host screenshot at 390x844 has the dock at y 764-820, rail text centered at about
y 681 and legal at about y 725; the Mazer spec lands within ~5 px of those. `overflow: true` is returned when the
body zone would be negative (for example 844x390 landscape with a 21 px bottom inset); the scene then has to
scroll or compress only the body, never the intro or dock (family contract). Tests pin both the passing and the
overflow cases.

Open point: the family doc says the dock is 56 px (the preferred touch target token); this spec uses 52 per the
packet brief. Change `LEGACY_AUTH_SCREEN_DOCK_HEIGHT` if the owner prefers 56 (the layout still fits both
viewports).

## Token mapping

Colors are mapped from the account-host screenshots (`auth-account-login-app-mazer-390.png`) only to choose which
existing token to use; sampled values below are evidence, not new values. All tokens come from
`docs/contracts/mazer-ui-rework-design-tokens.v1.json`, consumed via `src/theme/tokens.ts` (`designTokens`,
`phaserMaterialAliases`) and `src/render/cyberArcadeMaterial.ts` (`cyberArcadeMaterial`).

| Role | Observed (account host) | Token | `cyberArcadeMaterial` alias |
| ---- | ----------------------- | ----- | --------------------------- |
| Screen background (near-black) | ~#070b09, faint lighter center ~#111a14 | `bg.canvas` (#03070B); optional soft center glow from `bg.shell` | `substrate.field` / `substrate.fieldRaised` |
| Product marker `MAZER` | saturated cyan | `semantic.info` | `rail.cyan` |
| Title `Welcome` | near-white | `text.primary` | `rail.white` |
| Secondary rail text | cyan | `semantic.info` | `rail.cyan` |
| Divider | cyan | `semantic.info` | `rail.cyan` |
| Legal row text | muted grey | `text.muted` | `rail.muted` |
| Dock fill (vertical gradient, ~#e5f4f4 top to ~#97f1eb bottom) | pale cyan | top `world.pathCore`, bottom `line.active` | `shine.edge`, `signal.playerHalo` |
| Dock label | dark | `bg.canvas` | `substrate.field` |
| Dock glow | soft cyan | `semantic.info` at reduced alpha | `rail.cyan` |
| Dock disabled | n/a | fill `bg.elevated`, label `text.disabled` | `substrate.panelRaised` |
| Dock pending | n/a | enabled fill at reduced alpha, same label | n/a |
| Error banner | red-pink | `semantic.danger` | `signal.goal` |
| Info banner | n/a | `text.muted` | `rail.muted` |
| Focus ring (keyboard) | n/a | `line.active`, `strokePx.focus` (3) | `signal.playerHalo` |
| Dock radius | pill | `radiusPx.round` | n/a (`controls.radius` is 8 and does NOT match the pill) |

Radius, spacing and touch size also come from tokens: `radiusPx.round`, `spacingPx[3]` (16) and `[5]` (24) for
the insets and gaps, `touchTargetMinPx` (44) for rows and the dock minimum.

NEW tokens needed: none. Two soft gaps for the owner to rule on: (1) the observed bottom-of-dock cyan (~#97f1eb)
is more saturated than `line.active` (#A7E7D9); `semantic.info` (#6BE8E1) is darker. Using `line.active` is the
closest in-system choice. (2) The legacy MenuScene error color `#ff9d9d` is a raw hex not in the token set; the
restyle should move to `semantic.danger`. Today's teal-green fill (~#031f20) is not a token color and should
simply be dropped.

## Current vs spec gaps

| ID | Current (source and screenshots `auth-m390-t10000.png`, `auth-d1280-t10000.png`) | Spec | Closed by |
| -- | --------------------------------------------------------------------------------- | ---- | --------- |
| G1 | Title `Account` (`MenuScene.buildAuthOverlay`, `createOverlayTitle('Account', ...)`) | `Welcome` | wiring packet; view-model `title` |
| G2 | Subtitle paragraph "Use your shared Fawxzzy account to keep progression, settings, and leaderboard identity connected." | No subtitle | wiring packet; `subtitle: null` |
| G3 | Two side-by-side bottom buttons `Create account` and `Sign in` | One full-width dock `Sign in`; Create Account moves to the secondary rail | wiring packet; layout `dock` |
| G4 | `Create account` and `Sign in` both call `handleSharedAccountAuthorization()` (identical OAuth start), so Create Account cannot land on a sign-up view | Create Account deep-links to the sign-up view | BLOCKED on FawxzzyWeb (no sign-up deep link exists; see below). Distinct `create-account` action kept so the route can change without touching the screen |
| G5 | Dock label `Opening` while `authSubmitting`, no upper bound; `handleSharedAccountAuthorization` ignores re-entry while set | Bounded label, then recoverable | `LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS`, `opening-slow`; scene must clear `authSubmitting` |
| G6 | Redirect chain: Mazer (`beginMazerOAuthAuthorization`) -> Supabase `/auth/v1/oauth/authorize` -> account host `/oauth/authorize` (shows "One moment." while it checks the request) -> `/login` (Fitness-shaped Welcome; sign-in) -> `/oauth/authorize` again -> (consent "Continue to Mazer?" skipped for the exact first-party Mazer request since FawxzzyWeb PR #118, merged 2026-11-11, not deployed until the FawxzzyWeb release is aliased) -> `https://mazer.fawxzzy.com/` callback | Fewer visible intermediate pages | FawxzzyWeb PR #118 merged; needs a real-device sign-in check after release (MAZER-ACCT-006) |
| G7 | No pre-boot splash in Mazer: nothing between page load and the Phaser auth gate except, in a non-localhost, non-standalone browser tab, the install gate (`src/boot/installGate.ts`, `shouldRunMazerInstallGateForBoot`), which renders install steps with a blank title and subtitle. Source-observed; this is the leading candidate for the owner's "weird pre login screen" but was not rendered here (UNKNOWN visually) | The auth surface is the first thing a signed-out visitor sees; install is never a prerequisite for sign-in | Out of this packet (`src/boot/*` owned elsewhere); decision needed |
| G8 | Fitness exempts public account/legal/auth-transport routes from its install gate (`fawxzzy-fitness/docs/PLAYBOOK_NOTES.md`, 2026-09-14 entry: `ProtectedAppInstallGate`, `protectedAppRoutePolicy`). Mazer's gate exempts only legal routes, a live OAuth callback, and password recovery | Same rule: gates protect app content, never account entry | Wiring/boot packet; not this one |
| G9 (added) | Legal links `Privacy` / `Terms`; `Reset password` sits above them as a footer link; loading gate always says `Signing you in…` (`MenuScene` ~L2703) even for a first-time visitor | `Privacy Policy` / `Terms of Service` in the legal row, `Create Account | Reset Password` in the rail; neutral `Loading…` unless a session or callback exists | wiring packet; `resolveLegacyAuthLoadingCopy` |

## Wiring plan for the later MenuScene packet

Owner: the wave that owns `MenuScene.ts` and the auth paths. The decision registry
(`docs/contracts/mazer-ui-rework-decision-registry.v1.json`) assigns this to Wave 5C
(`shared-account-oauth-integrator`); do not start until that wave hands off or authorizes the edit.

Call sites (line numbers at base `1670c8af`, approximate):

1. `buildAuthOverlay` (~L14033): replace `createOverlayTitle('Account', ...)` with the model title, keep the
   wordmark, and keep the existing rule that the back chevron is not created while `authGateLocked`
   (`handleBackAction` already refuses to close the locked gate).
2. `buildSharedAccountEntrySection` (~L14064-14102): remove the explainer `createAuthInfoText`, the footer links
   and the `createLegacyBottomActionBar(...)` pair. Build the model, then draw: banner in `layout.body`, the rail
   and legal rows from `layout.rail` / `layout.legal` (reuse `createAuthFooterLink`), and one dock from
   `layout.dock` (single `createButton`, `tone: 'primary'`). Route by `route`: `oauth-authorize` ->
   `handleSharedAccountAuthorization`, `account-host-reset` -> `navigateToSharedAccountRoute('reset-password')`,
   `legal-privacy` / `legal-terms` -> `navigateToMazerLegalPortal`.
3. Loading gate: `syncLegacyAuthGateLoadingScreen` (~L18090-18148) and the string at ~L2703
   (`add.text(0, 0, 'Signing you in…', ...)`). Replace the constant with `resolveLegacyAuthLoadingCopy(...)` via
   `authGateLoadingText.setText(...)`. Input mapping: `awaitingResolution = authGateAwaitingResolution`;
   `callbackInProgress` from the boot result (`readMazerOAuthBootResult`, only if a callback is mid-exchange; wiring
   must confirm which state exposes that); `hasSession` as described above.
4. Timeout: track the `authSubmitting` start time in the scene, pass `submittingElapsedMs`, and clear
   `authSubmitting` when the model enters `opening-slow`.
5. Colors: take from `cyberArcadeMaterial` per the mapping above; drop the raw hex values and the teal fill.

Tests that currently pin the old strings and must change in that packet (they are NOT edited here):

- `tests/reset/legacy-auth-gate.test.ts` (~L39-40): expects `text: this.authSubmitting ? 'Opening' : 'Sign in'` and
  `text: 'Create account'` inside `buildSharedAccountEntrySection`, plus `tone: 'secondary'`.
- `tests/scenes/menu-render-frame.test.ts` (~L1741-1742): same two source-string assertions.
- Capture scripts: `scripts/analysis/capture-ui-surfaces.mjs` (`AUTH_EXPECTED_LABELS` = `Sign in`,
  `Create account`, `Reset password`, ~L75-79; padded-label list ~L1663 includes `Create Account`). The packet brief
  also names `capture-auth-capability-surfaces.mjs`; no file by that name exists under `scripts/` at this base
  (UNKNOWN where it lives; possibly a different branch or a rename). Update expected labels to
  `Sign in`, `Create Account`, `Reset Password`, `Privacy Policy`, `Terms of Service`.
- `docs/current-truth.md` (~L54-64, ~L95-98) says Mazer "does not render a competing login or signup screen" and
  that sign-in and Create account "share one authorization entry"; update to describe the `Welcome` entry card
  once the restyle ships.
- Add scene-level assertions that the dock count is 1 and no subtitle is rendered, and a visual capture at 390x844
  and 1280x720 compared with the account-host screenshot.

This packet changes none of: `MenuScene.ts`, `legacyPlayerMessage.ts`, `legacyAuth.ts`, `legacyAccountPortal.ts`,
`src/boot/*`.

## What lives in the FawxzzyWeb repo (not changed here)

- Stale line in `docs/auth-surface-family.md` ("Current implementation status"): "Mazer remains pending until its
  owner repository adopts the broker contract from a reviewed exact head." The repo already contains the Mazer
  OAuth consent surface (`src/components/account/mazer-oauth-authorization.tsx`, `src/app/oauth/authorize`) and a
  Mazer presentation context in `src/config/account.ts`; the sentence should be reconciled with the observed
  `/login?app=mazer` screenshots.
- Sign-up deep link: `LoginPanel` keeps `intent` (`login` | `signup`) in React state only
  (`src/components/account/account-portal.tsx`, `switchIntent`); no URL parameter or `/signup` route selects it.
  Therefore a Mazer `Create Account` link that opens straight on sign-up is NOT possible today: UNKNOWN as
  "supported", confirmed as "not implemented". A candidate (not implemented, FawxzzyWeb change) is an allowlisted
  `intent=signup` query parameter on `/login`, which must survive the OAuth continuation to `/oauth/authorize`.
  Until then Create Account uses the OAuth hand-off, so the player taps Create Account once more on the host.
- Consent step "Continue to Mazer?" (owner decision 2026-11-11: skip it): FawxzzyWeb PR #118 (merged, main db5199e9)
  auto-approves the authorization without rendering the consent card, only for the exact Mazer client id, the
  exact Mazer redirect, scope email, the name Mazer and a matching session user; any other request still shows the
  consent card. Mazer already refuses callbacks that lack its own stored state and PKCE record. Not deployed until
  the FawxzzyWeb release is aliased; no real Supabase sign-in was checked; a real-device sign-in check is needed
  after release (card MAZER-ACCT-006).

## Open owner questions

1. Confirm the in-game restyle (keep screen, no redirect) over a redirect-first flow.
2. Is the browser/desktop "weird pre-login screen" the install gate (G7)? If so, should signed-out visitors skip it
   (Fitness precedent) or should the gate stay ahead of sign-in?
3. Add `intent=signup` to the account host's `/login`, or accept Create Account = same OAuth hand-off?
4. ~~Skip the consent card for first-party Mazer, or keep it?~~ Decided 2026-11-11: skip (FawxzzyWeb PR #118).
5. Dock height: 52 (this spec) or 56 (family doc)?
6. For `status: 'unavailable'` without an error message the model shows `MAZER_OAUTH_SAFE_ERROR_MESSAGE` and leaves
   the dock enabled so the player can retry; confirm that is preferred to a disabled dock.
7. Where should `hasSession` and `callbackInProgress` come from at the scene boundary (the Wave 5C owner decides).

## Verification

Source-level only: `npm run lint` (tsc), `tests/reset/legacy-auth-screen-view.test.ts`, `npx vitest run tests/reset`,
and `npm run test`. NOT RUN: any rendered Phaser capture, any live account-host request, any deploy. Screenshots
referenced above were viewed read-only and are not committed.
