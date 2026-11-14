# Mazer decision records, 2026-11-14 (MAZER-GOV-012)

Status: docs-only decision record. No runtime, test, config, package or board file changes with this document. It grants no merge, deploy, alias, provider, database, credential or DNS authority.

Acceptance statement (applies to every decision below): accepted on the owner go-ahead ("do it") of 2026-11-14; reversible, overrule by saying so.

## What this is

The board carried a set of open owner-decision cards. Each had a written recommendation from the coordinator (kept in the work ledger blocker field). On 2026-11-14 the owner said "do it" to applying those recommended answers, and asked for the decision cards to be finished or closed out. This document records, per card, the question, the recommended option accepted, what it changes, and the follow-up build card if one is needed. It is the evidence for completing the decision-only cards with `--device none` (a decision record has no runtime surface).

Source of each question and recommendation: the card text and the ledger blocker on `origin/main` (checked at 8aada7e3, 243 cards). Nothing here is newly invented; where a card carried no written recommendation the choice is the smallest one that matches the frozen constraints (board size and zoom 25x51 phone / 45x27 desktop, tile style B "Chip", dark neon look, no hazards or enemies or obstacles until contract MAZER-HAZ-002 is signed).

## Not decided here (owner-only, untouched)

| Card | Why it stays open |
| --- | --- |
| MAZER-HAZ-002 | Signing or rejecting the hazard product contract is the owner's own signature. Not applied, not recommended-accepted. |
| MAZER-DATA-002 | Raising the server difficulty cap is a database change; needs a read-only preimage first. |
| MAZER-DATA-003 | Provider and ATLAS-side sync steps need an approved written scope. |
| MAZER-ACCT-020, MAZER-ACCT-027 | Production data patches (database box). |
| MAZER-ACCT-026 | Needs a database approval of exact SQL. |
| MAZER-ACCT-028 | Provider dashboard read (hook registration). |

Cards that merge into HAZ-002 (MAZER-PROG-005, MAZER-PROG-019, MAZER-HAZ-003 to HAZ-006, MAZER-HAZ-008, MAZER-PROG-007, MAZER-CTRL-003) are not touched either.

## 1. The six design-board picks (MAZER-UI-020)

Question: which option for each of the six picks that block the graphics cards. The owner said on 2026-11-10 to stop asking and make the judgement calls; the recommendation was "say go so the build agent records each pick with its reason".

| # | Pick | Option accepted | Reason | What it changes | Build card |
| --- | --- | --- | --- | --- | --- |
| 1 | Display font | Keep Space Grotesk for body copy; add exactly one squared techno display face for short uppercase labels only; fixed type scale with a 12 px floor for body copy | Seven font stacks and eleven sizes today; one scale removes the drift without touching the tile-font title | Unblocks MAZER-UI-010 | MAZER-UI-010 |
| 2 | Quit-to-Menu confirmation | Already shipped: quit at once before any move, second press within 3 s after a move | It is live; no change | Nothing | MAZER-FLOW-005 (completed) |
| 3 | START style | Keep the tile-font START wordmark look; give it an explicit hit zone instead of the full screen; it joins the shared button kit | The look is part of the accepted identity, the full-screen hit area is the defect | Unblocks MAZER-UI-015 | MAZER-UI-015 |
| 4 | Icon construction | One outline icon family drawn from scripted vector sources, baked into one small atlas, with the missing glyphs added | Three AI-style bitmaps in three styles, about 1.5 MB, shown under 25 px | Unblocks MAZER-VIS-011 | MAZER-VIS-011 |
| 5 | Backdrop | One near-black canvas colour across boot, install gate and sign-in, calmer gate starfield; the app image is already unified (MAZER-VIS-039) | Three visual dialects today | Unblocks MAZER-VIS-012; portal alignment is a separate card in another repository | MAZER-VIS-012 |
| 6 | Play HUD | No new play HUD design now: keep the shipped compact HUD; later HUD changes ride the shared button kit and the icon atlas rather than a separate redesign | The board carried no written HUD proposal, so the smallest change that keeps the frozen look is no redesign | Nothing now | none |

Card action: MAZER-UI-020 completes on this record. MAZER-VIS-012 stays open as the build card (blocker cleared).

## 2. Flow and play

### MAZER-FLOW-006: resume the same maze after quit or reload
- Question: should quitting or reloading mid-level resume the same maze, or roll a new one on the next Start.
- Accepted: resume the same maze, so quitting is not a free re-roll.
- Changes: product rule only; needs seed plumbing.
- Follow-up build card: persist the maze seed for the current attempt and restore it, with a reload test (new card, planning).
- Card action: MAZER-FLOW-006 completes (decision only; criteria corrected to say the build is carried by the new card).

### MAZER-FLOW-011: when input unlocks during the level intro
- Question: unlock as now (about 2.5 s), at 75 percent of the reveal, or when the beams land plus a margin.
- Accepted: keep the current unlock; the owner twice said build and deconstruct felt too fast.
- Changes: nothing in code; the timer rule stays.
- Follow-up: none. Card action: completes.

### MAZER-VIS-026: dense-board player prominence
- Question: accept the thin tile-sized ring on dense boards, or add a screen-pixel floor on the glow.
- Accepted: accept the thin ring; the find-me ping still finds the player.
- Changes: nothing. Follow-up: none. Card action: completes.

### MAZER-GEN-006: no one-tile dead-end stubs
- Question: accept the minimum 2-tile stubs and the shorter rising ladder (ends at 288 after the later ladder work).
- Accepted: yes; the owner's informal feedback was "no single tiles so far".
- Changes: nothing in code. The phone look rides on MAZER-GEN-007.
- Card action: stays review (device look not done); blocker cleared.

