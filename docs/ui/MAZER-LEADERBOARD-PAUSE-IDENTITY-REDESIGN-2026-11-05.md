# Mazer leaderboard, pause menu and header identity redesign (DRAFT)

Status: DRAFT spec for a later MenuScene wiring packet. Date: 2026-11-05.
Owner direction: Zac, 2026-11-05.

This packet ships ONLY pure, unwired view-model modules and their tests. It
does not edit `src/scenes/MenuScene.ts` or any file owned by another lane, and
nothing in the running game changes until the wiring packet lands.

## Owner direction (verbatim intent)

1. Redo the leaderboard entirely; keep its little icon.
2. Redo the whole pause menu; keep its icon; remove the profile icon from
   inside it.
3. Remove "Welcome" + username from the bottom of the main menu; show the
   username at the top left, to the right of the profile icon.

Fact from reading the code: the pause overlay has no profile icon. The profile
icon lives in the OPTIONS overlay header (`createLegacyOverlayUsernameButton`).
The redesign therefore removes it from Options; the main menu's top-left profile
icon (`createLegacyMenuProfileButton`) stays.

## What ships in this packet

| Module | Purpose |
| --- | --- |
| `src/legacy-runtime/legacyLeaderboardView.ts` | Scene state to render-ready leaderboard model, limit+1 paging, layout helper |
| `src/legacy-runtime/legacyHeaderIdentity.ts` | Ellipsis helper, identity-label text and layout rules |
| `src/legacy-runtime/legacyPauseMenuView.ts` | Pause card model, command mapping, layout helper |
| `tests/reset/legacy-leaderboard-view.test.ts`, `legacy-header-identity.test.ts`, `legacy-pause-menu-view.test.ts` | Contract tests |

### Public API

`legacyLeaderboardView.ts`: `buildLegacyLeaderboardViewModel(state, options?)`,
`resolveLegacyLeaderboardPageRequest(offset)` -> `{ limit: 11, offset }`,
`splitLegacyLeaderboardPage(entries)` -> `{ visible (first 10), hasNext }`,
`resolveLegacyLeaderboardRankTier(rank)`, `resolveLegacyLeaderboardTierColor(tier)`,
`resolveLegacyLeaderboardUsernameDisplay(username, maxChars = 15)`,
`resolveLegacyLeaderboardPagerActions(pager)`,
`resolveLegacyLeaderboardLayout(width, height, safeArea, options?)`, plus
`LEGACY_LEADERBOARD_COPY`, `LEGACY_LEADERBOARD_OVERLAY_ID`,
`LEGACY_LEADERBOARD_ICON_ASSET_PATH`, `LEGACY_LEADERBOARD_VISIBLE_ROWS`,
`LEGACY_LEADERBOARD_FETCH_LIMIT`.

`legacyHeaderIdentity.ts`: `ellipsizeLegacyUiText(text, maxWidthPx, measure)`,
`resolveLegacyHeaderIdentityText(canonicalUsername)`,
`resolveLegacyHeaderIdentityLayout({ viewportWidth, viewportHeight,
profileFrameRight, titleLeft, text, fontPx, measure?, profileFrameCenterY? })`,
`LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS = 6`, gap and font constants.

`legacyPauseMenuView.ts`: `buildLegacyPauseMenuViewModel()`, `LEGACY_PAUSE_ACTIONS`,
`LEGACY_PAUSE_ACTION_COMMANDS`, `resolveLegacyPauseActionCommand(id)`,
`resolveLegacyPauseMenuLayout(width, height, safeArea, options?)`,
`LEGACY_PAUSE_OVERLAY_ID = 'pause'`.

## Kept

- Leaderboard header icon asset `public/assets/hud/hud-leaderboard.png` and its
  header placement (the menu header leaderboard icon and its
  `drawLegacyMenuLeaderboardIcon` glyph).
- The in-play settings cog that opens Pause.
- Overlay ids `'leaderboard'` and `'pause'` (`LegacyOverlayKind`).
  `holdLegacyPlayMazeLifecycleDuringPause` and the QA surface depend on
  `'pause'`.
- The main-menu top-left profile icon.
- All existing leaderboard copy and the exact error copy from
  `legacyLeaderboard.ts` (`LEGACY_LEADERBOARD_COPY`; tests assert both the scene
  and `legacyLeaderboard.ts` still contain it).
- `LegacyPauseCommand` and `resolveLegacyPauseCommand` are unchanged. The
  `reset-player` / `reset-progression` members stay in the type; no UI maps to
  them.

## Replaced (by the wiring packet, not by this one)

