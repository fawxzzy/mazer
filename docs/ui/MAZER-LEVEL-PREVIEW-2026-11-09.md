# Mazer Level Preview (dev/QA hidden route)

Status: implemented 2026-11-09. Hidden dev/QA route, like `?advancedOptions`. It is deliberately NOT in the in-app Guide: players are not meant to see it.

## What it is

Open a level directly, on a phone or desktop, to feel the ladder without touching a real account:

```
https://mazer.fawxzzy.com/?previewLevel=100
```

Checkpoints worth trying (the pause sheet's jump list): 1, 2, 5, 10, 20, 30, 60, 100, 150, 190, 198, 218, 283, 288, 300. 283 is where the felt difficulty saturates and 288 is the last budget level (the end of the fringe); 300 is on the plateau past it (MAZER-QA-008).

- It starts straight into play (no menu, no sign-in, no install gate) at that level.
- Generation is the unchanged real path: the preview seeds the player track with the state a player at that level would have (`level N`, completion ordinal `N-1`, target complexity `8 + 4*(N-1)`, saturating at 400 / level 99), then the same resolvers real play uses read it. Board size is the real board for the device (phone portrait 25x51, desktop landscape).
- Rank is not an input. It is derived from the level's target complexity (`resolveLegacyProgressionRank`), so the route takes the level only; a `rank` param is ignored.
- Geometry saturates at `LAST_BUDGET_LEVEL` (see `legacyGeometryBudget.ts`); levels above it keep counting as ordinals but share the top geometry profile, exactly as in real play.

## Parameters

| Param | Meaning |
| --- | --- |
| `previewLevel=N` | A plain positive integer. `0`, negatives, decimals, hex, exponents, empty or non-numeric values ignore preview entirely (the URL then behaves exactly like an ordinary one). Above 999 clamps to 999. |

## In preview

- A small `PREVIEW L100` tag sits at the bottom centre. It follows the live level.
- Reaching the goal advances to L+1 inside the sandbox (the same +1 the real game applies); nothing is saved.
- The pause cog opens the shared Settings sheet (`legacySettingsSheetPlan.ts`, pause context) with a Level preview section: Next level, Previous level, and a collapsed Jump to level list of the checkpoints above. Rows are 48 px tall; there is no close/back arrow (Resume is the exit, as everywhere).
- Quit to Menu leaves preview: the page reloads at the same URL without `previewLevel`, so the ordinary app boots from scratch on the real session and storage. Every other route back to the menu does the same (`enterMenuMode`).

## Safety guarantees

Preview never reads or writes the real account. Mechanisms (all in `legacyLevelPreview.ts` plus small hooks):

1. Storage: `MenuScene.resolveBrowserLocalStorage()` returns an in-memory `createLegacyLevelPreviewStorage()` for the whole session, so progression (`mazer.progression.v1`), telemetry, settings toggles and remembered identity never touch `window.localStorage`. Progression is seeded in memory and never read from storage. The sandbox is dropped on reload.
2. Session: preview runs as the existing runtime-diagnostics auth fixture identity, which the remote layer, leaderboard and sync code already treat as ineligible. `initializeLegacyAuth` takes the fixture branch before any auth client or subscription exists. So `mazer_complete_level`, `mazer_initialize_progression`, `mazer_reset_progression`, settings sync, completion outbox and leaderboard calls cannot fire.
3. Boot: `bootstrapLegacyRemoteAccountStateForRoute` returns null on a preview route (no account bootstrap, no completion replay), and the install gate is skipped (`levelPreviewRequested`), so there is no sign-in and no install screen in the way.
4. Endless checkpoints: nothing in `src/` imports the endless checkpoint store, and nothing in preview writes one.

Not covered by design: Settings toggles changed during preview live only in the sandbox (a preview session starts from default settings, not the device's saved ones).

## Tests

- `tests/reset/legacy-level-preview.test.ts`: URL parsing and clamping (invalid ignores preview), state coherence at every checkpoint, preview level equals the state N-1 real clears produce, goal advances exactly one level into the sandbox only.
- `tests/reset/legacy-level-preview-no-writes.test.ts`: with the remote layer enabled and a spy client and spy real storage, every remote read/write entry point is skipped before a client or storage is touched; bootstrap skipped on the route; install gate bypass only for the preview flag.
- `tests/reset/legacy-level-preview-sheet.test.ts`: default pause/menu sheets unchanged; preview rows, 44 px targets and scroll reachability at the audited viewports; MenuScene wiring contract.

Rendered checks (Playwright, 390x844 and 1280x720, L1/L100/L198) were run by hand against the dev server: level tag, goal reachable, no console errors, no `mazer.progression.v1` access, no network writes.

## Wave ownership

Hooks live in `MenuScene.ts`, `boot/main.ts` and `boot/installGate.ts` (all Wave 5C) plus unowned modules, so the change set does not span registry waves.
