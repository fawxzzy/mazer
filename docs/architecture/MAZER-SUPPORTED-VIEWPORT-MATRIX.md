# Mazer Supported Viewport Matrix

Status: DRAFT for owner review (MAZER-QA-006), 2026-11-12
Scope: which viewports Mazer promises to hold, how they are captured, what that capture does and does not prove.

Labels, never merged: **DOCUMENTED FACT** (read or run in this repo on 2026-11-12), **OBSERVATION** (seen in a capture, cause not confirmed), **PROPOSAL**, **NOT VERIFIED**.

## 1. The matrix (**PROPOSAL**, pinned by test)

The matrix is the `supported` preset group in `scripts/visual/layout-matrix.config.mjs`. It is a new group: `core`, `extended`, `platform` and `all` (14 viewports) are unchanged and stay pinned by `tests/visual/layout-matrix-config.test.ts`.

| id | Size (CSS px) | Why it is in the matrix |
| --- | --- | --- |
| `phone-320` | 320x568 | Smallest phone width worth holding (iPhone SE class). Hardest case for HUD, title and button fit. |
| `phone-360` | 360x800 | Most common compact Android width. |
| `phone-portrait` | 390x844 | Reference phone; the owner's design target and the width the 2026-07-11 viewport contract proved. |
| `phone-tall` | 430x932 | Largest common phone width (Plus / Max class). |
| `phone-landscape` | 844x390 | A phone turned sideways. |
| `phone-rotate-back` | 844x390 then 390x844 | Same page loaded in landscape, resized to portrait before capture. Reproduces "rotate and come back". Implemented as `rotateFrom` on the viewport, handled in `scripts/visual/capture-layout-matrix.mjs`. |
| `tablet-portrait` | 768x1024 | Smallest tablet width. |
| `desktop` | 1440x900 | Desktop browser. |

Frozen by the owner and not touched here: board size and zoom (25x51 phone, 45x27 desktop), tile style B "Chip", dark neon look, no hazards.

## 2. How to capture (**DOCUMENTED FACT**)

```
npm run visual:matrix -- --preset supported --route "/?runtimeDiagnostics=1&authFixture=authenticated"
```

- Headless Chromium (Edge channel, then bundled Chromium fallback), device scale factor 1, dark colour scheme, reduced motion. Output goes under `<stack root>/tmp/captures/mazer-layout-matrix/<run>/` (`full/`, `gameplay/`, `metadata/`, `summary.md`, `contact-sheet.png`).
- Each capture is checked by a screen contract (route, mode, overlay, viewport size) and fails rather than saving a wrong screen.
- Without `authFixture=authenticated` an offline run can race the sign-in gate: the first attempt on 2026-11-12 passed `phone-320` and then failed `phone-360` with `screen_overlay_mismatch:none->auth`. That is the existing sign-in gate appearing after the first diagnostics read, not a layout fault, so use the authenticated fixture route for evidence runs. The explicit route replaces the per-viewport default route (mobile profile for phones), so the profile is auto-detected.

## 3. Evidence, run `qa006-supported-auth-20261112` (**DOCUMENTED FACT**, headless, one frame per viewport)

All eight captures passed the screen contract (mode `menu`, overlay `none`, viewport size equal to the requested size) and reported zero offscreen-bounds and zero overlap violations in the layout integrity diagnostics.

| Viewport | Board bounds (left,top WxH) | Tile px | Maze shape |
| --- | --- | --- | --- |
| phone-320 (320x568) | 10,9 300x550 | 11.5 | vertical, 47 rows |
| phone-360 (360x800) | 18,77 324x646 | 12.4 | vertical, 51 rows |
| phone-portrait (390x844) | 19,70 352x704 | 13.6 | vertical, 51 rows |
| phone-tall (430x932) | 28,84 375x765 | 14.4 | vertical, 51 rows |
| phone-landscape (844x390) | 65,20 714x350 | 13.5 | horizontal, 25 rows |
| phone-rotate-back (390x844) | 11,328 368x188 | 7.1 | **horizontal, 25 rows (see 4.1)** |
| tablet-portrait (768x1024) | 51,41 667x943 | 22.5 | vertical, 41 rows |
| desktop (1440x900) | 45,45 1350x810 | 29.5 | horizontal, 27 rows |