### MAZER-PROG-006: minimum tile size for very large boards
- Question: set a minimum tile size, or explicitly defer zoom.
- Accepted: defer explicitly; board size and zoom are frozen by the owner.
- Changes: nothing. Follow-up: none. Card action: completes.

### MAZER-PROG-008: which features unlock at which level
- Accepted: stays deferred; it follows the economy and hazard decisions.
- Card action: deferred_candidate. No build card.

## 3. Sound

### MAZER-AUDIO-001: does the game have sound
- Accepted: allow small synthesized effects behind a Settings toggle, default off.
- Changes: product rule; the in-app Guide must gain a row when it is built (guide sync rule).
- Follow-up build card: audio v1 (effects module, Settings row, Guide row, audio unlock on first tap) (new card, planning).
- Card action: MAZER-AUDIO-001 completes (decision only).

### MAZER-AUDIO-002: original music
- Accepted: waits until audio v1 ships. Card action: deferred_candidate.

## 4. Motion

### MAZER-MOTION-004: Reduce Motion judgement calls
- Question: under Reduce Motion, keep the dock travelling band and the touch-stick orbit held still, or let them move.
- Accepted: keep both held still; colour still shifts. The crossfade criterion is done by MAZER-MOTION-005.
- Card action: stays review until the phone check (MAZER-MOTION-008); blocker cleared.

### MAZER-MOTION-007: off-scale loops and durations
- Accepted: anything the owner has not named stays unchanged; then sweep dead motion code.
- Build card: MAZER-MOTION-010 (dead tuning sweep, already merged).
- Card action: stays open for the remaining sweep; blocker cleared.

## 5. Offline, install and viewport

### MAZER-DATA-004: offline-first contract
- Accepted: sign the client part as written; server parts stay blocked until provider approval.
- Card action: stays review; the airplane-mode phone check rides on MAZER-PWA-004. Blocker cleared for the client part.

### MAZER-PWA-004: install gate policy
- Accepted: keep the install gate as shipped (see the always-on policy record) until entitlements exist (MAZER-ECON-003, deferred). No skip.
- Card action: stays open for the phone airplane-mode reload; blocker cleared.

### MAZER-QA-006: cross-viewport reliability
- Accepted: drop the layout persistence criterion (Board Zoom is removed, nothing to persist); keep the viewport matrix and the rotate check.
- Card action: stays review until the rotate check; criteria corrected.

## 6. Messages and accounts

### MAZER-UI-021: which errors reach the message toast
- Accepted: keep remote sync silent; boot errors stay on the splash; toast only the service worker warning that the offline cache could not update.
- Follow-up build card: that warning toast (new card, planning).
- Card action: MAZER-UI-021 completes (decision only; criteria corrected).

### MAZER-ACCT-031: failure code a player can read
- Accepted: a small line under the failure message with the short code only, no personal data.
- Card action: stays planning as the build card; blocker cleared.

### MAZER-ACCT-029: say a username is taken
- Accepted: yes for sign-up (the leaderboard already shows names); keep the generic database error vague. The Fitness patch is a separate Fitness card.
- Card action: stays review (merged on the account site, not yet live); blocker cleared.

### MAZER-ACCT-034: backfill the stored display name
- Accepted: do not run it; it overwrites names players may have chosen. Card action: deferred_candidate (will not do).

### MAZER-ACCT-004: reset epoch across devices
- Accepted: accept the residual risk for version one; no database change. Card action: deferred_candidate.

## 7. Economy, AI, runs, challenges

| Card | Accepted | Card action |
| --- | --- | --- |
| MAZER-ECON-001 | Defer signing the shop and item economy until the hazard contract is settled; no phase 1 work depends on it | deferred_candidate |
| MAZER-ECON-002 | Waits on ECON-001 | deferred_candidate |
| MAZER-ECON-003 | Waits on ECON-001; the install gate revisit rides on it | deferred_candidate |
| MAZER-AI-002 | Waits on the economy contract | deferred_candidate |
| MAZER-RUN-003 | Leave it; low priority and the leaderboard side is provider-gated | deferred_candidate |
| MAZER-CHAL-001 | Park until the economy and hazard contracts are settled | deferred_candidate |
| MAZER-AI-001 | Drop remote run retention; thresholds and checker landed in PR #479 | completes |

## 8. Performance

### MAZER-PERF-004: draft trail cache PR
- Accepted: close the draft pull request (the owner reports no more lag); option D (staggered recolour or worker) stays the follow-up if lag returns.
- Card action: deferred_candidate. Closing the draft pull request itself is a separate action and is not done by this document.

## 9. Governance and umbrella cards

### MAZER-UI-019: UI rework umbrella
- Question: keep it as one umbrella or split into children.
- Accepted: split into three children and close the umbrella; the status report PR #482 landed.
- Follow-up build cards (new, planning): decompose the menu scene; Wave 6 proof surfaces; retire the future-phaser path.
- Card action: MAZER-UI-019 completes (merged status report, no runtime surface; criteria corrected to point at the children).

### MAZER-HAZ-007: turn-synchronous simulation
- Accepted: defer all non-player phases explicitly until the hazard contract is decided; the Phase Status table landed (PR #472).
- Card action: completes with the caveat that non-player phases stay deferred pending MAZER-HAZ-002.

### MAZER-WORLD-001: World Identity maintenance lane
- Accepted: close as completed with a caveat and open one card per concrete defect from now on (PRs #411 and #416 shipped; the PR #416 phone result is not recorded).
- Card action: completes with the caveat.

### MAZER-2D-001: shipping baseline
- No change. The export test and the visual-evidence test cite it; it stays active.

## Reversal

Say "overrule MAZER-XXX-NNN" for any decision above. Reversal is a new board event plus, where a build card already exists, a status change on it; nothing in this record is irreversible and nothing here touched code or data.
