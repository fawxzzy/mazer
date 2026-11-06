# Mazer Boot Continuity

Date: 2026-11-05
Lane: Mazer boot / loading continuity (Wave 5C paths: `index.html`, `src/boot/main.ts`, `src/boot/bootStatus.ts`)
Code: `index.html` (static splash), `src/boot/bootSplash.ts`, `src/boot/bootAccountBootstrap.ts`, `src/boot/bootStatus.ts`, `src/boot/main.ts`

## Reported symptoms

1. A blank page before anything appears.
2. "a weird pending loading screen that shows up after logging in".

## Causes (at base 1670c8af)

- `index.html` contained only `<div id="app"></div>`; nothing painted until `main.ts` executed, and `main.ts` then awaited, in order: the OAuth token exchange (bounded at `MAZER_OAUTH_TOKEN_TIMEOUT_MS`, 10 s), the install gate, and `bootstrapLegacyRemoteAccountStateForRoute` (remote progression/settings fetch plus completion-outbox replay, no deadline) before `new Phaser.Game`. Then `BootScene` loaded assets over a dark canvas (about 1.2 s).
- After a login the OAuth callback exchange plus the unbounded bootstrap ran against a blank page, then `MenuScene` showed "Signing you in..." until the auth snapshot settled.

## What changed

- Static splash in `index.html` (inside `#app`, dependency-free, inline CSS, fixed full-viewport, brand wordmark + calm pulse + `role="status"` text, honors `prefers-reduced-motion`). It paints before any script or the CSS bundle. It is `position: fixed` on purpose: `#app` has no height until `viewportGeometry` runs, so an absolutely positioned child of `#app` measured 0 px tall before JS (found in the browser check).
- Splash text is driven by boot stages (`resolveMazerBootSplashMessage`): "Signing you in..." only during the `oauth-exchange` stage (a callback exchange is actually running); "Loading..." for every other stage.
- New boot stages, in order: `boot-start`, `oauth-exchange` (only when a callback is being exchanged), `install-gate-checking`, `account-bootstrap`, `game-creating`, `game-created`, `menu-scene-create`, `splash-removed`. `MazerBootStatus.splashRemoved` records removal.
- Splash removal is explicit: `markMazerBootStatus('menu-scene-create')` (called from `MenuScene.create()`) chains `splash-removed`; the install gate calls `splash-removed` when it takes over; a boot `error` removes it so a failure is never hidden; a failsafe timer (`MAZER_BOOT_SPLASH_MAX_AFTER_GAME_CREATE_MS`, 10 s after `game-created`) removes it if `MenuScene` never reports in.
- `runBoundedAccountBootstrap` (`MAZER_ACCOUNT_BOOTSTRAP_TIMEOUT_MS = 4000`): the game starts on cached / guest account state when the remote bootstrap is slow (`timed-out`) or fails (`failed`, logged with `console.warn`). Behavior change: a rejecting bootstrap used to surface as the boot error screen; it now falls back and starts the game.
- The bootstrap is not cancelled on timeout; it keeps running and its late rejection is consumed (no unhandled rejection).

## Not changed / recorded

- `MenuScene`'s "Signing you in..." string (`MenuScene.ts` ~L2703, ~L18105) is untouched (a later packet owns it). First-time signed-out visitors still see it for about 150 ms after the canvas appears.
- Whether a bootstrap that finishes after the timeout is adopted by the already-running menu without a refresh is UNKNOWN: the existing "account changed" hydrate path in `MenuScene`/`legacyRemoteProgression` is the intended route and its merge logic protects local progress, but it was not exercised under a forced late bootstrap.
- Boot timing before/after was not measured: the dev server has no remote account provider configured, so the slow-bootstrap path cannot be reproduced locally, and the visual canary scripts need a built preview. The deterministic evidence is the timeout unit tests (fake timers) and the stage-order pins.
- Unbounded pieces that remain: `BootScene` asset preload (no deadline), `getLegacyAuthClient` inside the OAuth exchange (covered by the 10 s OAuth bound), service worker registration (non-blocking).

## Tests

`tests/reset/boot-status.test.ts` (stage order, splash message, removal on menu/gate/error, idempotence, `index.html` splash markup), `tests/reset/boot-account-bootstrap.test.ts` (default bound, completed, timed-out, late rejection, failed, `main.ts` stage ordering).
