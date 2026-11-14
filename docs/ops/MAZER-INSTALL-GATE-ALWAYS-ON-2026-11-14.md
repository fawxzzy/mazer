# Install gate: always on (MAZER-PWA-007) and the sign-out / return fixes (MAZER-ACCT-042)

Date: 2026-11-14 (built 2026-11-13). Headless only; nothing here was checked on a real phone, tablet or desktop install.

Owner decision (verbatim): "yes we need to make sure there is an install gate for browser access at all times in all forms".

## Policy now

In a production build every non-installed visit shows the install gate, at all times and in all forms. The decision (`src/boot/installPolicy.ts`, `src/boot/installGate.ts`, `src/boot/main.ts`) reads only:

1. the host: `localhost`, `127.0.0.1`, `::1` are local development and skip the gate (`?forceInstallGate=1` brings it back there; on any other host that flag changes nothing, it can only make the gate stricter);
2. the legal and password-recovery routes, which never draw Mazer: boot redirects them to the account host before the gate (they are not "Mazer access");
3. a REAL installed display signal: `display-mode: standalone`, `minimal-ui` or `window-controls-overlay`, or iOS `navigator.standalone`.

Nothing a URL carries lifts the gate: `previewLevel`, `autoSignIn`, `authFixture`, `runtimeDiagnostics`, an OAuth callback (`?code=&state=`, `?error=`), a hash, a UA string. There is no build-time or runtime "skip the gate" switch (a test greps for one). The gate runs BEFORE the OAuth callback is exchanged, so a browser tab never ends up holding a Mazer session.

### What changed from the 2026-11-05 policy

| Was | Now | Why |
| --- | --- | --- |
| `?previewLevel=N` skipped the gate | gated in a tab | owner: any query parameter must not bypass |
| any OAuth callback request skipped the gate (and was exchanged in the tab) | gated in a tab, callback NOT exchanged | owner: callback return in a non-installed tab shows the gate |
| `document.referrer` starting with `android-app://` counted as installed | not a signal | other Android apps (the Google app, mail clients) set that referrer on ordinary Chrome tabs, so it unlocked the gate for a browser visit. A WebAPK / TWA reports `display-mode: standalone`, the real signal |
| Android in-app browsers (Instagram / Facebook WebView) got the Android Chrome card | `in-app-browser` card (copy the link, open in Chrome) | they cannot install; UA tokens `; wv)`, `Instagram`, `FB_IAB`, `FBAV`, ... |
| desktop Firefox / Safari / other card did not say why | subtitle: "Chrome, Edge and Safari on a Mac can install it." | clearer for browsers that cannot install |
| gate icon 48 px, left aligned | 72 px, centred, the one app image (`MAZER_BOOT_LOADER_ICON_DATA_URI`, derived from the FawxzzyWeb site image, MAZER-VIS-039) | clearer card |

### Decisions the owner may want to flip (one line each)

- `minimal-ui` still counts as installed. The owner's list read "browser, minimal-ui, fullscreen, plain fullscreen" as modes to gate; a browser TAB never reports `minimal-ui` (only an installed app window does, and the manifest's `display_override` is `standalone, minimal-ui`), so gating it would only lock out an installed app on a browser that lacks `standalone`. To gate it anyway delete its line from `INSTALLED_DISPLAY_MODE_QUERIES` in `installPolicy.ts` (and the manifest fallback, and the tests that pin it).
- Plain `display-mode: fullscreen` stays gated (unchanged: F11 in a tab matches it).
- The legal and password-recovery routes still redirect to the account host instead of showing the gate (the redirect leaves Mazer; the privacy/terms URLs must stay reachable).

## What a legitimate installed-app return looks like (kept working)

The Sign in hand-off leaves Mazer for `account.fawxzzy.com` and comes back to `https://mazer.fawxzzy.com/?code=...&state=...` (or `?error=...`). A legitimate return lands in the INSTALLED context, which reports a real display signal, so the gate resolves immediately and the callback is exchanged as before:

