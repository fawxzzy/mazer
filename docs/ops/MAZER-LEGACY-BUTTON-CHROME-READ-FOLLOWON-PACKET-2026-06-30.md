# Mazer Legacy Button Chrome Read Follow-On Packet

Date: 2026-06-30
Lane: legacy Unreal truth -> web app reset/port
Module: menu screenshot composition and board presentation
Slice: front-door button chrome follow-on
Marker: held at `89%`

## Why this packet exists

After the single-browser diagnostics panel stopped covering the desktop `Exit` button, the next visible lower-shell miss became easier to read.

Compared with `legacy/screenshots/menu-03.png` and `legacy/screenshots/menu-04.png`, the current front-door buttons still read a little too washed out:

- side labels were too faint in the maintained browser
- button outlines did not hold up strongly enough against the purple field

This was a bounded button-chrome ownership problem, not a board-geometry or demo-route problem.

## Landed scope

- tightened only `src/legacy-runtime/legacyMenuButtonChrome.ts`
- slightly strengthened:
  - base box alpha
  - stroke alpha
  - label alpha
  - stroke color
  - label green
- extended proof in:
  - `tests/reset/legacy-menu-button-chrome.test.ts`

## Boundaries preserved

- no board silhouette mutation
- no title lockup mutation
- no demo-route mutation
- no gameplay mutation
- no extra localhost browser

## Proof

Ran clean:

- `npm run test -- tests/reset/legacy-menu-button-chrome.test.ts tests/reset/legacy-menu-layout.test.ts`
- `npm run lint`
- `npm run build`

Live proof:

- reloaded the single maintained `http://127.0.0.1:4173/?runtimeDiagnostics=1` browser tab
- temporarily widened the same tab for desktop proof
- confirmed the front-door labels and outlines read a little stronger without reopening other menu modules

## Marker decision

No marker ratchet.

Reason:

- this is a real proof-backed screenshot-composition improvement
- but it does not honestly close the last screenshot-grade menu composition gap by itself
- the repo-wide legacy completion marker remains `89%`

## Next honest slice

- if the next visible miss is still screenshot-grade board geometry, continue in `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next visible miss is still demo reset/backtrack exactness, continue in `src/legacy-runtime/legacyMenuDemoLifecycle.ts` / `src/domain/ai/demoWalker.ts`
