# Mazer player-message inventory (2026-11-05)

Board cards: `mazer-unified-player-message-system` (open, 78%) and the rank-vocabulary residual of
`mazer-player-rank-only-progression-display` (completed).

Status: READ-ONLY audit plus guard tests. No runtime behavior was changed.
Audited base: `origin/main` `1670c8af`. Line numbers below are as of that base and are for
orientation only; the guard tests key on string literals and call shapes, never on line numbers.

Guards that pin this document:

- `tests/reset/legacy-player-message-inventory.test.ts` pins the literal inventory in section 4 and the
  structural facts in section 2.
- `tests/reset/legacy-rank-vocabulary-guard.test.ts` pins the vocabulary trace in section 7.

## 1. Ownership (who may act on this)

The registry (`docs/contracts/mazer-ui-rework-decision-registry.v1.json`, `integratorWaveOwnership`)
gives exclusive active ownership of the paths this audit touches to other waves. Nothing in this packet
edits them.

| Path | Active owner | Consequence for this work |
| --- | --- | --- |
| `src/legacy-runtime/legacyPlayerMessage.ts` | Wave 3B `auth-migration-integrator` | Copy-table and resolver changes in section 8 belong to 3B. |
| `src/scenes/MenuScene.ts` | Wave 5C `shared-account-oauth-integrator` (3A completed) | Render-site changes belong to 5C. |
| `src/legacy-runtime/legacyAuth.ts`, `src/boot/bootStatus.ts` | Wave 5C | Snapshot sanitising and boot-status changes belong to 5C. |
| `src/legacy-runtime/legacyProgression.ts` | another lane (not in the registry) | Label rewording is that lane's call; the guard does not pin the wording. |
| `src/ui/dom/*` (presentation of a message surface) | Wave 3C (DOM), per `docs/ui/UI-MIGRATION-PLAN.md` | "Auth behavior and messages" is 3B; "auth form visuals" is 3C. |

## 2. Findings (facts, verified in source)

F1. **The message queue is drawn as a toast (MAZER-UI-018; was: no render surface).** `MenuScene` builds `playerMessageQueue` and exposes it as
`visibleMessages` in the visual diagnostics payload (type at `MenuScene.ts:758`, filled at `:18805`).
Nothing draws it. `resolveLegacyPlayerMessageColor` and `LEGACY_PLAYER_MESSAGE_COLORS` have no consumer
outside `legacyPlayerMessage.ts`. "Routes through `legacyPlayerMessage.ts`" therefore currently means
"resolves to a typed message that diagnostics can see", not "is shown to the player".

F2. **Auth feedback is drawn from the raw snapshot, not from the resolved message.**
`buildSharedAccountEntrySection` feeds `errorMessage: this.authSnapshot.error,` into the auth-screen view-model and draws
`this.authSnapshot.info?.trim()` as an info line, straight into `createAuthInfoText` (wired 2026-11-05). The resolved
`resolveLegacyAuthFeedbackMessage` result only feeds `latestAuthMessage` (diagnostics). So the
sanitising switch in `resolveLegacyAuthFeedbackMessage` does not protect this render path.
Snapshot `error` can hold provider text on four reachable-in-principle paths
(`legacyAuth.ts` `error?.message` at `:848`, `:902`, `:935`, `:1126`) and the literal
`'Request timed out.'` (`MenuScene.ts:16054`). Those writers run behind the legacy password form
(`handleLegacyAuthSubmit`, entered only with an active auth field via Enter at `MenuScene.ts:6212`
and `:15661`); whether that form is still reachable in the shared-account entry UI is **UNKNOWN**
(the entry section renders no input fields). The shared-account path itself only ever writes
`MAZER_OAUTH_SAFE_ERROR_MESSAGE`.

F3. **Remote sync is deliberately silent.** `publishLegacyRemoteSyncResult` stores the result and only
republishes diagnostics (`MenuScene.ts:18037`, comment: "Sync is deliberately silent for players").
`LEGACY_REMOTE_MESSAGE_COPY` copy is built (`resolveLegacyRemoteSyncMessage`) but never shown. This is a
recorded decision, not a gap; any change is a product decision (section 8, P7).

F4. **Username failures are silent.** `readLegacyAccountUsername`, `checkLegacyUsernameAvailable`, and
`saveLegacyAccountUsername` return `error` strings (`legacyAuth.ts:1400`, `:1421`, `:1449`); the callers
only set `uiDirty` (`MenuScene.ts:14236`, `:14318`, `:14335`, `:15844`). The one visible failure is the
hydration gate text `'Username unavailable. Try again.'`. Save and availability failures give the player
no feedback. `saveLegacyAccountUsername` also contains a duplicate of
`LEGACY_AUTH_MESSAGE_COPY.usernameTaken` (`legacyAuth.ts:1447`) that is never rendered.

