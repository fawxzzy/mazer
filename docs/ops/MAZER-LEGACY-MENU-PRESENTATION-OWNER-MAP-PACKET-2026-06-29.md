# Mazer Legacy Menu Presentation + Owner Map Packet

## Scope

- tighten the live front-door presentation toward the archived menu screenshots
- make the repo's whole-application owner map explicit so future 1:1 tweaks target the right surface first
- keep the reset-lane runtime, overlay rules, and fixed menu snapshot lane intact

## Why

After the earlier shell and snapshot passes, the live front door was still missing some of the old screen's feel:

- the title sat too low and too weak inside the board
- the board slab still read thicker and darker than the archived menu plate
- the front-door buttons were still too small and too timid
- the system map was practical, but not yet explicit enough at the whole-application owner level

## Landed

- `src/legacy-runtime/legacyMenuLayout.ts`
  - raised the board slightly on landscape
  - enlarged the board and front-door button footprint
  - raised the title anchor inside the menu board

- `src/scenes/MenuScene.ts`
  - increased title scale and readability while keeping the translucent green treatment
  - lightened the menu maze tones and reduced the slab/shadow heaviness
  - tightened the outer frame mass so it reads closer to the screenshot-era plate
  - increased front-door button text size/readability without replacing the minimal legacy style

- `docs/system-map.md`
  - added a whole-application owner map
  - added a fixed visual-parity workflow so future passes stay bounded by owner surface

- `README.md`
  - now points directly at `docs/system-map.md` in the first-read stack

## Boundaries Preserved

- gameplay truth still comes from `legacy/old-project.zip`
- screenshot truth still comes from `legacy/screenshots/menu-01.png` .. `menu-04.png`
- the fixed menu snapshot remains the menu-only board owner
- generated play mazes remain separate from menu screenshot parity work
- one active overlay at a time is unchanged
- no deploy, infra mutation, or non-Mazer app work happened in this packet

## Validation

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-reset.test.ts`
- `npm run build`
- `npm run visual:matrix -- --preset core --skip-build true`
- live localhost reload in the in-app browser

Latest visual matrix run:

- `tmp/captures/mazer-layout-matrix/2026-06-29T06-58-54-433Z`

## Current Truth After This Pass

- the live menu front door is closer to the archived screen on title placement, board mass, and button readability
- the repo now has a stronger durable map for whole-application editing, not just front-door local tweaks
- exact 1:1 parity is still open, but the remaining work is narrower and easier to target honestly

## Next Honest Slice

- if the next visible miss is board geometry, return to `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next visible miss is shell composition, stay in `src/legacy-runtime/legacyMenuLayout.ts` and `src/scenes/MenuScene.ts`
- if the next visible miss is demo/path behavior, move to `src/legacy-runtime/legacyDemoWalker.ts` and `src/domain/ai/demoWalker.ts`
