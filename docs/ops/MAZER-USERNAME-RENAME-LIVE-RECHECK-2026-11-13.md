# Username rename plus reload, live recheck (MAZER-ACCT-033)

Date: 2026-11-13. Surface: the live site `https://mazer.fawxzzy.com` (bundle `assets/main-CgjfEqSb.js` at the time of the run). Headless only: nothing was checked on a real phone.

## What was checked

The card's open criterion: "Rename plus reload re-checked on the deployed build". PR #487 makes the menu header read the saved profile name once after sign-in, so it matches the Leaderboard after a reload. Before it, the header reverted to the old sign-in name after a reload.

Scenario, run by `scripts/analysis/verify-username-rename-live.mjs --mode rename`:

1. Open the app as an installed app (display-mode standalone and `navigator.standalone` emulated, so the install gate does not hide the menu).
2. The signed-out launch is redirected to the account host; the script logs in there as the standing QA account `mzr-qa-1112` and the host hands back to Mazer. No other entry to the app is used.
3. Read the header label and the pinned "You" row on the Leaderboard.
4. Leaderboard, `Edit name`, type `qa-ren-1113`, Save (the real `mazer_set_username` call).
5. Back to the menu: read the header (same session).
6. Reload the page: read the header and the Leaderboard row again.
7. Rename back to `mzr-qa-1112` the same way, reload, read both again (the read-back).

The new name starts with different characters from the QA name inside the visible part of the phone header (`mzr-qa...` versus `qa-ren...`), so the check cannot pass by accident. The phone header truncates the name with an ellipsis; a name counts as shown when the label equals it or is its prefix plus an ellipsis.

## Result

| Step | Phone 390x844 @ DPR 3 | Desktop 1280x720 |
| --- | --- | --- |
| Signed in, before | header `mzr-qa...`, You row `mzr-qa-1112` | header `mzr-qa-1112`, You row `mzr-qa-1112` |
| After save, same session | header `qa-ren...`, You row `qa-ren-1113` | header `qa-ren-1113`, You row `qa-ren-1113` |
| After reload | header `qa-ren...`, You row `qa-ren-1113` | header `qa-ren-1113`, You row `qa-ren-1113` |
| After renaming back and reload | header `mzr-qa...`, You row `mzr-qa-1112` | header `mzr-qa-1112`, You row `mzr-qa-1112` |

All checks passed on both viewports: the header follows the rename in the same session, it does not revert to the old sign-in name after a reload, and the QA name was put back and read back. Both `mazer_set_username` calls answered 200 each run and the page logged no console errors. A final read-only run after both rename runs again showed `mzr-qa-1112` in the header and on the You row.

The finding of 2026-11-13 (header reverted after a reload) is therefore fixed on the deployed build: PR #487 works against the live profile call, not only against a mocked one.

## Header layout note

On the build that was live during this run the main-menu header still shows the username at the top left (the account icon, the name, then the title). Another lane is changing that header (the online counter replaces the username). When it ships, the script's header check reads whatever label is in the header band, and the Leaderboard "You" row stays the surface that carries the saved name, so the rename and read-back checks keep working; the header-follows checks would then need the label that replaces the name.

## Safety

- Only the QA account was signed in and renamed; no account was created, no SQL was run, no secret was printed (the password is read from the local credential blob and only typed into the host login field).
- The script refuses to rename unless the You row shows the QA name, and its `finally` block always renames back and reads it back. `--mode restore` repairs an interrupted run.
- Read-only: `--mode read-only` signs in, reads, and changes nothing.

## Not checked

- A real phone. Headless Chrome with phone emulation is not an installed app on a device, and the touch keyboard path was not exercised.
- The shared sign-in name itself, which the card leaves as an owner identity decision.

## Evidence

Screenshots (phone images are the 390x844 @ DPR 3 captures scaled to half size): `evidence-username-rename-live-2026-11-13/`. `result-rename-phone.json` and `result-rename-desktop.json` hold the step and check records.

Re-run: `node scripts/analysis/verify-username-rename-live.mjs --mode rename --viewport both --out <dir>`.
