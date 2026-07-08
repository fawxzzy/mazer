# Mazer UI Visual System Next Chunk Plan

Date: 2026-07-07
Status: execution receipt and next-plan
Primary marker: `MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md` remains at 100%. This packet is a regression/quality maintenance lane on top of the completed mechanics marker.

## Execution Receipt

Executed state:

- Marker A, Text And Chrome Readability: landed for the current mobile proof route. Phaser text now uses shared UI font/padding defaults and the Phaser renderer is configured for anti-aliased text instead of pixel-art texture generation.
- Marker B, Menu Stack Centering: landed for portrait menu composition. The menu stack now computes board/title/button placement as one group instead of using a fixed top-biased board position.
- Marker C, Maze Visual Language: partially landed as a route-flagged research preset. Default remains `corridor`; `?pathStyle=hybrid` overlays subtle tile-scale cues without changing the default.
- Marker D, Glass Wall And Border System: landed for the current top-down surface with flatter translucent wall/board treatment and retained sigil border.
- Marker F, Verification Harness: landed for the first reusable surface packet through `npm run visual:ui-surfaces`.
- Marker E, Toggle Contract Audit: intentionally deferred beyond the already-fixed trail pulse/menu parity and existing persisted game-toggle checks; next work should audit any newly exposed path/wall/trail visual presets before adding options UI.

Proof:

- `npm run test`: passed `27` files / `175` tests.
- `npm run verify`: passed `27` files / `175` tests plus production build.
- `npm run visual:ui-surfaces -- --skip-build --label ui-surfaces-corridor-asserted-seed3749 --maze-seed 3749`: passed with report at `C:\ATLAS\tmp\captures\mazer-ui-surfaces\2026-07-08T02-16-04-576Z\report.md`.
- `npm run visual:ui-surfaces -- --skip-build --label ui-surfaces-hybrid-asserted-seed3749 --maze-seed 3749 --path-style hybrid`: passed with report at `C:\ATLAS\tmp\captures\mazer-ui-surfaces\2026-07-08T02-16-15-653Z\report.md`.
- `npm run live:play-qa -- --skip-build --label ui-surfaces-final-live-qa --movement-speed 0.38 --move-cap 420`: passed, reached goal in `140` moves at `60 FPS`.

Current visual decision:

- Keep `corridor` as the default. It remains cleaner and less busy.
- Keep `hybrid` behind the URL flag until direct mobile play review says the tile cues help more than they distract.

## Current Evidence

Historical evidence that opened this packet:

Route inspected:

- `/?content=core-only&theme=aurora&runtimeDiagnostics=1&v=stable-compact-proof-1783458877229`
- Viewport: `405x958`, DPR `1`
- Browser console warnings/errors: none

Visual findings:

- Main menu title, board, and buttons are top-biased. The lower half of the screen has large unused empty space.
- Menu button text is clipped or missing leading glyphs. `Start` and `Options` render as partial words in the current proof route.
- Options and pause overlays show severe Phaser text clipping inside labels and state text. This affects `Maze Scale`, `Camera Scale`, `Game Toggles`, toggle labels, toggle states, and `Move Speed`.
- Play board is centered more successfully than menu board. This matches the layout code: play uses a center-oriented board placement while menu uses fixed top-percentage placement.
- Menu and play maze path rendering use the same connected corridor renderer, but they read differently because menu and play have different composition context, title/buttons, and dynamic trail state.
- Dark maze wall cells are already drawn with alpha `0.28`, but the visible effect is not yet strong enough to read as deliberate glass.

Current asserted proof now supersedes those historical findings for the touched route family. Use the execution receipt above when evaluating current state.

## Maze Path Visual Truth

The maze itself is grid/tile based. The player moves from tile to tile.

The current visual renderer does not draw each walkable tile as a full independent square. In `src/legacy-runtime/legacyMenuRender.ts`, walkable cells are expanded into connected corridor segments via:

- `resolveLegacyMenuPathRenderSegments`
- `resolveLegacyMenuPathRenderFrames`
- `resolveLegacyMenuPathStrokeSegments`

That means each visible corridor segment is derived from tile connectivity, but the renderer intentionally hides many individual square boundaries by joining adjacent walkable cells. This is why it feels cleaner and more readable as a maze route, while also making it harder to count exact movement spaces.

The player trail is drawn by a different dynamic tile-stroke renderer. It is closer to showing actual occupied tiles, which is why it feels like a possible visual reference for a more explicit tile map.

## Preset Markers

### Marker A: Text And Chrome Readability

Goal: every clickable label, timer, title, overlay label, and toggle state renders complete text on mobile.

Entry conditions:

- Current screenshots prove clipped/missing glyphs.
- Shared text code path identified: `MenuScene.padLegacyUiText`, `createButton`, toggle rows, inputs, HUD timer, overlay titles.

Exit conditions:

- Menu screenshot shows complete `Exit`, `Start`, `Options`.
- Options screenshot shows complete `Maze Scale`, `Camera Scale`, all toggle labels, all state labels, `Move Speed`, and `Back`.
- Pause screenshot shows complete toggle labels/states and `Back`, `Reset`, `Main Menu`.
- Browser proof includes current route, viewport, screenshots, and no console errors.

Risk:

- Phaser `Text` texture generation can clip glyphs when font, padding, origin, resolution, and canvas scaling interact. Fix should be centralized, not per-label.

