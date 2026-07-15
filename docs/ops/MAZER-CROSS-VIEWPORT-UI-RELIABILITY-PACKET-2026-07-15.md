# Mazer Cross-Viewport UI Reliability Packet — 2026-07-15

## Outcome

Mazer now keeps one live viewport authority across phone browser-chrome changes,
desktop maximize/restore, and the return to a compact play surface. The fix is
shared by menu, Options, active play, and Pause; it does not add per-screen or
per-screenshot offsets.

The card remains non-terminal until the repaired build is exercised on a
physical iPhone installed-PWA/browser-chrome path. Maintained browser proof is
complete for `360x720 -> 1440x900 -> 360x720 -> 405x958`.

## Physical iPhone changed evidence

Seven operator captures on 2026-07-15 reopened the visual closeout without
invalidating the live viewport owner. They proved separate component defects:

- the play run-status panel could shrink below its text while the menu panel
  used a different width and field set
- Options and Pause did not share the same scroll-body/pinned-footer rhythm
- the player guide could draw a nearly empty clipped panel fragment and did
  not reserve the scroll rail from its content width
- described toggle rows and Move Speed placed text and controls too close to
  their borders
- purple page and Phaser shell colors remained visible above and below the
  normalized canvas on a physical phone

The follow-up keeps the viewport authority intact while repairing those shared
components. The seven original photos remain immutable external evidence in the
current Mazer task attachment set.

## Root Cause

Two values owned by the browser were accidentally converted into published
application state after the first viewport snapshot:

- the resolver preferred `documentElement.clientWidth/clientHeight`, while the
  document element itself was sized from the previously published Mazer content
  rectangle; maximize/restore could therefore read its own stale output
- the resolver read `env(safe-area-inset-*)` through the public
  `--mazer-safe-area-*` variables and then overwrote those variables with fixed
  pixels; later orientation or browser-chrome changes could no longer expose a
  new environment inset

The document now remains browser-sized, the resolver prefers live window layout
dimensions, and environment-owned safe-area variables remain separate from the
published Mazer CSS contract.

## Maintained Proof Correction

The viewport-transition runner previously treated deliberately skipped
Options/Pause bottom captures as missing product surfaces and also gated the
layout matrix on an unrelated random wrap-topology sample. Transition mode now:

- records the bottom surfaces as intentionally skipped
- excludes bottom-only assertions when those surfaces were not captured
- leaves wrap topology to its dedicated architecture/browser gate
- continues to require menu, Options, play, and Pause transition restoration,
  bounds, collision, material, console, and page-error checks

## Operator Checklist Reconciliation

- `landed` — one shared live geometry owner drives CSS, Phaser, scene layout,
  board, HUD, controller, and overlay surfaces
- `landed` — desktop maximize/restore no longer observes document dimensions
  derived from an earlier Mazer content rectangle
- `landed` — safe-area values can change after the first published snapshot
- `landed` — compact play board, HUD, controller, and Pause remain inside the
  same safe content rectangle after a wide-screen round trip
- `landed` — route-aware menu, Options, play, and Pause transition proof covers
  `360x720`, `1440x900`, restored `360x720`, and endpoint `405x958`
- `blocked` — post-fix physical iPhone installed-PWA/browser-chrome proof still
  requires the repaired preview on a real device; emulation is not relabeled as
  physical evidence

## Verification

The physical-evidence follow-up checklist is also reconciled:

- `landed` - menu and play render the same two-row time/rank/score/maze-level
  component; the play instance fits its measured lane beside Pause
- `landed` - Options and Pause use a shared scroll-body/pinned-footer
  composition, with the guide and control rows inside the same measured gutter
- `landed` - Move Speed owns separate title/value and slider lanes; described
  toggles have enough height for their second line
- `landed` - body, app, Phaser, theme, and install backgrounds use one near-black
  safe-area color instead of the purple fallback field
- `blocked` - a fresh physical iPhone capture of this follow-up build is still
  required; the seven operator captures are failure evidence, not passing proof

