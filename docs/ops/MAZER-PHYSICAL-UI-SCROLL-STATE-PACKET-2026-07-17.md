# Mazer physical UI scroll and state packet — 2026-07-17

## Scope

- Existing card: `mazer-cross-viewport-ui-reliability`
- Base revision: `3bd13233dc33fc721f8ccf105d2cc51f1a8dd8d4`
- Bounded outcomes:
  - prevent pause/options scroll boundary decoration from crossing readable text;
  - expose explicit toggle/control state copy on normal phone widths, with a readable inline fallback below that width.

Auth, account data, Supabase, billing, gameplay topology, production deployment, and direct Discord mutation were excluded.

## Root cause and implementation

The overlay scroll facade painted full-width fade rectangles and boundary rules across the content viewport. Text was correctly clipped, but the decorative boundary could still cross the last visible line. The facade now relies on the existing geometry mask for content disappearance and renders only short edge cues inside the reserved scrollbar gutter.

The toggle layout also hid state labels below 380 logical pixels even when the row had enough room for a compact state lane. Normal phone rows now reserve a narrower state lane; exceptionally narrow rows fold the state into the label (`Control Style: Stick`, for example) instead of dropping the state.

The route-aware capture validator was updated to verify the actual gutter-local edge cue contract rather than assuming a full-width fade region.

## Verification

- Focused regression suite: 5 files, 68 tests passed.
- `npm run lint`: passed.
- `npm run verify`: passed; 53 files and 387 tests passed, followed by a successful production-mode build.
- `git diff --check`: passed.
- Protected `tests/ai/demo-walker.test.ts`: unchanged by this worktree.

## Visible proof

Both captures use authenticated fixture state, deterministic maze seed `3749`, and the exact local production build. The unrelated generated-topology visual diagnostic was excluded from these layout-only captures; the full repository verification retained and passed the dedicated topology suites.

- Phone, 405 x 958 at DPR 2: `C:\ATLAS\tmp\captures\mazer-ui-surfaces\2026-07-17T06-01-43-843Z\report.md`
- Desktop, 1440 x 900 at DPR 1: `C:\ATLAS\tmp\captures\mazer-ui-surfaces\2026-07-17T06-02-28-965Z\report.md`

Both reports passed text bounds, text overlap, control spacing, badge fit, scroll affordance, scroll reachability, edge-cue text clearance, button containment/fill, guide containment, console, and page-error checks.

## Preview access note

The previously shared Vercel Preview is Ready but redirects anonymous access to Vercel deployment authentication. That explains why the operator could not reach the app login from that Preview URL. This packet does not change Vercel access controls or application authentication.

## Disposition

This packet is ready for bounded PR review. It does not deploy or mutate production.

## Exact-head review correction

Codex review on `b6dd898cab73e0aefa27a6e990818ade05065733` identified that narrow rows intentionally publish inline state labels such as `Camera Follow: Off` while the capture runner still waited for and validated only the base label. The capture contract now treats either the exact base label or a non-empty `: state` suffix as the same expected control identity. The rule is used by browser-side surface waits, direct diagnostics reads, single-surface checks, and cross-surface checks; unrelated prefixes remain rejected.

Review-fix proof:

- Focused regression: 3 files, 60 tests passed, including direct matcher coverage and a 283-pixel row contract.
- Production-mode build: passed, 228 modules transformed.
- Narrow phone proof, 375 x 812 at DPR 2: `C:\ATLAS\tmp\captures\mazer-ui-surfaces\2026-07-17T06-50-40-864Z\report.md`
- Desktop confirmation, 1440 x 900 at DPR 1: `C:\ATLAS\tmp\captures\mazer-ui-surfaces\2026-07-17T06-51-20-808Z\report.md`

The narrow capture visibly retained `Camera Follow: Off`, `Control Style: Stick`, and `Smart Steering: On`, and all applicable surface, bounds, overlap, scroll, console, and page-error checks passed.

The required full `npm run verify` was attempted once under active ATLAS/DiscordOS machine contention. It completed with 382 passing tests and six unrelated generation/AI timeout failures; an isolated attribution run likewise produced timeout-only failures without assertion mismatches. No timeout or protected test was changed. One pre-merge full `npm run verify` remains required after the concurrent heavy verification processes release and machine contention materially changes. PR #81 must stay draft and unmerged until that changed-environment gate passes or receives an explicit disposition.
