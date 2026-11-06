# Mazer Install Gate Policy

Date: 2026-11-05
Lane: Mazer install gate (UI rework Wave 5C owns `installGate.ts`, `main.ts`, `index.html`, `base.css`)
Code: `src/boot/installPolicy.ts` (pure policy), `src/boot/installSurface.ts` (live runtime facts), `src/boot/installGate.ts` (overlay + copy), `src/boot/main.ts` (boot wiring)

## Policy

Mazer only runs from an installed surface (home-screen app or desktop app). Every other visit is blocked by the install gate, on every platform. There is no "Skip", no "Continue without installing", and no persisted "dismissed" bypass.

### What is NOT blocked

| Context | Why | Where decided |
| --- | --- | --- |
| Installed display context | The point of the policy | `detectInstalledDisplayContext` |
| `localhost` / `127.0.0.1` / `::1` (unless `?forceInstallGate=1`) | Local dev has no installable origin | `shouldRunMazerInstallGateForBoot` |
| Legal routes | They redirect to the shared account portal before the gate | `shouldRunMazerInstallGateForBoot` |
| OAuth callback request (accepted or not) | Must finish where it started and reach Mazer's retry/error UI (#367) | `shouldRunMazerInstallGateForBoot` |
| Password recovery | Redirects to the shared portal | `shouldRunMazerInstallGateForBoot` |

"Installed display context" = `display-mode: standalone` OR `minimal-ui` OR `window-controls-overlay` OR `navigator.standalone` OR `document.referrer` starts with `android-app://`.

Deliberate deviation from the first proposal: plain `display-mode: fullscreen` is NOT treated as installed. It also matches a normal browser tab in F11 / Fullscreen-API fullscreen, which would unlock the gate with one key press. Mazer's manifest asks for `standalone` (`display_override`: standalone, minimal-ui), so an installed Mazer never reports bare fullscreen. Known edge: an installed desktop window that the player puts into F11 fullscreen and then reloads will show the gate until it leaves fullscreen.

Known risk (unchanged, by design): any request that looks like an OAuth callback (`?code=`/`state=`) bypasses the gate in a browser tab. The callback is validated against the live pending attempt by `captureAndScrubMazerOAuthCallback` / `consumeMazerOAuthCallback`; the bypass is not widened here.

### Gate modes (`resolveInstallGateDecision`)

Precedence for a blocked visit: `installed-open-app` (appinstalled fired in this tab) > `in-app-browser` (iOS in-app browser; ignores a stray prompt) > `prompt-available` (a `beforeinstallprompt` was captured) > per-platform manual mode.

| Mode | When | Native action |
| --- | --- | --- |
| `prompt-available` | `beforeinstallprompt` captured | Install button |
| `manual-desktop-chromium` | Desktop Chrome/Edge/Brave, no prompt yet | none (address-bar icon / menu steps) |
| `manual-desktop-other` | Desktop Safari, Firefox, unknown | none ("open in Chrome or Edge", Safari: File > Add to Dock), Copy link |
| `manual-android` | Android, no prompt yet | none, Copy link |
| `manual-ios` | iOS/iPadOS Safari (and Chrome/Firefox on iOS) | none (Share > Add to Home Screen) |
| `in-app-browser` | iOS in-app browsers (Instagram, TikTok, FB, ...) | none, Copy link |
| `installed-open-app` | `appinstalled` fired in this tab | none ("Mazer is installed. Open it from your home screen or desktop.") |

### Event-driven upgrade

The gate used to be evaluated once at boot, before the asynchronous `beforeinstallprompt` arrived, so desktop Chrome/Edge visitors resolved to `hidden` and were never gated. Now:

- `initializeInstallSurface` runs as early as boot allows (before viewport/localhost service-worker work and before the OAuth exchange).
- The overlay subscribes to the install surface. A `beforeinstallprompt` that arrives after the card is on screen upgrades it in place to an Install button; `appinstalled` switches it to `installed-open-app`.
- A cancelled native prompt consumes that event only; the card falls back to manual steps and never unlocks the tab. Chromium may fire a fresh event later, which upgrades the card again.
- The overlay promise resolves only if the page itself becomes standalone.

### Dismissed flag

`mazer-install-surface-dismissed-v1` is no longer read or written (stale values from older builds are ignored; pinned by a test). `dismissInstallSurface()` is kept as a no-op wrapper so `MenuScene`'s QA bridge (`dismissInstall`) compiles unchanged; the bridge still returns `true` after calling it even though nothing is dismissed. That bridge expectation belongs to the later MenuScene packet.

