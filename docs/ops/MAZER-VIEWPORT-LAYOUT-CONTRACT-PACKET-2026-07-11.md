# Mazer Viewport Layout Contract Packet

Date: 2026-07-11
Status: implemented foundation, browser/mobile reliability cards remain open

## Decision

The reported UI "saving" problem was not persisted panel geometry. Mazer has no supported user-adjustable panel position or size, and no layout-storage schema was found. The defect was competing runtime geometry: CSS dynamic viewport sizing, raw `visualViewport` values, Phaser Scale resize state, and scene layout could observe different dimensions during browser resize or phone rotation.

Decision A applies: raw coordinates, panel dimensions, safe-area values, and canvas sizes intentionally do not persist. They are derived from the active viewport. Existing semantic preferences such as game toggles continue to persist through their existing owner.

## Canonical Authority

`src/boot/viewportGeometry.ts` is the only browser geometry owner for this lane. It creates a normalized snapshot with:

- layout viewport dimensions
- raw visual viewport dimensions, offsets, and scale
- effective content rectangle
- CSS safe-area inset values
- device pixel ratio
- phone-like and landscape classification
- monotonic revision

It coalesces `resize`, `orientationchange`, `visualViewport.resize`, `visualViewport.scroll`, fullscreen, visibility, and Screen Orientation events. A raw visual viewport is used only when it is a normal-scale viewport inside the layout viewport; anomalous emulation/browser-chrome values fall back to the layout viewport. The same snapshot drives CSS custom properties, Phaser resize, scene layout refresh, and visual diagnostics.

## Orientation Policy

Mazer still requests portrait orientation where the platform supports it. The former CSS rotation workaround has been removed. On a phone-like landscape viewport, the runtime sleeps and a single accessible shell blocker asks the player to rotate back to portrait. The application itself is never rotated and desktop landscape remains a normal desktop layout.

Browsers cannot universally force physical rotation. The fallback is intentionally honest: block gameplay safely, preserve state, and resume only when portrait geometry is restored.

## Reproduction And Proof

The deterministic transition was `390x844 -> 844x390 -> 390x844` at DPR 2.

Before the contract, the final portrait frame could retain landscape-derived canvas/board geometry and the app used a `rotate(90deg)` workaround. After the contract:

- portrait initial and restored effective content are both `390x844`
- portrait canvas backing is `780x1688` at DPR 2
- the restored board is `48,237 294x294`
- app transform is `none`
- phone landscape shows the rotate-device blocker with no CSS rotation
- portrait restores the normal app and clears the blocker
- visual diagnostics report no offscreen or board/badge/HUD/control overlap violations

Evidence:

- `tmp/captures/mazer-viewport-repro/transition-final-2026-07-11T01-57-44-819Z/`
- `tmp/captures/mazer-viewport-repro/badge-optical-2026-07-11T01-56-49-151Z/`
- `tmp/captures/mazer-ui-surfaces/2026-07-11T06-12-39-735Z/`

The last packet manually inspected menu Options and Pause. It found and fixed the remaining Pause toggle-description overflow by using concise second-row copy and reserving text padding in the fit width. The mobile progression badge now reserves glyph descent space and applies a portrait-only optical baseline offset so bitmap glyph pixels stay inside the frame.

## Rejected Approaches

- Persisting raw geometry: incorrect because the UI has no supported free-positioning intent and viewport-derived values become stale.
- Per-overlay viewport listeners: rejected in favor of one boot owner and a scene subscriber.
- CSS app rotation: rejected because it does not lock a device and produces inverted geometry/input assumptions.
- Fixed one-resolution offsets: rejected in favor of normalized geometry and responsive layout math.

## Verification

- Focused viewport/layout packet: `81` tests passed.
- Portable legacy-fixture and source-contract packet: `28` tests passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run verify` passed: `39` files and `313` tests, then production bundle build.
- `npm run visual:ui-surfaces -- --label viewport-contract-pause-copy-fit --auth-fixture authenticated --viewport 390x844 --device-scale-factor 2 --no-preview --skip-build --base-url http://127.0.0.1:4174` passed.

No Vercel production deployment or promotion was performed.

## Follow-On Work

- Extend the transition matrix to desktop maximize/restore and real device browser-chrome changes.
- Add route-aware guest/auth/play/pause transition coverage at `360x720` and `405x958`.
- Move the browser-layout card from investigation to normalized responsive layout only after those matrices pass.
- Advance the mobile shell card only after maintained device-harness coverage proves the safe-area/orientation behavior outside emulation.