| Installed context | Signal the app reads | Return behaviour |
| --- | --- | --- |
| iPhone / iPad home-screen app | `navigator.standalone === true` | same webview, gate resolves, callback exchanged |
| Android WebAPK / TWA | `display-mode: standalone` | same, assuming the browser hands the redirect back to the app window (not verified on a device) |
| Desktop installed PWA window | `display-mode: standalone` (or `window-controls-overlay`) | same |

A return that lands in a non-installed tab (a plain Chrome / Safari tab, an in-app browser, a Custom Tab that did not hand back to the app) shows the install gate and the code is NOT exchanged. The player opens the installed app and signs in again.

Emulated headlessly (matrix rows `standalone-oauth-return`, `standalone-ios-oauth-return`): the installed app boots on `?error=access_denied` and `?code=...&state=...` and does not show the gate, also after the service-worker claim reload.

## The standard QA recipe: emulate an installed app

QA, CI and Playwright scripts that open a production-like build off localhost emulate the installed app with the same real signals the app reads, set before any page script runs:

```js
import { emulateInstalledApp } from './scripts/analysis/lib/installed-app-emulation.mjs';
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await emulateInstalledApp(context);          // (display-mode: standalone) = true and navigator.standalone = true
const page = await context.newPage();
await page.goto('https://mazer.fawxzzy.com/?runtimeDiagnostics=1&previewLevel=1');
```

Without the helper, the two overrides, both in `context.addInitScript`, are: `window.matchMedia` returning `{ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true, onchange: null }` for `'(display-mode: standalone)'` (native for every other query), and `Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true })`.

Local dev servers (`npm run dev`, `vite preview` on 127.0.0.1) need nothing: the gate does not run on localhost. To see the gate there, add `?forceInstallGate=1`.

### How QA signs in now (the coordinator's sign-in harness)

Unchanged apart from the first step: fresh context, `emulateInstalledApp(context)`, load `https://mazer.fawxzzy.com/` (no query needed; the signed-out installed launch goes straight to the host, MAZER-ACCT-040), wait for the URL to match `account.fawxzzy.com/login`, fill identifier and password (never printed), submit, wait for `https://mazer.fawxzzy.com/` and read `scene.authSnapshot.status`. Skipping the emulation now stops on the install gate. To see the Mazer fallback screen instead of the redirect: `/?autoSignIn=0` (still works; it only affects the redirect, never the gate).

Scripts updated: `live-play-qa.mjs` and `live-auth-persistence-soak.mjs` emulate the installed app on any non-localhost target; `verify-offline-shell.mjs`, `capture-ui-surfaces.mjs` and `measure-splash-tail.mjs` already did (their own override copies). Other `scripts/analysis/*.mjs` run on localhost and are unaffected.

## The gate matrix (verify-offline-shell, check `install-gate-matches-documented-policy`)

29 contexts, observed on the real production build served off-localhost (`mazer-proof.localhost`). Pinned against the policy in `tests/analysis/offline-shell-proof.test.mjs` and `tests/reset/install-gate-always-on.test.ts` (URL x UA x display enumeration).