- Focused viewport/layout/proof-harness gate: `57/57` tests passed.
- Full repository verification passed `360/362` tests in the serial run; the
  only two misses were fixed-timeout AI/generation tests. Their exact isolated
  rerun passed `11/11`, yielding correlated `362/362` coverage.
- TypeScript: `npm run lint` passed.
- Production bundle: `npm run build` passed.
- Maintained transition capture: passed, including exact restored diagnostics,
  no layout issues, no console warnings/errors, and no page errors.
- In-app browser active-play proof at `390x844 -> 1440x900 -> 390x844`:
  - viewport revisions advanced `1 -> 2 -> 3`
  - restored board render bounds: `38,98 314x314`
  - restored HUD bounds: `139,10 112x38`
  - restored control frame: `99,535 193x193`
  - restored diagnostics matched the initial compact geometry exactly
  - offscreen and overlap violation lists stayed empty
- Restored Pause proof at `390x844` kept the overlay panel inside
  `20,58 350x770`, disabled play input/timer, and hid play controls.
- Follow-up in-app browser proof at `390x844`:
  - menu and play run-status panels both resolved to `236x58`
  - play status text fit inside `34,13 236x58` beside Pause at
    `294,10 86x35`
  - Options guide resolved to `40,156 290x232`; its content and pinned `Log out`
    footer were visible, and the final no-overflow facade path suppresses the
    fake scroll rail
  - Pause reached exact scroll max `244`; all six described toggles and Move
    Speed stayed inside `44,170 302x528`, while fixed actions stayed reachable
  - body and app computed backgrounds were both `rgb(2, 8, 15)` and the capture
    showed no purple top/bottom bands
- Final deployed preview `dpl_EhUgoVRq8V1X43h6x6aQirPx6Q28` was `READY` at
  `https://fawxzzy-mazer-ntcdngn51-fawxzzy.vercel.app`:
  - Options reported `contentHeight=600`, `enabled=false`, and truthful
    `track=null` / `thumb=null` diagnostics
  - active play reported `236x58`, two-row status text with `textFits=true`
  - Pause reported real overflow with `maxOffset=244`; at exact max, Move Speed
    kept separate label/value and slider lanes while all fixed actions remained
    reachable
  - the only console noise was Vercel deployment-protection manifest/JWT access;
    no application runtime error was observed

Durable local capture:

- `C:/ATLAS/tmp/captures/mazer-ui-surfaces/2026-07-15T07-57-26-575Z/report.md`
- `C:/ATLAS/tmp/captures/mazer-ui-surfaces/2026-07-15T07-57-26-575Z/summary.json`
- `C:/ATLAS/tmp/captures/mazer-ui-pr72-2026-07-15/mazer-ui-pr72-final-preview-options-390x844.png`
- `C:/ATLAS/tmp/captures/mazer-ui-pr72-2026-07-15/mazer-ui-pr72-final-preview-pause-bottom-390x844.png`

The archived `tests/scenes/demo-build.test.ts` suite still contains unrelated
expectations for a removed presentation prototype. Its focused shell-CSS
contract assertion passes; the retired prototype failures are not treated as
viewport regressions.

## Post-Work Review

- Scope is limited to shared viewport authority, base shell sizing, maintained
  transition proof, focused tests, and this receipt.
- No gameplay topology, persistence schema, account data, Supabase data,
  secrets, or production deployment was changed.
- `tests/ai/demo-walker.test.ts` is untouched.
- No DiscordOS full-board/config-wide sync is permitted or required.
- The exact board target is `mazer-cross-viewport-ui-reliability`, thread/starter
  `1525337748830031875`.

## Remaining Terminal Proof

Exercise the preview on a physical iPhone in Safari and installed-PWA display
mode while expanding/collapsing browser chrome. Capture menu, play, and Pause
with the Dynamic Island/home-indicator safe areas visible. If those surfaces
retain the shared content rectangle, this card can move from in-progress to
Completed; otherwise the device evidence reopens only the shared viewport owner.