Maze shapes come from the menu demo at progression level 1, which is a straight corridor along the longer axis. The corridor makes orientation easy to read in the screenshots.

## 4. Findings

1. **OBSERVATION, rotate-back keeps the landscape maze.** After loading at 844x390 and resizing the same page to 390x844, the layout and viewport diagnostics are correct (`390x844`, no violations), but the board is still the horizontal 51x25 maze at 7.1 px tiles in a 368x188 box, centred in a tall portrait screen, instead of the vertical maze the portrait width gets on a fresh load (13.6 px tiles, 352x704). The maze shape is picked from the viewport at generation time, so this is probably the existing maze surviving until the menu demo regenerates it. That was not confirmed (the capture is one frame; no wait for the next maze). The 2026-07-11 viewport packet proved geometry and blocker behaviour on this transition, not the maze shape. Proposed follow-up: check whether regeneration after a rotation happens within an acceptable time, and decide whether a resize that flips orientation should regenerate or rescale the menu maze.
2. **Limit of the matrix: phone landscape is not exercised as a phone.** The capture context has no touch or mobile emulation, so the runtime reports `isPhoneLike: false` at 844x390 and renders the desktop-style landscape layout. The "rotate device" blocker from the viewport contract (phone-like landscape sleeps the runtime and shows a shell blocker) is therefore not exercised by this tool. The blocker was proven on 2026-07-11 with a different harness. Closing that gap needs a touch/mobile context option in `capture-layout-matrix.mjs` (not done here).
3. **Limit: one frame.** Each viewport is captured once after diagnostics settle. Pause, Options and win overlays are covered by `npm run visual:ui-surfaces` and the 2026-07-15 transition matrix (`360x720`, `1440x900`, restored `360x720`, `405x958`), not by this group.

## 5. What this matrix does not prove (**NOT VERIFIED**)

- Real devices. Nothing here ran on a phone, in an installed PWA, or in iOS Safari.
- Device pixel ratios other than 1, browser chrome, the on-screen keyboard, safe-area insets (the diagnostics report all insets as 0 here) and OS font scaling.
- Rotation on a real phone, including pause and resume across a rotation.

## 6. Card acceptance (MAZER-QA-006)

| Criterion | State |
| --- | --- |
| UI holds across the supported viewport matrix | Matrix defined, pinned and captured once in headless Chromium with no layout-integrity violations; one open observation (4.1). Not device-proven. |
| Layout state survives reload | **Recommend dropping.** Decision A (2026-07-11, `docs/ops/MAZER-VIEWPORT-LAYOUT-CONTRACT-PACKET-2026-07-11.md`): no panel geometry persists; sizes, offsets and safe areas are derived from the live viewport. Mazer has no user-adjustable layout, so there is no layout state to survive a reload. Semantic preferences (game toggles) already persist through their own owner. The owner decides; this document does not edit the card. |
| Real-device checks are recorded | **Open, needs a device.** See section 7. |

## 7. Device checks for the owner (iPhone)

1. Open the installed Mazer on the phone in portrait; start a level and pause it.
2. Rotate to landscape. Expected: gameplay sleeps behind a single "rotate back to portrait" blocker and the app is not rotated.
3. Rotate back to portrait. Expected: the blocker clears, the paused state is intact, and the board is portrait-sized and readable. Note how long the menu maze takes to return to a portrait-shaped board (finding 4.1).
4. Repeat from the menu without pausing.

## 8. Tests that pin this

- `tests/visual/layout-matrix-config.test.ts`: pins the `core` set, the `supported` set (ids, sizes, `rotateFrom`), and that `all` stays 14 viewports without any supported-only id. **CI does not run this file** (`npm test` does not list it and `.github/workflows/verify.yml` lists only `tests/visual/maze-lifecycle-analysis.test.mjs` from that directory); run it with `npx vitest run tests/visual/layout-matrix-config.test.ts`.
- `tests/architecture/supported-viewport-matrix-guard.test.ts`: a CI-run copy of the pin (the `tests/architecture` directory runs in CI and in `npm test`) that also requires this document to list every supported viewport id and size.