F5. **Dormant message code (no runtime consumer in `src/`).** `resolveLegacyOverlayToggleMessage`,
`resolveLegacyOverlayMovementSpeedMessage`, `resolveLegacyOverlayFieldCommitMessage`,
`LEGACY_OVERLAY_MESSAGE_COPY`, `resolveLegacyAuthBottomFeedbackLabel` (tests only), and the DOM
`createStatusBanner` primitive (`src/ui/dom/StatusBanner.ts`, exported, tested, never mounted). The
`source: 'overlay'` and `source: 'diagnostics'` members of `LegacyPlayerMessageSource` have no live
producer except `'overlay'` for `Progression reset.`.

F6. **Parallel mappers.** `legacyLeaderboard.ts` carries its own friendly-error mapper (three strings) and
`MenuScene.ts:13882` repeats one as a fallback. `legacyAuthPresentation.ts` carries three password-recovery
helper strings (`:98`, `:100`, `:102`) rendered raw via `presentation.helper` (`MenuScene.ts:14138`).
Neither goes through the message module.

F7. **Boot errors never reach the player.** `bootStatus.ts` attaches a typed `playerMessage`
(`resolveLegacyBootMessage`) to `window.__MAZER_BOOT_STATUS__`; `main.ts` then rethrows. No code renders it.
Service-worker failures are the same.

F8. **Inline copy outside the table.** Three auth sentences live inside `resolveLegacyAuthFeedbackMessage`
instead of `LEGACY_AUTH_MESSAGE_COPY` (invalid credentials, email not confirmed, rate limit), and one
routed message carries its copy inline at the call site (`'Progression reset.'`, `MenuScene.ts:17346`).

F9. **Divergence for one event.** Submit timeout writes `'Request timed out.'` to the snapshot (rendered raw,
F2) while the queued message for the same event resolves to
`LEGACY_AUTH_MESSAGE_COPY.accountUnavailable`. The two surfaces disagree.

## 3. Routed sources (go through `legacyPlayerMessage.ts`)

All are typed `LegacyPlayerMessage` (`copy`, `durationMs` default 2400 ms, `id`, `source`, `tone`,
`technicalDetail`); queue max 3 visible; expiry via `expireLegacyPlayerMessageQueue`.

| Resolver / site | id | source | tone | Producer (file) | Shown to player? |
| --- | --- | --- | --- | --- | --- |
| `resolveLegacyAuthValidationMessage` | `auth.validation.ready` / `.blocked` | auth | success / warning | MenuScene `resolveLegacyCurrentAuthMessage` | diagnostics only (F1) |
| `resolveLegacyAuthFeedbackMessage` (error) | `auth.feedback.error` | auth | error | MenuScene `armLegacyAuthFeedbackMessage`, presentation | diagnostics only; render uses raw snapshot (F2) |
| `resolveLegacyAuthFeedbackMessage` (info) | `auth.feedback.info` | auth | success | same | diagnostics only |
| `resolveLegacyPasswordRecoveryError` | none (returns copy) | n/a | n/a | MenuScene password recovery | **Yes**: copy is stored in `passwordRecoveryFeedback` and drawn at `MenuScene.ts:14138` |
| `resolveLegacyBootMessage` | `boot.error` / `boot.service-worker-error` | boot | error / warning | `bootStatus.ts` | no (F7) |
| `resolveLegacyRemoteSyncMessage` | `remote.<ctx>.failed` / `.guest` / `.missing-client` | progression | warning / info / warning | `legacyRemoteProgression.ts` | no (F3) |
| `publishLegacyRemoteSyncException` inline | `remote.<ctx>.exception` | progression | warning | MenuScene | no (F3) |
| `createLegacyPlayerMessage` inline | `progression.player.reset` | progression | success | MenuScene `resetLegacyPlayerProgression` | diagnostics only |
| `resolveLegacyOverlay*Message` (3 resolvers) | `overlay.*` | overlay | success / info | none | dormant (F5) |

Copy tables in `legacyPlayerMessage.ts`: `LEGACY_AUTH_MESSAGE_COPY` (25 strings),
`LEGACY_BOOT_MESSAGE_COPY` (2), `LEGACY_REMOTE_MESSAGE_COPY` (5), `LEGACY_OVERLAY_MESSAGE_COPY` (3) = 35
routed strings, plus 3 inline in the resolver and 1 inline at a call site (F8) = 39 routed strings.
Guard: every table value must be a sentence with no provider or internal wording.

