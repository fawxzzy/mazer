# Mazer Legacy Menu Connected Light-Core Material Packet

Date: 2026-07-01
Mode: owner-repo implementation
Branch: `codex/mazer-pass2-menu-parity`

## Intent

Move the fixed front-door menu board closer to restored legacy screenshot material roles without changing the menu maze silhouette.

The visible miss was that the current web board still read as a dark tiny-grid/checker surface. Restored screenshots show a stronger light-gray corridor role over darker wall/slab fields.

## Changes Landed

- Shifted menu static-board role colors toward light-gray connected corridor cores and darker wall/slab fields.
- Kept dark trench edge strokes for depth.
- Changed menu static-board rendering so edge strokes remain segment-based, while the light corridor core uses connected frame math to reduce the dotted checker read.
- Updated `tests/scenes/menu-render-frame.test.ts` to lock the new split:
  - segment-based dark edges
  - connected light cores

## Proof

Focused proof:

```bash
npm run test -- tests/scenes/menu-render-frame.test.ts
```

Observed result:

```text
19 files passed
96 tests passed
```

Build proof:

```bash
npm run build
```

Observed result:

```text
built successfully
```

Localhost proof:

- desktop capture: `C:/ATLAS/tmp/mazer-menu-material-connected-core-desktop-2026-07-01.png`
- mobile capture: `C:/ATLAS/tmp/mazer-menu-material-connected-core-mobile-2026-07-01.png`
- browser console errors: none

## Marker Re-Evaluation

Touched marker segment:

- `Menu screenshot composition and board presentation`

Current points before packet:

- `6 / 14`

Current points after packet:

- `6 / 14`

Repo-wide marker remains:

- `70 / 100`

Reason:

- The board material role is closer to restored screenshot truth.
- The board still differs in exact corridor density, slab relief, title-over-board composition, and full screenshot-grade parity.
- This is a useful material packet, not a segment closure.

## Boundaries Preserved

- No deploy.
- No app-resource mutation.
- No menu layout rewrite.
- No maze silhouette rewrite.
- No 1:1 percent ratchet.
