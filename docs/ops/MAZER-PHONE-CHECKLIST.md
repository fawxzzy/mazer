# Mazer phone checklist (MAZER-QA-009)

One ordered list. Only steps that a headless run cannot prove are here. Each step is one action and one expected result.
Do them in order in one sitting; later steps reuse earlier state. Write `pass`, `fail` or `unsure` plus a one-line note beside each.
What was already proven headless, and what it cannot prove, is in `docs/ops/MAZER-QA-009-HEADLESS-PHONE-SWEEP-2026-11-14.md`.

Before you start: an Android phone (Chrome) and an iPhone (Safari) if you have both, two throwaway test accounts (you type the passwords), Mazer open at mazer.fawxzzy.com.

## A. Install and sign in (Android Chrome first)

1. Step: in Chrome, open the Mazer link and tap Install. Expected: the home-screen icon opens Mazer full screen with no browser bar. Closes: ACCT-003 (standalone), QA-001 (installed app).
2. Step: open the installed app and sign in with test account 1. Expected: you land back in Mazer, signed in, still with no browser bar. Closes: ACCT-003, ACCT-013 (step 1).
3. Step: swipe the app away, wait one minute, reopen it. Expected: still signed in and your level is restored. Closes: ACCT-003 (session refresh and progress hydration).
4. Step: tap Sign in, then wait 6 minutes before finishing the sign-in on the next page. Expected: it still completes and you land in Mazer signed in. Closes: ACCT-013 (step 2, the window is 15 minutes).
5. Step: tap Sign in in the installed app, then open the sign-in link in a normal Chrome tab instead. Expected: the Chrome tab shows the Install screen, and the installed app shows no sign-in error. Closes: ACCT-013 (step 3). Note: the card expects the "different screen" message here; since the install gate (PWA-007) the tab never exchanges the code, so a different result than the card says is a card-text fix, not a failure.
6. Step: in Settings tap Sign out, then sign in with test account 2. Expected: you see account 2's level, not account 1's. Closes: ACCT-003 (cross-user isolation).
7. Step: tap Sign in, choose the forgotten-password link, finish the email reset with account 2. Expected: you can sign in with the new password. Closes: ACCT-003 (account recovery).

## B. Motion and trail colour (installed app)

8. Step: write down the phone model, the phone's own "Remove animations" or "Reduce Motion" setting (on/off), and the Settings > Reduce Motion row (System/On). Expected: three values written down. Closes: VIS-018 (criterion 1).
9. Step: with Reduce Motion on System and the phone setting off, press Start and watch the trail for ten seconds. Expected: the trail colour visibly changes while you watch. Closes: VIS-018 (criterion 2).
10. Step: set Settings > Reduce Motion to On, press Start, watch the trail for ten seconds. Expected: the shine and the pulsing stop, and the trail colour still changes (slowly is allowed; note "none" if it looks frozen). Closes: MOTION-008 (criteria 1 and 2), MOTION-004 and MOTION-005 (device step), VIS-018 (criterion 3).
11. Step: with Reduce Motion On, look at the title, the level number and the Start button on the menu for ten seconds. Expected: their colours keep shifting while the settings cog and icons stay lit and still. Closes: MOTION-008 (criterion 2).
12. Step: with Reduce Motion On, start a level and open then close Settings. Expected: the sheet fades in and out in a short crossfade, no sliding. Closes: MOTION-005.

## C. Feel on the real device (installed app, Reduce Motion back on System)

13. Step: drag to play a whole level at level 1 with your thumb. Expected: the player follows your finger with no stalls, and the frame feels smooth. Closes: QA-001 (frame rate, touch feel).
14. Step: look at the board, trail, goal star and locator on the phone screen. Expected: lines are crisp and nothing is blurry or cut off at the screen edges. Closes: QA-001 (pixel density).
15. Step: open Settings and How to play, then close both. Expected: both open and close without layout jumps and the Guide icons match the game. Closes: QA-001 (Settings sheets).
16. Step: press the phone's Back button or gesture while playing. Expected: Mazer pauses or goes to the menu and does not exit the app by surprise. Closes: QA-001 (hardware back).
17. Step: during a run, switch to another app for 30 seconds, then come back. Expected: the game is paused or still where you left it and the board is intact. Closes: QA-001 (real backgrounding).
18. Step: turn on airplane mode in the installed app, then turn it off. Expected: the app keeps running and signs in again without a restart. Closes: QA-001 (offline), ACCT-003.

## D. Difficulty (needs a way to reach levels 60, 100 and 190; see follow-up in the sweep doc)

19. Step: play one maze at level 60. Expected: you can say easier, same or harder than level 30. Closes: QA-001 (felt difficulty).
20. Step: play one maze at level 100. Expected: you can say easier, same or harder than level 60. Closes: QA-001 (felt difficulty).
21. Step: play one maze at level 190. Expected: you can say easier, same or harder than level 100. Closes: QA-001 (felt difficulty).

## E. iPhone Safari (repeat once)

22. Step: in Safari tap Share, then Add to Home Screen, then open the new icon. Expected: Mazer opens full screen with no Safari bar and no black gap at the bottom. Closes: QA-001 (iOS home-screen behaviour).
23. Step: sign in from that icon with test account 1. Expected: you land back in Mazer signed in and it stays full screen. Closes: ACCT-003 (does the handoff keep the app standalone).
24. Step: open Mazer on a phone with rounded screen corners (home-screen icon, menu at rest, nothing running). Expected: all four small corner diamonds are fully visible with their outer tip on the curved screen edge (none cut off by the rounded corner), and the leaderboard and settings icons at the top have clear space from the two top diamonds. Closes: VIS-054 (headless only so far: nothing is device-verified). Note: the MAZER title is a little smaller on tall phones now, so also say if it still reads clearly.

## Report back

Reply with the step numbers and `pass`, `fail` or `unsure`. Each failure becomes one bug card. Nothing is closed from this list until you reply.