## 4. Pinned literal inventory (player-facing strings outside the message module)

Columns: "Via module" is whether the string flows through `legacyPlayerMessage.ts`. "Tone / source" is the
tone and source it would carry under the module (implied for raw strings). Kinds are defined in the test.

| file:line | String (or key) | Via module | Tone / source | Kind | Recommended routing |
| --- | --- | --- | --- | --- | --- |
| `src/scenes/MenuScene.ts:2703` | `Signing you in…` | no | info / auth | raw-status | Copy key in auth table; render on the message surface |
| `src/scenes/MenuScene.ts:14171` | `{account}\nManage your profile and account from the shared Fawxzzy account portal.` | no | n/a (helper) | raw-static | Keep as screen helper |
| `src/scenes/MenuScene.ts:16054` | `Request timed out.` | no (diverges, F9) | error / auth | raw-status | Auth table key `requestTimedOut`; render the resolved message |
| `src/scenes/MenuScene.ts:17346` | `Progression reset.` | yes (inline copy) | success / progression | routed-inline | Move copy into a progression copy table; add a render surface |
| `src/legacy-runtime/legacyOfflineCompletionFlush.ts` | `You are offline. Progress is saved on this device and will sync when you reconnect.` | yes (own table) | info / system | routed-inline | Drawn by the toast (MAZER-UI-018) |
| `src/legacy-runtime/legacyOfflineCompletionFlush.ts` | `Back online. Saved progress synced.` | yes (own table) | success / system | routed-inline | Drawn by the toast (MAZER-UI-018) |
| `src/scenes/MenuScene.ts:17547` | `Runtime diagnostics authenticated fixture.` | no | n/a | fixture | None (QA fixture) |
| `src/boot/accessibilitySurface.ts:100` | `Use Arrow keys or WASD to move through the maze. Press Enter to start, O for settings, P to pause or resume, and Escape to close a dialog.` | no | n/a | static | None (a11y description) |
| `src/boot/accessibilitySurface.ts:109` | `Mazer is ready.` | no | info | static | Live region never updated; candidate sink for the message surface announcements |
| `src/legacy-runtime/legacyAccountPortal.ts:23` | `Account connection unavailable. Return to Mazer and try again.` | no | error / auth | raw-status | Auth table key `accountConnectionUnavailable`; it is drawn directly at `MenuScene.ts:17128` and via F2 |
| `src/legacy-runtime/legacyAuth.ts:763` | `Account connected.` | no | success / auth | raw-status | Auth table key `accountConnected`; no render site today (info on the snapshot) |
| `src/legacy-runtime/legacyAuth.ts:1024` | `A previous password update is still pending. Please wait before trying a different password.` | mapped | n/a | technical | Stays internal; mapped by `resolveLegacyPasswordRecoveryError` |
| `src/legacy-runtime/legacyAuth.ts:1033` | `Failed to update password. Please try again.` | mapped | n/a | technical | Stays internal; mapped |
| `src/legacy-runtime/legacyAuth.ts:1053` | `Password update timed out.` | mapped | n/a | technical | Stays internal; mapped |
| `src/legacy-runtime/legacyAuth.ts:1447` | `That username is already taken.` | no (duplicate) | error / auth | duplicate-unrendered | Use `LEGACY_AUTH_MESSAGE_COPY.usernameTaken` and render it (F4) |
| `src/legacy-runtime/legacyAuthPresentation.ts:98` | `Checking your reset link…` | no | info / auth | raw-status | Message surface or keep as presentation helper after 3B decides |
| `src/legacy-runtime/legacyAuthPresentation.ts:100` | `Choose a new password.` | no | info / auth | raw-status | same |
| `src/legacy-runtime/legacyAuthPresentation.ts:102` | `Updating your password…` | no | info / auth | raw-status | same |
| `src/legacy-runtime/legacyLeaderboard.ts:49` | `The leaderboard is not available right now.` | no | error / system | parallel-mapper | Fold into the message module |
| `src/legacy-runtime/legacyLeaderboard.ts:68` | `Could not reach the leaderboard. Check your connection and try again.` | no | error / system | parallel-mapper | Fold into the message module |
| `src/legacy-runtime/legacyLeaderboard.ts:71` | `The leaderboard is not set up yet.` | no | warning / system | parallel-mapper | Fold into the message module |
| `src/legacy-runtime/legacyOAuthRefresh.ts:45` | `Account session refresh unavailable.` | no | n/a | technical | Synthetic HTTP body for the auth client; never rendered |
| `src/ui/dom/MazerSwitch.ts:45` | `On` / `Off` | no | n/a | static | Primitive state label |
| `src/ui/dom/StatusBanner.ts:16` | `Info` | no | n/a | static | Primitive tone label (component dormant, F5) |
| `src/ui/dom/StatusBanner.ts:19` | `Error` | no | n/a | static | Primitive tone label |

