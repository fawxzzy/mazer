# Mazer Legacy Procedural Menu Title Composition Packet

Date: 2026-07-02
Repo: `C:\ATLAS\repos\mazer`
Branch: `codex/mazer-pass2-menu-parity`

## Scope

Tighten only the live procedural menu title composition after the main menu moved from the fixed snapshot fixture to `menu-generated` procedural boards.

## Change

- `src/legacy-runtime/legacyMenuTitle.ts` now distinguishes `snapshot` and `procedural` menu title surfaces.
- `src/scenes/MenuScene.ts` passes `procedural` only when the active maze source is `menu-generated`.
- Ultra-narrow procedural menu boards use a tighter title cap and slightly lower title alpha so the generated 49-cell maze remains readable in the maintained 172px side browser.
- Fixed screenshot snapshot fixtures keep the existing title scale contract.

## Proof

- `npm run test -- tests/reset/legacy-menu-title.test.ts tests/reset/legacy-menu-layout.test.ts tests/scenes/menu-render-frame.test.ts`
- `npm run build`
- In-app browser reload on `http://127.0.0.1:4173/?runtimeDiagnostics=1&v=1782925533705-route-quality-bound`
- Browser warning/error logs: none
- Settled mobile side-panel proof: full procedural maze rendered, tighter title, readable stacked `Exit` / `Start` / `Options`

## Marker

The 1:1 marker remains `93%`.

Reason: this fixes a maintained-browser composition regression from dense procedural menu boards, but exact live procedural-menu silhouette, final material relief, and screenshot-grade whole-menu composition remain open.