| Current | Replacement |
| --- | --- |
| `buildLeaderboardOverlay` body (MenuScene ~L13791-13990) | Render `buildLegacyLeaderboardViewModel(...)` with `resolveLegacyLeaderboardLayout` |
| `buildPauseOverlay` body (~L13671-13735): back chevron + home button + Guide + toggles | Pause card: title, Resume, collapsible Settings, Quit to Menu |
| `createLegacyAuthenticatedWelcomeIdentity` (~L17076) "Welcome" + username at bottom of main menu | Header identity label right of the profile icon |
| `createLegacyOverlayUsernameButton` call in `buildOptionsOverlay` (~L13165) | Removed |
| `loadLeaderboardPage` `hasNextPage = entries.length === 10` and limit 10 (~L17040-17068) | Request `resolveLegacyLeaderboardPageRequest(offset)` (limit 11), `splitLegacyLeaderboardPage` for `hasNext` |
| Page-relative rank accent (`resolveLegacyLeaderboardRowAccent(rowIndex)`) | Global-rank tier (#1 gold, #2 cyan, #3 mint) |

Why limit+1: the current `entries.length === 10` check shows a dead "Next" link
whenever the final page is exactly full. Requesting 11 rows and showing 10 makes
`hasNext` exact. `fetchLegacyLeaderboardPage` already allows limit up to 100.
Offset stays a multiple of 10 (`nextOffset = offset + 10`).

### Leaderboard model summary

- Precedence: username gate (replaces whole body) > self card > page status.
- Gate: `loading` -> "Loading username..."; `unavailable` -> "Username
  unavailable. Try again." + Retry; `needs-username` -> "You need a username to
  access the leaderboard." + Go to Account.
- Self card "YOU": `#N` and `Level N`, or "Set a username on the account screen
  to appear here."
- Rows: at most 10, rank chip (tier by global rank only), username (max 15 code
  points including ellipsis), level right-aligned, own-row flag from
  `isRequestingUser`. `idle`/`loading` -> 10 skeleton rows.
- `error`/`unavailable` -> exact message (fallback "The leaderboard is not
  available right now.") + Retry. `empty` -> "No one has a public rank yet."
- Pager: "Page N", Previous/Next.
- Ranks and levels stay decimal strings end to end; formatting uses
  `formatLegacyProgressionOrdinal` (BigInt). A test forbids `Number(`,
  `parseInt(`, `parseFloat(` in the module.
- Layout: row 44, or 40 when viewport height < 760. Computed: fits at 390x844
  (648 of 828 px) and at 1280x720 (622 of 688 px). Reports `fits: false`,
  `overflowPx` and `maxRowsThatFit` instead of hiding overflow.

### Pause model summary

Title "Paused"; actions in order Resume (bridge `RESUME_RUN`, pause command
`resume`), Settings (inline toggle section, collapsed by default, same
`createFeatureControlRows` rows with `includeMovementSpeed: false`), Quit to
Menu (bridge `RETURN_HOME`, pause command `return-menu`). No restart, no
account/profile. Scene keeps "bridge first, then `applyLegacyPauseCommand`
fallback". Layout: collapsed and expanded card fit at 390x844 and 1280x720;
a tiny viewport with Settings open reports `scrollable`.

### Header identity: KEY FINDING (derived, not measured)

Assumption (DERIVED, NOT MEASURED): at 390x844 the profile icon right edge is
~44 and the inline title left edge is ~85 (investigation figures). The icon edge
is reproduced from the real `resolveLegacyHeaderControlFrame` (36px icon, 8px
inset). The title footprint is modeled as a constant 220px centered
(`titleLeft = (width - 220) / 2`), which yields exactly 85 at 390 and is
extrapolated to 320/360/430. Real footprints shrink when the header squeezes.

Consequence under that assumption: label room = `titleLeft - 8 - (iconRight +
8)` = about 25px at 390 (about 44px at 430, none at 320). That fits a 3-character
name at best. The 6-visible-character rule therefore hides the label on every
phone width for any realistic username, and the worst case
("WWWWWWWWWWWWWWW") is icon-only everywhere on phones. Desktop (1280) has room.

So the owner's direction ("username at top left, right of the profile icon")
is not deliverable on phones with a centered inline title unless something else
changes. To show 6 characters at 11px with an ellipsis needs roughly 50px of
room, i.e. about 26px more than the 390 assumption provides. Options, ranked:

1. Measure the real title footprint on a device/capture first (turns this
   derived number into a measured one), then decide.
2. Let the identity label take priority over title centering on narrow phones
   (title shifts or squeezes right using the existing `headerIconScale` loop).
   This touches `legacyMenuLayout.ts` / `legacyMenuTitle.ts`, which other lanes
   own; needs a coordinated packet.
3. Place the label directly under the profile icon (same left edge) instead of
   beside it. Departs from the stated direction.

Not recommended: lowering the 6-char floor (an unreadable stub is worse than the
icon alone).

## Pins that must be rewritten with the wiring (file:line from my reading)

`tests/scenes/menu-render-frame.test.ts`
- L123-135: `buildPauseSource` slice; guide-before-controls ordering asserted
  against `buildPauseOverlay`. Drop or retarget if the Guide leaves Pause.
- L1316-1326: `not.toContain(resetAction ...)` (keep) and the exact multi-line
  `this.uiButtons.push(this.createLegacyOverlayHomeButton(` pin. Rewrite for the
  new Quit to Menu button.
- L1822-1828: exact multi-line `createLegacyOverlayUsernameButton(` pin in
  Options. Replace with `not.toContain` once the icon is removed.
- L1876-1890: "shows the verified master username beneath Welcome" (`'Welcome'`,
  two `backgroundColor`, two `setOrigin(0.5).setDepth(3)` matches,
  `createLegacyAuthenticatedWelcomeIdentity` call). Rewrite for the header
  label; keep the `canonicalUsername?.trim()`, no `authSnapshot.email`, no
  `accountUsernameSavedValue`, no `readLegacyAccountUsername` assertions.
- L1932-1936: `clearUi` slice ends at `private async loadLeaderboardPage(`;
  keep method order or retarget.
- L1963: `fetchLegacyLeaderboardPage(offset, MenuScene.LEADERBOARD_VISIBLE_ROWS, this.authSnapshot)`
  changes when the request uses limit 11.
- L2077: `LEADERBOARD_VISIBLE_ROWS = 10` (value stays 10; keep or point at the
  module constant).
- L2092-2108: gate copy, `'Retry'`, and the hydration ordering inside
  `buildLeaderboardOverlay` (`loadAccountUsernameIfNeeded` before
  `accountUsernameSavedValue.length <= 0`). Strings stay; source-shape asserts
  move to the view model plus a thin scene test.

`tests/reset/legacy-pause-lifecycle.test.ts`
- L34-61: slices `buildPauseOverlay`..`buildAuthOverlay`; asserts
  `createLegacyOverlayHomeButton`, `applyLegacyPauseCommand('return-menu')`,
  and `not.toContain("'Resume'")` / `not.toContain('resumeAction')`. The last two
  contradict a Resume action and must be inverted.

`tests/reset/legacy-reset.test.ts`
- L1038-1050: `LegacyPauseCommand` union text (keep, type is unchanged),
  `applyLegacyPauseCommand('resume')`, `createLegacyOverlayHomeButton`,
  `applyLegacyPauseCommand('return-menu')`. Retarget the button-name assertion.

`scripts/analysis/verify-welcome-identity-readability.mjs` (L34, L84) looks up
`'Welcome'` text objects; retire or retarget to the header label.

## Sequencing and collision risk

- `MenuScene.ts` is shared with the intro/graphics lane and the auth/install
  lane. The registry (`docs/contracts/mazer-ui-rework-decision-registry.v1.json`,
  `integratorWaveOwnership`) assigns one active writer per path; the wiring
  packet needs a fresh current-main preflight and the active owner's go-ahead.
  Do not start it while another lane holds `MenuScene.ts`.
- `legacyMenuLayout.ts`, `legacyMenuTitle.ts`, `legacyUiStandards.ts`,
  `legacyLeaderboard.ts`, `legacyAuth.ts`, `legacyPlayerMessage.ts` and
  `src/boot/*` are owned elsewhere. This packet only imports from them and does
  not modify them.
- Suggested order: (1) land these pure modules; (2) measure the real title
  footprint and settle the identity-label question; (3) wiring packet A:
  leaderboard (fetch limit 11, view model render, pin rewrites); (4) packet B:
  pause card + Options icon removal; (5) packet C: header label + Welcome
  removal. Each as a small, separate PR to shrink the `MenuScene.ts` conflict
  window.

## Decisions made

- Identity label: ellipsized, left-anchored right of the profile icon, vertically
  centered on the icon; `left = iconRight + 8`; clearance 8px to the title.
- Hide the label (icon only) when fewer than 6 characters are visible at the
  minimum 11px font. Names shorter than 6 characters are shown whole if they fit.
- Font policy: shrink from 14px to 11px before ellipsizing.
- Label text comes from `canonicalUsername` only; email-shaped values are
  refused.
- Quit to Menu has no confirmation; no Restart action.
- Leaderboard rank accent is by global rank (#1-#3), not page-relative.
- `idle` is treated as `loading`; a ready page past the end shows "No more
  players on this page." (new copy) with a way back.

## Open owner questions

1. Phone header: accept icon-only on phones, shift/squeeze the title, or put the
   label under the icon? (See key finding.)
2. Quit to Menu without confirmation loses the run silently; confirm that is
   intended.
3. Does Pause keep the Guide card, or is Pause only Resume / Settings / Quit?
   (Model assumes no Guide.)
4. Does Pause keep a back chevron (alias for Resume) in addition to the Resume
   button?
5. Is "No more players on this page." acceptable new copy, and should Retry on
   the "not set up yet" error be offered?
6. Should the Options overlay show anything where the profile icon was?

## Verification status

Pure-module tests and `tsc --noEmit` only. Nothing here was rendered, run in a
browser, or checked on a device. Layout numbers are computed from the shared
layout primitives, not captured.