`On` and `Off` share one row (the two branches of one ternary), so the table has 39 rows for 40 pinned literals.

### 4a. Non-literal raw render sites

These show text that is not a literal, so the literal scan cannot see them. They are pinned structurally
(F2) or listed here for the routing work.

| Site | What it draws | Risk |
| --- | --- | --- |
| `MenuScene.ts` `errorMessage: this.authSnapshot.error,` + `this.authSnapshot.info?.trim()` (Welcome screen) | Raw snapshot text (F2) | Provider text or ad-hoc strings can reach the screen |
| `MenuScene.ts` `leaderboardErrorMessage` (view-state input) | Friendly string from `legacyLeaderboard.ts` (F6) | Parallel mapper, not the message module |
| `MenuScene.ts:14138` `passwordRecoveryFeedback ?? presentation.helper` | Routed recovery copy plus raw presentation helpers | Mixed |
| `MenuScene.ts:17128` `add.text(..., MAZER_OAUTH_SAFE_ERROR_MESSAGE)` | Safe OAuth failure drawn directly on the menu | Bypasses the queue and tone colour |
| `MenuScene.ts:14169` `accountLabel` | Display name or email | Identity text, not a message |

### 4c. Literals added by merged lanes (integration 1)

The lane branches that added `legacyAuthScreenView.ts`, `legacyLeaderboardView.ts` and `legacyMazeFeatureRegistry.ts` landed after the audit base, so their literals were not in the original pin. They are pinned here. The two view modules are pure view-models rendered by MenuScene since the 2026-11-05 Welcome/leaderboard wiring whose copy duplicates strings already inventoried above; the registry descriptions are developer-facing.

