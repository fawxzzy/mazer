# Mazer UI And Account Release Checklist — 2026-08-16

## Purpose

This is the release checklist for the visible Mazer issues reported on 2026-08-16. It distinguishes this bounded repair from the larger Precision Arcade redesign: the redesign remains incomplete until its nine-point acceptance matrix is satisfied.

## This release

| Requested outcome | State | Evidence / contract |
| --- | --- | --- |
| Player level, menu-AI level, and Settings stay clear of the animated title on phone and desktop | landed | The layout now reserves the full animated-title footprint before placing the board and menu action. The header controls remain matching `44px` controls with the player level, explicit `AI` level, and cog in separate lanes. |
| Level glyphs accommodate future larger values | landed | The header primitive keeps a bounded text-fit contract and the glyphs are tested at phone and desktop sizes. |
| Account reauthentication explains what happened | landed | A remembered account without a session now says `Sign In Again`, asks for the password to restore saved progress, and points to Forgot Password without exposing an email address. |
| Account failures are useful and safe to show players | landed | Invalid credentials, confirmation, rate-limit, and existing-account cases have player-safe guidance; raw provider errors remain diagnostics only. |
| Mobile account fields are practical to use | landed | The real accessible email/password inputs publish appropriate mobile keyboard and Enter-key hints while remaining within the overlay bounds. |
| Animated backdrop and board framing remain intentional | verified | The backdrop is still enabled and captures show the star/rune field. The only rectangular frame in the menu is the board boundary; account/settings/pause use a dimmer rather than a full-screen border. |
| Full UI packet component extraction and DOM-shell migration | not in this release | The current design registry explicitly reserves this for the staged renderer-ownership migration. It needs its own complete component/asset manifest and acceptance-matrix lane; it must not be called complete because this repair ships. |
| Live sign-in with a real player credential | requires player-controlled QA | Email/password provider is enabled. A real sign-in cannot be safely automated without a designated test account or the player's password, and this release does not create accounts, send recovery email, or mutate user data. |
| Master-project schema migration branch | excluded | Open PR #159 targets a different `mazer` schema/master-project cutover. It is intentionally not included because production currently uses the active Mazer project and its public-table contract. |

## Required release proof

- focused layout, auth-presentation, player-message, native-input, and render tests;
- canonical verification, lint/typecheck, and production build/PWA;
- built phone captures at `390x844` and `405x958`, plus desktop at `1440x900` across Menu, Account, Settings, Play, and Pause;
- clean source worktree and protected canonical-checkout preservation;
- exact-head review, merge, production deployment, and fresh-alias browser proof.

## Non-negotiable preservation

- Player and menu-AI progression stay separate.
- No game timing, collision, generation, rooms, WorldTurnHost, scoring, or account-data behavior changes.
- No provider configuration, Auth-user, reset-email, or live-data mutation.
- The canonical checkout's known dirty state is preserved untouched.