### Legacy surface mode compatibility

`InstallSurfaceState.mode` keeps its four values for `MenuScene` (`hidden`, `ios-open-in-browser`, `available`, `manual`). `hidden` now means standalone, or `appinstalled` in this tab (`installed: true`, `standalone: false`). The gate does not key off `mode`; it keys off `standalone`, `installed`, `canPrompt` and `platform`.

## Platform matrix

VERIFIED-BY-TEST = pinned by unit tests in `tests/reset/install-policy.test.ts`, `install-surface.test.ts`, `install-gate.test.ts` (user-agent strings and fake runtimes, no real device). BROWSER-CHECKED = exercised in desktop Chromium (Playwright) on the dev server with `?forceInstallGate=1`, with a synthetic `beforeinstallprompt`. NOT VERIFIED = needs a real device / real browser.

| Cell | Resolver / classification | Rendered card | Real device / browser |
| --- | --- | --- | --- |
| Desktop Chrome / Edge, tab | VERIFIED-BY-TEST | BROWSER-CHECKED at 1280x720 (manual card, upgrade to Install, installed card, stale dismissed flag ignored) | NOT VERIFIED: real native prompt timing, post-accept behavior, the address-bar install icon wording |
| Desktop Firefox | VERIFIED-BY-TEST | not rendered separately (shares `manual-desktop-other` copy) | NOT VERIFIED |
| Desktop Safari | VERIFIED-BY-TEST | not rendered separately | NOT VERIFIED (File > Add to Dock wording assumes Safari 17+ on macOS 14+) |
| Android Chrome tab | VERIFIED-BY-TEST | BROWSER-CHECKED at 390x844 with an Android Chrome UA (desktop engine) | NOT VERIFIED on device |
| iOS Safari tab | VERIFIED-BY-TEST | BROWSER-CHECKED at 390x844 with an iOS Safari UA (desktop engine) | NOT VERIFIED on device |
| iOS in-app browser | VERIFIED-BY-TEST | BROWSER-CHECKED at 390x844 with an Instagram UA | NOT VERIFIED on device |
| Android in-app WebView | classified as `android` (manual-android + Copy link) | n/a | NOT VERIFIED that WebViews offer no install path |
| Standalone / minimal-ui / window-controls-overlay / iOS home screen / TWA referrer | VERIFIED-BY-TEST (fake `matchMedia`, `navigator.standalone`, referrer) | not applicable (gate does not render) | NOT VERIFIED on a real installed app: Playwright cannot emulate `display-mode` |
| Bare `display-mode: fullscreen` in a tab | VERIFIED-BY-TEST (stays gated) | n/a | NOT VERIFIED |
| localhost, `?forceInstallGate=1` | VERIFIED-BY-TEST | BROWSER-CHECKED (this is how the gate was exercised) | n/a |
| OAuth callback / legal / recovery bypass | VERIFIED-BY-TEST | n/a | NOT VERIFIED end to end against the live portal |

## Resolver truth table

Inputs not listed are false. `standalone` and `bypassRoute` win over everything; `localhost` wins unless `forceGate`.

| standalone | bypassRoute | localhost | forceGate | appInstalled | UA class | prompt | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| yes | any | any | any | any | any | any | open (standalone) |
| no | yes | any | any | any | any | any | open (bypass-route) |
| no | no | yes | no | any | any | any | open (localhost) |
| no | no | no / yes+force | - | yes | any | any | `installed-open-app` |
| no | no | no / yes+force | - | no | ios-in-app | any | `in-app-browser` |
| no | no | no / yes+force | - | no | any other | yes | `prompt-available` |
| no | no | no / yes+force | - | no | desktop-chromium | no | `manual-desktop-chromium` |
| no | no | no / yes+force | - | no | desktop-safari / firefox / other | no | `manual-desktop-other` |
| no | no | no / yes+force | - | no | android | no | `manual-android` |
| no | no | no / yes+force | - | no | ios | no | `manual-ios` |

The legacy dismissed flag is accepted as an input and changes nothing.

## Reference

Fitness uses the same model (`shouldBlockAppAccess = !isStandalone`, `getInstallContext.ts`, plus an exemption for public account routes). Mazer keeps its own bypass list above.

## Failure mode recorded

Rule: a gate that depends on an asynchronous browser event must be re-evaluated when the event arrives, or it must default to blocked. The old gate defaulted to "open" (`hidden`) and evaluated once, so the common desktop Chrome/Edge visit was never blocked.