| file | String | Kind | Recommended routing |
| --- | --- | --- | --- |
| `src/legacy-runtime/legacyAuthScreenView.ts` | `Still opening. Continue in your browser or try again.` | duplicate-unrendered | auth-screen view-model copy table (rendered by the MenuScene Welcome screen); route through the message module when the render surface lands |
| `src/legacy-runtime/legacyAuthScreenView.ts` | `Opening…` | raw-status | dock label while the OAuth redirect is in flight; bounded to `LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS` (10 s), then `Sign in` + browser notice |
| `src/legacy-runtime/legacyAuthScreenView.ts` | `Loading…` | duplicate-unrendered | auth-screen view-model copy table (rendered by the MenuScene Welcome screen); route through the message module when the render surface lands |
| `src/legacy-runtime/legacyAuthScreenView.ts` | `Signing you in…` | duplicate-unrendered | auth-screen view-model copy table (rendered by the MenuScene Welcome screen); route through the message module when the render surface lands |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `Could not reach the leaderboard. Check your connection and try again.` | technical | source error string matched (never shown) so the leaderboard view-model can choose its designed state; the designed copy replaces it (2026-11-06 leaderboard redesign) |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `The leaderboard is not set up yet.` | technical | source error string matched (never shown) so the leaderboard view-model can choose its designed state; the designed copy replaces it (2026-11-06 leaderboard redesign) |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `Clear a maze to put your name on the board.` | raw-static | Leaderboard empty state body; rendered by the MenuScene leaderboard sheet (2026-11-06 redesign); fold into the message module later |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `Something went wrong on our side. Try again in a moment.` | raw-static | Leaderboard failure state body (generic); rendered by the MenuScene leaderboard sheet (2026-11-06 redesign); fold into the message module later |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `Loading the leaderboard…` | raw-static | Leaderboard loading status line; rendered by the MenuScene leaderboard sheet (2026-11-06 redesign); fold into the message module later |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `Players appear on the leaderboard by username.` | raw-static | Leaderboard username-gate body; rendered by the MenuScene leaderboard sheet (2026-11-06 redesign); fold into the message module later |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `It isn’t available yet. Check back soon.` | raw-static | Leaderboard not-set-up state body; rendered by the MenuScene leaderboard sheet (2026-11-06 redesign); fold into the message module later |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `Reconnect to see the leaderboard. Your progress is saved on this device.` | raw-static | Leaderboard offline state body; rendered by the MenuScene leaderboard sheet (2026-11-06 redesign); fold into the message module later |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `Loading your profile…` | raw-static | Leaderboard username-gate loading status line; rendered by the MenuScene leaderboard sheet (2026-11-06 redesign); fold into the message module later |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `Check your connection and try again.` | raw-static | Leaderboard unreachable / profile-unavailable state body; rendered by the MenuScene leaderboard sheet (2026-11-06 redesign); fold into the message module later |
| `src/legacy-runtime/legacyLeaderboardView.ts` | `Sign in to see where you stand among other players.` | raw-static | Leaderboard signed-out state body; rendered by the MenuScene leaderboard sheet (2026-11-06 redesign); fold into the message module later |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Checkpoint-chasing corridor carve that forms the base maze; every generated maze has it.` | technical | developer-facing feature registry description; never rendered to players |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Two or more checkpoint legs, so the route bends between waypoints instead of one straight leg.` | technical | developer-facing feature registry description; never rendered to players |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Heading-continuation bias that lengthens straight runs and reduces zig-zag.` | technical | developer-facing feature registry description; never rendered to players |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Disconnected-component pruning and goal rebasing so the playable graph is one connected component.` | technical | developer-facing feature registry description; never rendered to players |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Wall-bridge shortcuts that add loops and alternate routes.` | technical | developer-facing feature registry description; never rendered to players |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Left/right border openings paired across the board so the player can wrap horizontally.` | technical | developer-facing feature registry description; never rendered to players |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Top/bottom border openings paired across the board so the player can wrap vertically.` | technical | developer-facing feature registry description; never rendered to players |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Horizontal wrap pairing forced by a single-feeder, vertical-only wrap profile.` | technical | developer-facing feature registry description; never rendered to players |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Perimeter feeder spokes: single-tile border openings carved inward from each side.` | technical | developer-facing feature registry description; never rendered to players |
| `src/legacy-runtime/legacyMazeFeatureRegistry.ts` | `Opposite-border pairing pass that mirrors existing border openings onto the far side.` | technical | developer-facing feature registry description; never rendered to players |

### 4d. Boot splash and install gate literals (PR #372, pinned in integration 3)

PR #372 (deterministic install gate, boot splash and bounded account bootstrap) landed after the audit base and the pin was never updated: three old `installGate.ts` rows were stale and 23 new source sites were unclassified. All are player-facing and active. The install gate is a pre-game surface (DOM overlay, no skip action, see `installPolicy.ts`); the splash is the static boot markup that `bootStatus` updates. `installSurface.ts` and `installPolicy.ts` contribute no scanned literals. The first two rows are status text that bypasses the message module; the rest are static gate copy (instructions), not status events. `Open Mazer from your home screen.` appears at two source sites and is one pin.

| file | String | Kind | Surface / routing |
| --- | --- | --- | --- |
| `src/boot/bootSplash.ts` | `Loading…` | raw-status | boot splash neutral message (static markup in index.html, then updated by bootStatus); active pre-game surface; not routed through the message module |
| `src/boot/bootSplash.ts` | `Signing you in…` | raw-status | boot splash message shown only while an OAuth callback exchange is in progress; active pre-game surface; mirrors LEGACY_AUTH_MESSAGE_COPY wording |
| `src/boot/installGate.ts` | `Mazer only runs as an installed app, not in a browser tab.` | static | install gate subtitle (prompt-available and manual platform cards); active; gate copy, not a status event |
| `src/boot/installGate.ts` | `Press Install below.` | static | install gate step, prompt-available mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Confirm in your browser.` | static | install gate step, prompt-available mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Open Mazer from your home screen or desktop.` | static | install gate step, prompt-available mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Click the install icon at the end of the address bar, or open the browser menu and choose Install Mazer.` | static | install gate step, manual-desktop-chromium mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Confirm the install.` | static | install gate step, manual-desktop-chromium mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Open Mazer from your desktop or Start menu.` | static | install gate step, manual-desktop-chromium mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Open this page in Chrome or Edge. In Safari, choose File, then Add to Dock.` | static | install gate step, manual-desktop-other mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `In Chrome or Edge, click the install icon in the address bar.` | static | install gate step, manual-desktop-other mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Open Mazer from your desktop, Start menu or Dock.` | static | install gate step, manual-desktop-other mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Open this page in Chrome and tap the three-dot menu.` | static | install gate step, manual-android mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Choose Install app or Add to Home screen.` | static | install gate step, manual-android mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Open Mazer from your home screen.` | static | install gate step, manual-android and manual-ios modes (two source sites, one pin); active; none (install instructions) |
| `src/boot/installGate.ts` | `Tap the Share button in Safari.` | static | install gate step, manual-ios mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Choose Add to Home Screen.` | static | install gate step, manual-ios mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Mazer only runs as an installed app, and in-app browsers cannot install it.` | static | install gate subtitle, in-app-browser mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Copy the link below.` | static | install gate step, in-app-browser mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Paste it into Safari or Chrome.` | static | install gate step, in-app-browser mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Install Mazer from there, then open it from your home screen.` | static | install gate step, in-app-browser mode; active; none (install instructions) |
| `src/boot/installGate.ts` | `Open it from your home screen or desktop.` | static | install gate subtitle, installed-open-app mode (post-install card); active; none (install instructions) |
| `src/boot/installGate.ts` | `Race through endless mazes, straight from your home screen.` | static | install gate value line (all install cards, with a static mini-maze mark); active; none (install pitch) |
| `src/boot/installGate.ts` | `Link copied. Paste it into Safari or Chrome.` | static | install gate Copy link confirmation (role=status under the button); active; none (feedback to the Copy link click) |
| `src/boot/installGate.ts` | `Could not copy the link. Copy the address from your browser instead.` | static | install gate Copy link failure notice (role=status under the button); active; none |

