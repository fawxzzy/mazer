# Screens pass (MAZER-UI-099), 2026-11-23

Status: in review. The owner looks before merge. Nothing here was checked on a real phone.

Goal: the secondary screens use the same button components, spacing and type scale as the live game, readable at phone width, no new settings. All captures are the live app (dev server, `?runtimeDiagnostics=1`, authenticated fixture where a session is needed), Playwright chrome and webkit, 390x844 at DPR 3, light and dark, plus one 820x1180 iPad frame.

## Button hierarchy (owner delegated the pick: solid mint primary)

| Tone | Look | Used for |
| --- | --- | --- |
| primary | solid brand mint fill, dark ink, bold label, no idle glow | the one main action on a surface |
| secondary | dark control fill, cyan outline | every other action next to a primary |
| ghost | no box, mint text, faint wash while pressed (44 px target kept) | quiet rows ("Jump to level" list) |
| danger | dark red fill / outline (unchanged) | Reset to Level 1, Sign out |

Source: `src/legacy-runtime/legacyButtonKit.ts` (`LEGACY_BUTTON_CHROME`), drawn by `MenuScene.createLegacyAuthActionButton`. In dark mode the canvas colour bridge maps the mint fill to the accent ramp (pink) and the ink to the void role.

## Audit (every remaining screen, keep or update)

| Screen | Verdict | Why / evidence |
| --- | --- | --- |
| Main menu, Tap to play, Menu button | keep | already the live look (UI-094, UI-095/096) |
| In-game Menu dropdown | keep | merged #673, same rows as the main menu |
| Settings sheet | update | Back to Menu was the same dark-green outline as every toggle row; now the solid primary. Title colour was a one-off green; now brand mint |
| How to play (Guide) | update | Got it is the solid primary. Copy unchanged (no behaviour change), so the 90-character line cap and the drift/inventory tests are untouched |
| Leaderboard, list | update | Back to Menu is the primary; rank-1 gold kept as decided |
| Leaderboard, states (loading, empty, error, offline, unranked, signed out) | update | a state action (Retry, Sign in) is the primary and Back to Menu steps down to secondary, so the two are no longer indistinguishable |
| Sign-in gate | update | Sign in was a separate pale-gradient pill in another font; now the same kit primary. The destructive dock keeps its pale pill |
| Choose a username | keep (out of scope) | lives on the account site (MAZER-ACCT-043); Mazer shows only the leaderboard state |
| Level preview sheet (pause context) | update | Resume is the only solid primary; Next/Previous are secondary; the checkpoint list is ghost rows; the checkpoint you are on is the outlined secondary |
| Reset confirmation | update | Cancel is secondary beside the danger Reset |
| Level announcer (between levels) | keep | already the tile-built number in the live board material |
| Play HUD and level tag | keep | already the live look; "PREVIEW Lnn" tag is a dev-only route |
| Profile | out of scope | account site, not drawn in the game |
| Install screen | not audited | not reachable from the fixtures used here |

## Known gaps (not in this PR)

- Dark mode: the canvas bridge maps the danger red to the accent ramp, so Reset to Level 1 and Cancel read as the same colour outline in dark and differ only by label and fill. A danger role in the dark theme map would fix it (follow-up for the dark-mode owner).
- The exit position differs by design: top row on sheets without a footer (Settings, Leaderboard), a pinned footer on the scrolling How to play sheet.
