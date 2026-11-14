# Headless phone sweep (MAZER-QA-009), 2026-11-14

Run: `node scripts/visual/phone-emulation-sweep.mjs --base-url http://127.0.0.1:4313 --out DIR` against a dev server of origin/main
(sections: boot, motion, standalone, lifecycle, fps, levels, touch, acct013). Chromium 390x844@3, 360x740@3, 412x915@2.625, 393x851@2.75,
touch, mobile UA, Android UA for ACCT-013. Screenshots were looked at, not only measured. **Nothing here was run on a real phone.**
The remaining real-device steps are in `docs/ops/MAZER-PHONE-CHECKLIST.md`.

Emulation facts: Playwright/CDP cannot set `display-mode`, so an "installed" context is faked as the app reads it (`navigator.standalone` and a
`matchMedia('(display-mode: standalone)')` override). The ACCT-013 callback is served on the canonical origin (`https://mazer.fawxzzy.com`) from the
local dev server, because any other origin is rejected as a malformed callback (`invalid_state`); all other hosts (account, Supabase) were aborted, so no
real provider was contacted and no account was used.

## Results by card

| Card | Exercised | Passed | Headless cannot prove | Verdict |
| --- | --- | --- | --- | --- |
| ACCT-003 | Installed-context boot (standalone faked) with the QA auth fixture; install gate blocks a plain tab and lifts for standalone; sign-in failure copy for in-window / aged / other-context callbacks | gate behaviour; pending record is honoured at 6 min; code exchange is attempted (reaches `exchange_unavailable` copy, not a state error) | real sign-in, real session refresh, real progress hydration from the account, two real accounts (cross-user isolation), password recovery email, whether the real handoff keeps the app standalone | still needs device (checklist 1-3, 6, 7, 18, 23) |
| ACCT-013 | Android UA, pending record aged 6 min and 16 min, callback with no pending record, callback in a plain tab | 6 min: not rejected for age; 16 min: "Sign-in took too long" (window is 15 min); no pending record: "came back to a different screen" with `Code: invalid_state`/missing-state class; plain tab: install gate shows and the pending record is left unconsumed | the real Android installed-vs-Chrome-tab storage behaviour, the real provider redirect timing | still needs device (checklist 2, 4, 5). Card step 3 text is out of date: since PWA-007 a tab never exchanges the code, so the "different screen" message is not what the owner will see in that flow |
| MOTION-008 | Reduce Motion off and on (system media query), 6 samples over about 6 s of the play board, Settings sheet | flag reads on/off correctly; board pixels still change under reduce; Settings sheet shows the Reduce Motion row and copy | how real Android/iOS surface the OS setting, felt smoothness | can move to review as headless-verified for the code path; checklist 8-12 still needed on the phone |
| MOTION-004 / 005 | Same as above | gate works; no console errors in either mode | crossfade feel, the held-still dock band and stick orbit as seen on a phone | closure is the device step only (checklist 10-12); nothing code-side is open |
| QA-001 | 4 profiles boot, no horizontal overflow, canvas fills the viewport at each DPR; play board screenshot per profile; hidden/visible events; offline then online; rAF sampling; CDP touch drags; levels 60, 100, 190 load and are solvable | all of those, zero console/page errors | real frame rate (headless software GL ran about 24-28 fps with a 33 ms median, a canary only), finger feel, pixel crispness, iOS home-screen gap, hardware back, true OS backgrounding, felt difficulty | still needs device (checklist 13-22). Levels 60/100/190 are only reachable on a device by playing there: `?previewLevel` is a dev route behind the install gate |
| VIS-018 | Reduce Motion off vs on, mean colour of the saturated trail/board pixels over about 6 s | with Reduce Motion off the mean shifts by about 49 RGB units; with it on, about 1 unit | the owner's phone model and settings | still needs device. Strong lead: under Reduce Motion the trail colour moves so slowly it reads as static, which matches the report. Needs the owner's settings (checklist 8-10) before any change |

## Findings

- Reduce Motion keeps the trail colour shifting only barely (about 1 of 255 per colour channel over 6 s in this sample, against about 49 with it off). Owner rule 2026-11-12 says colour keeps shifting. Whether that is "visibly shifting" on a phone is the open VIS-018 question; a follow-up card would tune the reduced-motion trail colour period if the phone confirms it looks frozen.
- ACCT-013 card step 3 expects the different-screen message when a sign-in is finished in a Chrome tab. After PWA-007 the tab shows the Install screen and leaves the pending record in place, so that message only appears when the callback reaches a context with no pending record.
- A callback on any origin other than `https://mazer.fawxzzy.com` is reported as `invalid_state` (different screen), which is correct but easy to hit in local tests.

## Reproduce

`npm run dev -- --host 127.0.0.1 --port 4313 --strictPort`, then the sweep command above. Output: `report.json` and per-check PNGs under `--out`.
Add `--assert` to exit non-zero on a failed check, `--only motion,acct013` to run sections.