### 4b. Technical-only literals

`src/legacy-runtime/legacyRemoteProgression.ts` carries 23 free-form provider and internal strings (receipt
recovery, RPC state, settings conflict). They only ever become `technicalDetail`; the player copy is replaced
by `LEGACY_REMOTE_MESSAGE_COPY` in `resolveLegacyRemoteSyncMessage` (and nothing shows it, F3). They are not
pinned one by one; the routing is pinned structurally
(`playerMessage: resolveLegacyRemoteSyncMessage(context, result)` must remain).

## 5. Counts (audit base 1670c8af)

| Bucket | Count |
| --- | --- |
| Routed strings in copy tables | 35 |
| Routed inline (3 in the auth resolver, 1 at a call site) | 4 |
| **Total routed** | **39** |
| Pinned literals outside the module | 40 |
| of which player-visible and bypassing the module (raw-status 10, raw-static 6, parallel-mapper 4) | 20 |
| of which technical / duplicate / fixture / label / static / routed-inline | 20 (technical 4, duplicate 1, fixture 1, label 1, static 12, routed-inline 1) |
| Technical-only literals pinned by rule (`legacyRemoteProgression.ts`) | 23 |
| Added by merged lanes after the audit base (section 4c): view-model duplicates 13, registry descriptions 10 | 23 |
| Non-literal raw render sites (section 4a) | 4 message-bearing |
| Routed messages with a render surface | 0 of the queue; 1 resolver (password recovery copy) is drawn |

## 6. How the guard works

`tests/reset/legacy-player-message-inventory.test.ts` parses `MenuScene.ts`, `src/boot/*`,
`src/legacy-runtime/*`, and `src/ui/dom/*` with the TypeScript AST (about 0.7 s) and collects a literal when it is
(a) an argument of a text sink (`createAuthInfoText`, `createAuthAccountSummaryCard`, `setText`), (b) the value
of an `error`/`info`/`copy`/`helper`/`message` property, (c) assigned to `textContent`/`innerText`, or (d) a
sentence (three or more words, capitalised, ending in `. ! ? …`) or a capitalised ellipsis string. It skips
`new Error(...)`, `throw`, `console.*`, colours, and enum-like tokens.

- A literal not in `PINNED_INVENTORY` fails with the file, line, and string, and an instruction to route it
  through `legacyPlayerMessage.ts` or classify it.
- A pinned row that no longer exists fails (no stale inventory).
- Every pinned literal must appear in this document.
- Structural pins: no render surface for the queue (F1), raw auth feedback site (F2), silent sync (F3),
  dormant resolvers (F5), boot messages diagnostics-only (F7), inline-sentence ratchet at 3 (F8).

Known blind spots (deliberate): strings built by concatenation or assembled from variables are not seen by
the literal scan; single lowercase words are ignored; strings written to a canvas through a path that is not a
sink call and are not sentence-like are missed. The structural pins and the doc-driven review cover the
known cases; extend `SINK_CALLS` when a new text helper is added.

When a string is added on purpose: decide its kind, add the row to `PINNED_INVENTORY` and to section 4,
and if it is a status/notice/error, prefer routing it through `legacyPlayerMessage.ts` instead.

## 7. Rank vocabulary trace

Question: does the label built at `src/legacy-runtime/legacyProgression.ts:1565`
(`${trackLabel} Lv NN Rank X Runs N`, with `trackLabel` = `Player Skill` or `AI Skill`) reach a player-facing
surface?

**Answer: No, diagnostics only.** Evidence:

1. Builder: `resolveLegacyProgressionPalette` (`legacyProgression.ts:1553`). The label is the `label` field of
   `LegacyProgressionPalette`.
