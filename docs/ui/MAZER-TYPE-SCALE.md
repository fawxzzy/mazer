# Mazer type scale (MAZER-UI-010)

Adopted 2026-11-14 on the decision record pick 1. Source of truth in code:
`src/render/typeScale.ts`. Ratchet: `tests/render/type-scale-ratchet.test.ts`.

## Faces
- Body: Space Grotesk (unchanged, `public/fonts/space-grotesk/`).
- Display: Oxanium, one squared techno face (`public/fonts/oxanium/`, SIL OFL 1.1). Short uppercase labels only; never sentences. Lazy-loaded with `font-display: swap`, no preload, not awaited at boot.
- The tile-font title (START wordmark) is separate and untouched.

## Scale
| Role | Size | Weight | Face | Use |
| --- | --- | --- | --- | --- |
| caption | 12 px | 500 | body | Secondary lines, hints, footers |
| body | 14 px | 400 | body | Sentences, descriptions, list rows |
| control | 16 px | 600 | display, uppercase | Button and tab labels, toggle names |
| heading | 20 px | 600 | display, uppercase | Panel and sheet headings |
| title | 28 px | 700 | display, uppercase | Screen titles |
| display | 40 px | 700 | display, uppercase | Run result and rank figures |

## Rules
- Floor: body copy never renders below 12 px, including at 320 px wide. Narrow widths wrap or shorten the copy, they do not shrink it.
- State text (On/Off) is always its own element next to the label, never merged into one string.
- Label formats do not change with width.

## Migration state
PR 1 (this one): scale constants, display font loaded (not yet used), ratchet. No surface changed. Sizes still in source outside the scale (9, 11, 13, 15, 18 px) and legacy font stacks are listed as allowlists in the ratchet test; migrations remove entries one surface per PR and the test forces the allowlist to shrink.
