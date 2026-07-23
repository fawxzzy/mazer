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

## Full-gate recovery — 2026-07-22

The authorized low-contention rerun at `d787b44577b22b62d55548a0b01b2680245ca46b` reproduced eight timeouts across five generation/AI files plus two Vitest worker `onTaskUpdate` timeouts. An exact five-file attribution run then passed 77 of 78 tests under the existing limits; the only isolated failure was the edge-dock continuation audit, which took about 5.4 seconds against Vitest's default 5-second limit. No assertion mismatch occurred.

CPU profiling located the dominant cost in `measureAlternativeRouteDistanceWithoutEdge()`: every solution edge allocated a fresh string-keyed `Set`, object queue, and coordinate objects for another full grid traversal. Route-quality measurement now reuses one typed-array BFS workspace and numeric cell indices for the complete measurement. The seed/factory denominator, test timeouts, route-quality rules, and generated-maze contract are unchanged.

Semantics and performance proof:

- exact 20-maze edge-dock fixture denominator: play and generated-menu factories across seeds `3749`, `0x5a17f00d`, `2`, `777`, `1001`, `1`, `3`, `4`, `5`, and `6`;
- aggregate full-snapshot SHA-256 before and after: `fbd4400f614d30e47318685d8468e936f49a9fd7e39a257d573b8fb3419dba0a`;
- fixture generation time in the same owned process: 2,721 ms before and 675 ms after;
- exact five-file timeout denominator after the change: 5 files / 78 tests passed in 46.89 seconds;
- edge-dock continuation audit after the change: 804 ms with the original default timeout;
- shortcut-enabled topology scale-band audit after the change: 2,427 ms with the original 30-second timeout;
- protected `tests/ai/demo-walker.test.ts`: executed but not modified.

The snapshot digest byte contract is:

1. Iterate factories in this exact order: `play` using `createLegacyMaze`, then `menu` using `createLegacyGeneratedMenuMaze`.
2. For each factory, iterate seeds in this exact order: `3749`, `1511518221` (`0x5a17f00d`), `2`, `777`, `1001`, `1`, `3`, `4`, `5`, `6`.
3. Call each factory as `factory(50, seed)` and hash the complete returned snapshot without projection: `sha256(UTF8(JSON.stringify(snapshot)))`, rendered as lowercase hexadecimal. The JSON string has no trailing newline or byte-order mark.
4. For each case, form one ASCII record as `${kind}:${seed}:${snapshotDigest}`. Template interpolation renders every seed in decimal.
5. Join the 20 records in iteration order with a single LF byte (`0x0a`), with no final LF, carriage return, or byte-order mark.
6. Hash that exact UTF-8 aggregate byte stream with SHA-256 and render it as lowercase hexadecimal. Timing fields and console formatting are excluded.

No timeout was increased, no seed or factory was removed, and no production/provider state was touched.

Closure verification:

- focused UI/capture contract: 3 files / 60 tests passed;
- full `npm run verify`: 53 files / 388 tests passed with no worker RPC errors;
- full-gate test phase: 64.74 seconds;
- production build phase: passed, 228 modules transformed in 11.47 seconds;
- total full-gate wall time: 99.05 seconds, compared with the prior 411.4-second failed run.