2. Producers of the palette: `summarizeLegacyProgressionDiagnostics` (`:1742`) and direct calls in `MenuScene`
   (`:13518`, `:13648`, `:17777`).
3. Every `MenuScene` read of a progression palette uses colour or tier fields only (`playerHaloColor`,
   `trailColor`, `trailPulseColor`, `trailPulseEdgeColor`, `playerCoreColor`, ...). No `.label` read exists
   anywhere in `src/`.
4. The whole diagnostics object (including `palette.label`) is copied into the `progression` key of the runtime
   diagnostics payload (`MenuScene.ts:4798`, gated by the runtime diagnostics flag) and the visual diagnostics
   payload (`:18715`). The visual payload is written to `window.__MAZER_VISUAL_DIAGNOSTICS__` and the
   `data-mazer-visual-diagnostics` attribute on `<html>` (`:18822`-`:18826`). It is **not** gated by the runtime
   flag, so the label string is present in the DOM attribute for every session, but as machine-readable JSON in
   a `data-*` attribute, not as rendered text or an accessible name.
5. The in-canvas progression badge is retired: `drawLegacyProgressionBadge` (`:10439`) only clears and returns
   `null`; the badge text objects are only `setVisible`'d, never written.
6. `Skill` appears nowhere else as a string literal in `src/`, and not in entry HTML, CSS, or the manifest.
   Identifiers such as `aiSkillLevel` are internal fields (`legacyDemoWalker.ts`, `domain/ai/demoWalker.ts`).

Public rank wording today: `YOUR RANK` (`MenuScene.ts:13871`) and `rank progress` in the reset confirmation
(`:14002`).

Observation (not asserted by the guard): the leaderboard card renders `#N · Level M` (`:13869`) and a `LEVEL`
column header (`:13913`) next to Rank. Level is the maze-level measure, distinct from Rank, but it is a second
public progression number; whether that satisfies "one public progression signal" is a product call. **UNKNOWN**
until Zac decides.

Residual risk: two existing tests assert the label wording (`tests/reset/legacy-progression.test.ts:1864` and
`:2044`, `AI Skill Lv ...`). The lane that edits `legacyProgression.ts` must update them if it rewords the label;
the vocabulary guard allows any wording inside the builder and fails only if `Skill` becomes a literal elsewhere
or if anything starts reading `.label`.

The guard, `tests/reset/legacy-rank-vocabulary-guard.test.ts`, fails if: a `Skill` string literal appears
outside the builder; the palette `.label` gains a reader; `MenuScene` reads a new palette field; the
`progression` diagnostics object flows anywhere other than the two diagnostics publishers; or the retired
badge text objects are written.

## 8. Proposed routing changes (proposal only; nothing here is implemented)

Ordered by dependency. Owners per section 1. Each item names the guard row it will flip.

| # | Change | Owner | Why | Guard impact |
| --- | --- | --- | --- | --- |
| P1 | Add one render surface for the queue (reuse the dormant `createStatusBanner` DOM primitive or a Phaser equivalent; tone colours from `LEGACY_PLAYER_MESSAGE_COLORS`, placement, duration 2400 ms, max 3) | 3B behavior + 3C presentation | The card's core ask; today routing is diagnostics-only (F1) | flips `no render surface` pin; remove dormant pin for `createStatusBanner` |
| P2 | Render auth feedback from `latestAuthMessage.copy` instead of `authSnapshot.error ?? info` | 5C (MenuScene) | Makes sanitising effective; fixes F9 divergence | flips the raw-site pin; removes `Request timed out.` row |
| P3 | Sanitise at source: stop storing `error?.message` in the snapshot (`legacyAuth.ts:848`, `:902`, `:935`, `:1126`); store a stable code or the technical detail separately | 5C (legacyAuth) | Defence in depth if the legacy form is reachable (F2) | none |
| P4 | New copy keys: `requestTimedOut`, `usernameUnavailable`, `accountConnected`, `accountConnectionUnavailable`, `authGateLoading`, `loadingUsername`; move the 3 inline sentences and `Progression reset.` into tables | 3B | Removes F8 and the raw-status rows | lowers the inline-sentence ratchet; delete matching rows |
| P5 | Fold `legacyLeaderboard.ts` mapper and the `MenuScene.ts:13882` fallback into the message module (source `system`) | 3B + leaderboard owner | One mapper (F6) | delete 4 parallel-mapper rows |
| P6 | Surface username availability and save failures as messages; reuse `usernameTaken` instead of the duplicate | 5C + 3B | Silent failures (F4) | delete the duplicate row |
| P7 | Decide on remote-sync visibility. Default: keep silent (recorded decision); optionally surface only a persistent failure after retries | Zac (product) | F3 is deliberate; do not change by accident | would flip the `silent sync` pin |
| P8 | Decide a fatal boot-error fallback (a plain DOM line from `resolveLegacyBootMessage`) | 5C + Zac | F7: a failed boot shows nothing | flips the boot pin |
| P9 | Delete or wire the dormant resolvers (`resolveLegacyOverlay*Message`, `resolveLegacyAuthBottomFeedbackLabel`) | 3B | Dead surface area (F5) | flips the dormant pins |
| P10 | Visual QA per the card: failed login, failed create, fetch failure, success, logout, at phone and desktop sizes (`npm run visual:ui-surfaces`) | whoever lands P1-P2 | The card's proof plan | none |
| P11 | Rename the label builder to Rank wording (or gate the visual-diagnostics payload) and update the two label tests | legacyProgression lane | Removes the last `Skill` literal and the always-on DOM attribute | the vocabulary guard stays green |

