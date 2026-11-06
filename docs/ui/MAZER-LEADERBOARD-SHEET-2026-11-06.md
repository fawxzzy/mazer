# Mazer Leaderboard sheet (redesign, 2026-11-06)

Owner direction (Zac, 2026-11-06): "leader board needs complete redesign too." This supersedes the leaderboard part of
`MAZER-LEADERBOARD-PAUSE-IDENTITY-REDESIGN-2026-11-05.md` (the ten-per-page overlay with a Previous/Next pager, a top self
card, a round rank chip and a top-right back chevron). Data and RPCs are unchanged (`mazer_leaderboard_page`,
`mazer_leaderboard_self_rank`; `fetchLegacyLeaderboardPage` / `fetchLegacyLeaderboardSelfRank`).

## Design

The Leaderboard is a sheet in the shared Settings language: the same near-black card (`drawLegacySheetCard`), card padding,
title slot, 48 px primary `Back to Menu` row, masked scroll body and rail in the card padding, Space Grotesk
(`LEGACY_UI_FONT_FAMILY`) and theme colours (mint, cyan, start gold, goal red from `cyberArcadeMaterial`).
`legacyLeaderboardOverlayPlan.ts` reuses `LEGACY_SETTINGS_SIZES`, so the two sheets cannot drift apart.

```
Leaderboard                      title (shared createOverlayTitle)
[ Back to Menu ]                 primary exit row, pinned (same row as Settings)
 RANK   PLAYER           LEVEL   column header, pinned
 1      nova              259    top 3: themed accent bar + tint + bold (gold / cyan / mint), not medals
 2      qa-player [YOU]   255    own row in the list: mint tint + keyline + YOU tag
 3      kestrel           252
 4      pixelpilot        248    hairline separators, 48 px rows, scrolls under the shared mask
 ...                              rail in the card padding, only when the rows overflow
[ 57   YOU / qa-player    68 ]   pinned You row, always visible under the list (even outside the top N)
```

- Top N = 50 in one request (`LEGACY_LEADERBOARD_TOP_N`, RPC cap is 100); no pager, no offset state.
- Vocabulary: columns `RANK` (position, `#N`-style number), `PLAYER`, `LEVEL` (standing = level). The letter rank (E..S)
  still has no player surface (see `legacy-rank-vocabulary-guard.test.ts`); the unresolved "Rank vs Place" naming (audit G6) is
  an owner decision, the column follows the brief.
- Exit: the primary `Back to Menu` row, Escape (`handleBackAction`) and a tap on the dimmed scrim outside the card
  (`handleOverlayScrimPointerDown`, now for `options` and `leaderboard`). No X, no back arrow. Menu context only: the
  leaderboard is still not reachable from pause.
- Static: no animation anywhere in the sheet (loading is a static skeleton plus a status line), so there is nothing to gate
  for reduced motion.

## States (all designed, none shows raw error text)

| State | Copy | Action |
| --- | --- | --- |
| loading | skeleton rows + `Loading the leaderboard…` in the header slot | none |
| ready | the list, header and (when ranked) the You row | none |
| empty | `No ranks yet` / `Clear a maze to put your name on the board.` | none |
| error (generic) | `Leaderboard unavailable` / `Something went wrong on our side. Try again in a moment.` | Retry |
| error (network) | `Can’t reach the leaderboard` / `Check your connection and try again.` | Retry |
| error (not set up) | `Leaderboard not ready` / `It isn’t available yet. Check back soon.` | Retry |
| offline (`navigator.onLine === false` and nothing loaded) | `You’re offline` / `Reconnect to see the leaderboard. Your progress is saved on this device.` | Retry |
| signed out | `Sign in to see the board` / `Sign in to see where you stand among other players.` | Sign in |
| username gate | `Choose a username` / `Players appear on the leaderboard by username.`; profile loading is a status line; profile unavailable retries | Go to Account / Retry |

The source error strings in `legacyLeaderboard.ts` are matched (never displayed) to choose the designed state.
Already-loaded rows are kept when a device goes offline later.

## Sizes

Rows 48 px (display-only, >= the 44 px floor) at every viewport; You row 56 px; column header 24 px; exit and actions
48 px (>= 44 px). At 320x568 the list keeps >= 5 rows beside the exit, header and You row. The card is centred and shrinks to
its content for state blocks and short lists; it never exceeds the panel.

## Dev/test fixture seed

A populated leaderboard could not be exercised (the diagnostics auth fixture is provider-inert and returned `[]`).
`legacyLeaderboardFixture.ts` adds deterministic seed data behind
`?runtimeDiagnostics=1&authFixture=authenticated&leaderboardFixture=<shape>` only (the same two flags as the auth fixture
route, plus the fixture identity check in the RPC wrappers). Shapes: `top3` (you at rank 2), `rank57` (you outside the top 50),
`empty`, `loading`, `error`, `offline`, `signed-out`. No network, no storage, no build flag; a plain URL cannot reach it.
`tests/reset/legacy-leaderboard-fixture.test.ts` pins the gates.

## Files

`src/legacy-runtime/legacyLeaderboardView.ts` (view-model, copy), `legacyLeaderboardOverlayPlan.ts` (layout),
`legacyLeaderboardFixture.ts` (seed), `MenuScene.buildLeaderboardOverlay` and its `paintLegacyLeaderboard*` helpers
(painting only). Tests: `legacy-leaderboard-view`, `legacy-leaderboard-overlay-plan` (9 shapes x 3 viewports),
`legacy-leaderboard-fixture`, plus pins in `menu-render-frame` and the message-inventory guard.
Guide: it does not describe the leaderboard, so no Guide copy changed (drift test unchanged).
