# Mazer Legacy Portrait Front-Door Fit Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Mode: owner-repo only
Branch: `codex/legacy-web-port-truth`

## Intent

Tighten the narrow-pane / portrait presentation so the current web app keeps more of the legacy front-door composition instead of drifting into an overly productized mobile adaptation.

This packet stayed inside the canonical Mazer web app and did not open any new infrastructure or deployment surface.

## Landed work

- kept the seeded menu demo truth introduced by the recent menu-fit commits
- widened portrait board occupancy in `src/legacy-runtime/legacyMenuLayout.ts`
- lowered the amount of portrait button inflation so `Exit`, `Start`, and `Options` read closer to the desktop legacy composition
- allowed a slightly wider portrait `Start` button instead of forcing exact side-button width parity
- updated `tests/reset/legacy-menu-layout.test.ts` to reflect the tightened portrait fit contract

## Verification

Commands run:

- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`

Latest visual matrix artifact:

- `tmp/captures/mazer-layout-matrix/2026-06-29T02-19-18-545Z`

## Truth after this packet

- the live right-pane/in-app-browser menu fit is materially closer to the legacy front door than the prior portrait layout
- desktop proof remains additive evidence for the same lane and stayed green after the portrait tightening
- no deploy was attempted
- no Supabase surface was created
- no Vercel surface was created
- no duplicate Mazer identity was introduced

## Still open

- exact demo AI parity
- exact generation/reset-flow parity
- exact play HUD parity
- final screenshot-grade visual parity