Sequencing: P4 and P1 first (3B/3C), then P2 and P3 (5C), then P5 and P6, with P7 and P8 held for a decision.

## 9. Not verified (UNKNOWN)

- Whether the legacy password submit path (`handleLegacyAuthSubmit`) is reachable in the shipped
  shared-account entry UI. Source shows entry points but no field that activates them.
- Live visual behavior of any of these surfaces: this packet did not run the app or the visual harness.
- Whether `Account connected.` (snapshot info on OAuth return) is ever displayed; no render site was found.

### 4d. Guide and Reset progress copy (settings spec lane, 2026-11-06)

Pure modules, not rendered until the Settings wiring lane lands (`docs/ui/MAZER-SETTINGS-SHEET-SPEC-2026-11-06.md`).

| file | String | Kind | Recommended routing |
| --- | --- | --- | --- |
| `src/legacy-runtime/legacyGuideContent.ts` | `Reach the star to clear the maze.` | static | Guide row copy; update with the game (`docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md`) |
| `src/legacy-runtime/legacyGuideContent.ts` | `An arrow on the first tile points the way you set off.` | static | Guide Start row copy (added with the Chip board wiring); update with the game (`docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md`) |
| `src/legacy-runtime/legacyGuideContent.ts` | `You are the green rounded block inside a bright ring.` | static | Guide row copy; update with the game (`docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md`) |
| `src/legacy-runtime/legacyGuideContent.ts` | `Touch and hold anywhere, then drag the way you want to go. Let go to stop.` | static | Guide row copy; update with the game (`docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md`) |
| `src/legacy-runtime/legacyGuideContent.ts` | `A shimmering, colour-shifting line is your route. {} in Settings fades old trail.` | static | Guide row copy; update with the game (`docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md`) |
| `src/legacy-runtime/legacyGuideContent.ts` | `Some mazes wrap around open edges. The edge diamonds glow in your trail colours.` | static | Guide row copy; update with the game (`docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md`) |
| `src/legacy-runtime/legacyGuideContent.ts` | `Clears show your level. Harder mazes add shortcuts and loops.` | static | Guide row copy; update with the game (`docs/ops/MAZER-GUIDE-UPDATE-RULE-2026-11-06.md`) |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | `Your level and leaderboard standing go back to Level 1. Your account, username and settings stay as they are. This can’t be undone.` | static | Reset progress confirm/status copy; rendered by the shared Settings reset card; fold into the message module later |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | `Connect to the internet to reset your account progress.` | static | Reset progress confirm/status copy; rendered by the shared Settings reset card; fold into the message module later |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | `Your account is still loading. Try again in a moment.` | static | Reset progress confirm/status copy; rendered by the shared Settings reset card; fold into the message module later |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | `Your level on this device goes back to Level 1. Your settings stay as they are. This can’t be undone.` | static | Reset progress confirm/status copy; rendered by the shared Settings reset card; fold into the message module later |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | `Progress reset. You are back at Level 1.` | static | Reset progress confirm/status copy; rendered by the shared Settings reset card; fold into the message module later |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | `Progress changed on another device. Nothing was reset. Check your level and try again.` | static | Reset progress confirm/status copy; rendered by the shared Settings reset card; fold into the message module later |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | `Could not reset your progress. Nothing was changed.` | static | Reset progress confirm/status copy; rendered by the shared Settings reset card; fold into the message module later |
| `src/legacy-runtime/legacyProgressionResetFlow.ts` | `Resetting…` | static | Reset progress working-state button label; rendered by the shared Settings reset card |