| Context | Display mode | Gate on first boot | Gate mode | Game boots | Service worker registered | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Browser tab on localhost / 127.0.0.1 | browser | not shown | - | yes | no |  |
| Browser tab on 127.0.0.1, ?previewLevel=1 (dev) | browser | not shown | - | yes | no |  |
| Browser tab on 127.0.0.1 with ?forceInstallGate=1 | browser | shown | manual-desktop-chromium | no | no |  |
| Browser tab, desktop Chrome / Edge | browser | shown | manual-desktop-chromium | no | no |  |
| Browser tab, desktop Firefox | browser | shown | manual-desktop-other | no | no |  |
| Browser tab, desktop Safari | browser | shown | manual-desktop-other | no | no |  |
| Browser tab, Android Chrome | browser | shown | manual-android | no | no |  |
| Browser tab, Android tablet Chrome | browser | shown | manual-android | no | no |  |
| In-app browser on Android (Instagram WebView) | browser | shown | in-app-browser | no | no |  |
| Browser tab, iPhone Safari | browser | shown | manual-ios | no | no |  |
| Browser tab, iPad Safari | browser | shown | manual-ios | no | no |  |
| In-app browser on iPhone (Instagram) | browser | shown | in-app-browser | no | no |  |
| Browser tab that fires beforeinstallprompt | browser | shown | prompt-available | no | no |  |
| Browser tab after an appinstalled event | browser | shown | installed-open-app | no | no |  |
| Browser tab in plain display-mode: fullscreen (F11) | fullscreen | shown | manual-desktop-chromium | no | no |  |
| Android Chrome tab opened by another app (android-app:// referrer, display browser) | android-referrer | shown | manual-android | no | no |  |
| Browser tab, ?previewLevel=1 (QA sandbox route) | browser | shown | manual-desktop-chromium | no | no |  |
| Browser tab, ?runtimeDiagnostics=1&authFixture=authenticated | browser | shown | manual-desktop-chromium | no | no |  |
| Browser tab, ?autoSignIn=0 | browser | shown | manual-android | no | no |  |
| Browser tab, OAuth callback request (?error=access_denied) | browser | shown | manual-desktop-chromium | no | no |  |
| Browser tab, OAuth callback request (?code=...&state=...) | browser | shown | manual-ios | no | no |  |
| Browser tab, hash parameters (#previewLevel=1&code=x&state=y) | browser | shown | manual-desktop-chromium | no | no |  |
| Installed app, display-mode: standalone | standalone | not shown | - | yes | yes |  |
| Installed app, display-mode: minimal-ui | minimal-ui | not shown | - | yes | yes |  |
| Installed desktop app, display-mode: window-controls-overlay | window-controls-overlay | not shown | - | yes | yes |  |
| iPhone home-screen app (navigator.standalone) | navigator-standalone | not shown | - | yes | yes |  |
| Android WebAPK / TWA (display-mode: standalone, Android UA) | standalone | not shown | - | yes | yes |  |
| Installed app, OAuth callback return (?error=access_denied) | standalone | not shown | - | yes | yes |  |
| iPhone home-screen app, OAuth callback return (?code=...&state=...) | navigator-standalone | not shown | - | yes | yes |  |

`verify-offline-shell` result on this branch: 21 of 21 checks pass (the 19 existing ones, plus `gate-never-boots-behind-the-gate` and `installed-rows-never-show-the-gate-after-reload`).

## MAZER-ACCT-042

### 1. The "One moment. / Pending" screen is the account host's, not Mazer's

Owner: "im still seeing a one moment, still pending screen when signing in just before i see the loading screen."

Search of Mazer `src`, `tests`, `docs`, `index.html`: no player-visible "One moment" and no "pending" sign-in text (the only "still pending" string is the technical password-update message). The screen is the account host's OAuth authorize page: `FawxzzyWeb/src/components/account/mazer-oauth-authorization.tsx`, `state.kind === "loading"` renders `<SystemState title="One moment." description="Checking this Mazer sign-in request…" variant="pending" />` (eyebrow "Pending", `aria-busy`). It is the page between the host login and the redirect back to Mazer (`/oauth/authorize` runs `start()`, reads the pending request, auto-approves the first-party request and navigates to Mazer). It cannot be removed from the Mazer repo.

Suggested host change (a FawxzzyWeb PR, not made here): for `state.kind === "loading"` render nothing visible (a bare dark page with the Mazer splash background `#02080f`, no text, `aria-busy` only) instead of the `SystemState` card, so the sequence is host login -> dark page -> Mazer splash/loader. Keep the invalid and unavailable states as they are (the existing failure lines).

### 2. The Mazer half is pinned

`tests/reset/oauth-return-no-intermediate-screen.test.ts` (8 tests) pins: no "One moment" anywhere in Mazer source or `index.html`; "still pending" only in the password-update technical message; the player-message inventory (test pins and doc) and the Guide hold no such row; every boot stage shows only the loader label (`Loading…`, or `Signing you in…` during a real callback exchange); the scene never draws the callback-pending Welcome variant (`hasCallbackInProgress` is always false); the callback is exchanged behind the HTML splash before Phaser exists.

### 3. Frame capture of the return (headless, local dev server, installed emulation, 390x844 @ DPR 2, CDP screencast plus a per-frame state sampler)

- Installed launch with a signed-in fixture session: splash opacity 1.00 until the menu exists, then a short fade to the menu; the auth overlay is `none` and the auth gate is not awaiting throughout. The Welcome fallback never appears.
- Callback URL load (`?code=...&state=...` with no pending record, so the exchange fails the real way): the first frames are the dark splash background, the loader icon fades in, the splash fades out over the scene, and the scene shows Welcome with the single held failure line and the `Sign in` button. No other Mazer text screen appears in between.
- Not captured: a real successful token exchange from the live host. The host returns to `https://mazer.fawxzzy.com/`, which is the production build, not this branch, and signing in as the QA account needs the DPAPI password, which this lane did not read. The coordinator's sign-in harness (recipe above) can run it against a deployed build; what to record is the same per-frame sampler: splash present until the first auth snapshot, no frame with the auth overlay up while the gate is still awaiting.
- Observation, not changed: the failure Welcome screen shows the failure sentence twice (a boxed banner and a small red line below). This change does not touch that code; worth a follow-up card.

## Sign-out ends the host session (Mazer side, MAZER-ACCT-042 part 3)

Owner: "mazer sign out ends session? idk u choose"; chosen: yes.

After an explicit Sign out has finished locally, Mazer navigates once to `https://account.fawxzzy.com/signout?returnTo=https%3A%2F%2Fmazer.fawxzzy.com%2F`; the host ends its session and redirects back; Mazer boots signed out with the explicit-sign-out flag set (MAZER-ACCT-040), so it lands on the Mazer fallback with the Sign in button. Code: `src/legacy-runtime/legacyHostSignOut.ts`, called from `MenuScene.handleLegacyAuthSignOut` (thin edit); the guard is cleared in `src/boot/signedOutHandoffBoot.ts` when a launch sees a session. Tests: `tests/reset/legacy-host-sign-out.test.ts` (mocked navigation, probe and storage).

- Only a real local sign-out qualifies: the explicit-sign-out flag must be recorded (a failed Sign out and the QA fixture never write it), the snapshot must not be authenticated, and localhost never leaves for production.
- Loop guard: one navigation per 15 minutes (`mazer.auth.host-signout-attempt.v1`, sessionStorage, written before leaving, cleared when a launch sees a session so sign in, Sign out, sign in, Sign out works). Blocked storage means no navigation.
- Feature check: `MAZER_HOST_SIGN_OUT_ENABLED` (kill switch) plus a 3 s reachability probe (credential-less `no-cors` HEAD). Measured in headless Chromium: a reachable host answers `opaque` whatever the status (a followed 302, a 404 and a 500 look identical to a cross-origin page), an unreachable host rejects, and `redirect: 'manual'` with `no-cors` is rejected by the browser itself. So an UNREACHABLE host falls back to the old behaviour (local sign-out only, nothing stuck), but a 404 CANNOT be detected from Mazer. Consequence: **deploy this only after the FawxzzyWeb `/signout` endpoint is live**; if it is ever missing, the player lands on the host's own not-found page (recoverable, not pretty) until `MAZER_HOST_SIGN_OUT_ENABLED` is set to false. A CORS-enabled capability ping on the host would let Mazer detect the 404 case; not requested.
- While the probe and navigation run, the Sign out screen stays busy (`authSubmitting`), released after 10 s if the page has not left.

## Not verified

Any real device (iPhone home-screen app, Android WebAPK / Chrome Custom Tab return, tablets, in-app browsers beyond a UA string); a really installed PWA (emulated via `matchMedia` / `navigator.standalone`); WebKit; the live host redirect chain and the `/signout` endpoint (does not exist yet); a successful real OAuth return frame by frame; whether the host's sign-out round trip returns into the installed app window on Android.

## Doc note for `docs/current-truth.md`

The install gate is always on in a browser tab off localhost: no query parameter, hash, OAuth callback or user agent lifts it, a callback that lands in a non-installed tab is not exchanged, Android in-app browsers get the in-app card, and QA drives production-like builds by emulating an installed app (`scripts/analysis/lib/installed-app-emulation.mjs`). Mazer Sign out now also navigates once to the account host's `/signout` (after local sign-out, behind a kill switch and a 15 minute loop guard); deploy it only after the FawxzzyWeb endpoint is live. The "One moment / Pending" screen seen between host sign-in and Mazer belongs to the account host.