### Marker B: Menu Stack Centering

Goal: main menu title, maze, and buttons are centered as one composition, not top-aligned.

Entry conditions:

- `resolveLegacyMenuLayout` currently uses fixed menu board top percentages.
- Play layout already proves a better centered approach is possible.

Exit conditions:

- Portrait menu stack has balanced top and bottom spacing.
- Title does not overlap board.
- Buttons stay readable and reachable.
- Ultra-narrow layout still stacks safely.

Risk:

- Centering the whole menu stack can collide with title height, button height, and ultra-narrow layout. The layout solver should compute the full stack height first.

### Marker C: Maze Visual Language

Goal: decide and implement a readable path style that balances clean corridor shapes with tile-count clarity.

Candidate presets:

- `corridor`: current connected path renderer. Cleanest, least tile-count explicit.
- `tile-square`: every walkable tile drawn as a visible square. Most explicit, likely chunkier.
- `hybrid`: connected corridor base plus subtle tile occupancy cues near player/trail or as low-alpha grid ticks.

Recommended first implementation:

- Add a renderer-level preset behind diagnostics or local setting first.
- Compare screenshots for menu and play before exposing it in the options UI.
- If `hybrid` wins, expose it as `Path Style` later.

Exit conditions:

- Menu and play use the same path visual contract unless intentionally overridden.
- User can visually understand where the player can move without the maze becoming chunky.
- Trail and path no longer feel like unrelated visual systems.

Risk:

- Full tile-square paths may regress the clean maze readability the current connected renderer provides.

### Marker D: Glass Wall And Border System

Goal: dark non-path maze cells clearly read as translucent glass while preserving path contrast.

Current state:

- Wall alpha constants are `0.28` for menu and play.
- Board fill also uses glass alpha.

Next work:

- Test lower wall alpha, subtle tint, and stronger path edge contrast as a package.
- Avoid increasing animation/per-frame cost.
- Keep gothic cyber sigil border thin and crisp, not heavy.

Exit conditions:

- Background is visibly readable through non-path cells.
- Paths remain the highest-contrast navigation layer.
- Menu and play wall treatment match.

Risk:

- Too much transparency can reduce maze legibility on busy backgrounds.

### Marker E: Toggle Contract Audit

Current persisted settings:

- `controlMode`: arrows or stick.
- `movementSpeed`: movement repeat/timing profile.
- `toggleCameraFollow`: applies board offset in play.
- `toggleTrailFade`: caps trail length in play and menu demo bootstrap.
- `toggleTrailPulse`: menu and play trail pulse animation.
- `toggleAnimatedBackdrop`: star/backdrop motion on/off.
- `darkMode`: palette and backdrop intensity.

Current option fields:

- `scale`
- `camScale`
- `pathR`, `pathG`, `pathB`
- `wallR`, `wallG`, `wallB`

Settings missing from the toggle/options model:

- Path visual style: corridor, tile-square, hybrid.
- Wall glass strength or wall visual preset.
- Trail style: tile squares, connected ribbon, pulse-only emphasis.
- Menu demo trail pulse behavior. Current pulse is play-only.
- Text/readability mode if Phaser text remains sensitive by viewport.
- Compass spin onboarding, if users need a reduced-motion option.
- Show movement cells/grid helper, if tile-count clarity remains an issue.

Exit conditions:

- Each setting has a documented purpose, default, persisted key, affected surfaces, dirty flags, and verification proof.
- Menu options and pause options expose the same game-toggle truth.
- Toggle labels match actual runtime behavior.
- Defaults match persisted fallback behavior.

Risk:

- Adding too many toggles before the visual presets are proven will clutter the pause/options UI and create more state combinations to test.

### Marker F: Verification Harness

Goal: every UI visual change has route-aware proof and automated checks where possible.

Required proof for next implementation pass:

- `npm run verify`
- Current menu screenshot at `405x958`
- Options screenshot at `405x958`
- Play screenshot at `405x958`
- Pause screenshot at `405x958`
- Console warning/error check
- Runtime diagnostics check for toggles:
  - trail pulse on/off changes pulse state
  - animated background on/off changes moving actor count
  - controls arrows/stick changes touch control mode
  - movement speed changes repeat profile
  - camera follow changes board offset only when active
  - trail fade changes trail cap behavior

Implemented automation extension:

- `npm run visual:ui-surfaces` captures menu/options/play/pause screenshots, checks runtime/visual diagnostics, asserts player/goal colors, asserts stick control visibility, validates path-style reflection, and writes a markdown report beside the screenshots.

Recommended next automation extension:

- Add a small text-completeness assertion by checking internal UI text metadata if exposed through runtime diagnostics.
- Keep screenshots as proof because Phaser canvas text cannot be validated through normal DOM text.

## Execution Order

1. Fix the shared text/chrome renderer first.
2. Re-center the main menu stack using a full-stack layout calculation.
3. Audit and normalize options/pause toggle truth after text is readable.
4. Prototype maze visual presets using screenshots, not assumptions.
5. Tune wall glass and border treatment together.
6. Promote chosen visual preset(s) into options only after proof.

## Blockers

No external blockers are known.

## Key Decision Needed Later

Do not decide tile-square vs corridor permanently from code alone. The next pass should create proof screenshots for at least `corridor` and one `hybrid` option so the choice can be made visually without losing the current clean readability.
