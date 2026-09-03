# Mazer VFX Source Asset Provenance

Source: user-supplied `mazer-vfx-source-bundle.zip` (iridescent diamond/teleport
VFX), 2026-08-28. Copied byte-for-byte into `public/assets/vfx/diamonds/` --
verified via SHA-256 against the bundle's own `IMPORT-MANIFEST.json` before
copying (`sha256sum` on both the bundle's `source/*.png` and the repo copies
produced identical digests for all four files).

Do not regenerate, redraw, recompress, or replace these files. If a
runtime-optimized derivative (e.g. a deterministic beam-slice crop) is ever
needed, generate it into a separate directory, keep these originals
untouched, and document the exact crop coordinates and generation command
here.

| File | Dimensions | SHA-256 |
|---|---|---|
| `edge-diamond-iridescent.png` | 1254x1254 | `bc6ae2a4a3edd277abee14cb643fc41a81da335457d0a622b5096e6d5a42b23e` |
| `edge-diamond-energy-core.png` | 1254x1254 | `2db494ef6efec978a5e6e72e21bf6d89d4cda0c1a88735896ac05ccc1d6d4d45` |
| `edge-diamond-energy-absorption-state.png` | 1254x1254 | `6024cf1fab38fde9b5da44b1a39683557bcdd5fc1283ee92144008ec2754f1e1` |
| `teleport-beam-iridescent.png` | 2172x724 | `262132c66fd6786d9b34da6ec1e71a51857f541a6c91594804bad32fdb5bd97e` |

## Current integration status

- `edge-diamond-iridescent.png` -- **retired from the orbit sigils** (still
  present/loaded; no longer the ambient diamond's own texture) in favor of
  `edge-diamond-energized.png` below. Compositing `edge-diamond-energy-core.png`
  on top of it (an earlier attempt at "energy in the diamonds") was a real
  bug: the core is a symmetric diamond shape with no inherent "point toward
  center" orientation, so stacking it near the shell's own scale read as "an
  extra diamond appearing over them... not pointing to mid," exactly as
  reported. Removed that composite entirely rather than trying to mask/scale
  it into place.
- `edge-diamond-energy-core.png`, `edge-diamond-energy-absorption-state.png`,
  `teleport-beam-iridescent.png` -- **loaded, not yet wired into gameplay**.
  The full choreography described in the source bundle's own
  `CLAUDE-INTEGRATION.md` (maze-build charge crossfade, player spawn-in,
  player teleport-out, deterministic beam-cap slicing) is a substantially
  larger integration than the idle-diamond swap and has not been
  implemented yet -- tracked as explicit follow-up work, not silently
  dropped.

## Second asset batch (2026-08-29)

User-supplied `Codex Image Aug 28, 2026, ...` files, sifted from Downloads
per an explicit "check all the images, organize and save them" request.
Renamed on copy for clarity (none of these came bundled with their own
manifest/README the way the first batch did); byte-identical to the
Downloads originals, verified via `sha256sum` before/after copy.

| File | Source (Downloads) | Dimensions | SHA-256 |
|---|---|---|---|
| `vfx/diamonds/edge-diamond-energized.png` | `Codex Image Aug 28, 2026, 04_24_47 PM.png` | 1254x1254 | `f2f63b98ea816a98de917ac83afe8cec46d9d3c4bf3e0e89fca29673a4081639` |
| `tiles/mazer-floor-tile.png` | `Codex Image Aug 28, 2026, 04_35_42 PM.png` | 1254x1254 | `856d014d5d73f20273f46f711fa8732a4dc56c3df13c8f5f9e3f0359f7a3a712` |
| `tiles/mazer-bleed-path-strip.png` | `Codex Image Aug 28, 2026, 04_36_53 PM.png` | 2172x724 | `665c3d6c8ebc93a2f76ab57144c409f1ddda07dcb22fc0ba735c1e8a7a60ec54` |
| `vfx/trail/mazer-player-trail.png` | `Codex Image Aug 28, 2026, 04_20_58 PM.png` | 2172x724 | `ef0e1b54b64a691ed665608b6fd4458b8b2ef86c56f7c0fca3b89b8f8b1bbc4a` |
| `vfx/starfield/mazer-starfield-tile.png` | `Codex Image Aug 28, 2026, 04_35_15 PM.png` | 1254x1254 | `a076e67f39f3e8a3557d5840a426966280a30a99cb64a3a442b97d3a2e502193` |

A `Codex Image Aug 28, 2026, 04_25_17 PM.png` in the same Downloads batch
(apparent laser/beam art) hashes byte-identical to the already-integrated
`teleport-beam-iridescent.png` above -- not a new asset, not copied again.

Three other diamond renders in the same batch (`04_24_52 PM`, `04_24_56 PM`,
a second near-duplicate of the iridescent shell) were reviewed but not
copied in: `04_24_52 PM` is a depleted/dark reference render on a white
background, not a game-ready transparent asset; the others are visually
close variants of art already covered by `edge-diamond-iridescent.png` /
`edge-diamond-energized.png`.

### What's wired in from this batch

- `edge-diamond-energized.png` -- **wired in**, replacing
  `edge-diamond-iridescent.png` as the orbit sigils' own texture (see above).
- `mazer-floor-tile.png` -- **wired in**: a `Phaser.GameObjects.TileSprite`
  (`boardFloorTileSprite`) tiled at exactly one board tile per repeat,
  masked (`boardFloorMaskGraphics`, a `GeometryMask`) to precisely the same
  connectivity-aware walkable-cell shape `drawLegacyPathMaterialTile`'s own
  color fill already computes, and layered on top of the existing corridor
  fill/rim-light at partial alpha -- an overlay, not a replacement, so
  progression-palette coloring and the trail/rim glow still show through.
- `mazer-bleed-path-strip.png`, `mazer-player-trail.png`,
  `mazer-starfield-tile.png` -- **loaded, not yet wired into gameplay**. The
  bleed-path strip needs the same per-direction masking treatment as the
  floor tile but applied to `drawLegacyPathBorderDock`'s dock-frame geometry
  instead of the whole corridor (not yet implemented). The player trail
  needs a path-following (not tile-repeating) renderer -- the asset is a
  single continuous gradient meant to follow the player's actual walked
  route, which a uniform per-cell tile treatment can't represent correctly.
  The starfield tile predates a decision to instead keep the existing
  parallax star simulation (`legacyMenuBackdrop.ts`) and just switch its
  brightest stars to the same rainbow four-point sparkle every other
  element uses, rather than replacing the whole simulated field with a
  static tiled backdrop.
- `mazer-player-trail.png` -- **wired in** (2026-08-29): one real square
  tile per visible trail cell (`drawLegacyPlayerTrailTileOverlay`), sampled
  from the strip's own baked left-to-right rainbow (a window that slides
  along the strip based on how far back in the trail a cell is), not the
  path-following renderer the original analysis above assumed was required
  -- the asset turned out to already be a repeatable tile strip (visible
  grid seams between segments), not one unbroken gradient. Crop
  coordinates (`MAZER_PLAYER_TRAIL_STRIP_LEFT/WIDTH`,
  `MAZER_PLAYER_TRAIL_SAMPLE_WIDTH` in `MenuScene.ts`) are estimated from
  visually inspecting the asset's proportions, not pixel-measured -- may
  need a calibration pass once verified against a live screenshot.

## Third asset batch (2026-08-29): HUD icons

User-supplied `mazer-hud-icons-source-bundle.zip`, with its own
`IMPORT-MANIFEST.json`/`SHA256SUMS.txt` (verified byte-for-byte against the
bundle before copying, same as the first batch).

| File | Dimensions | SHA-256 |
|---|---|---|
| `hud/hud-profile.png` | 1254x1254 | `f3b6ecb436711083b62ac3d3b0706e884da6432c5dd2887a9c94e0c519fd1e37` |
| `hud/hud-leaderboard.png` | 1254x1254 | `5e1f6ab3707c0fb7429b46b6e32eb06fc44bd384c3d3a864a6429140efc0096a` |
| `hud/hud-settings.png` | 1254x1254 | `7912689b5935acbc9617222fe301cfd27830fdb658dbe59f342988271b5b4acc` |

**Wired in**, replacing the procedural thin-line gear/bar-chart/head-and-
shoulders icons for: the main-menu header settings button
(`drawLegacyMenuSettingsCog`), the main-menu header leaderboard button
(`drawLegacyMenuLeaderboardIcon`), the main-menu profile/account button
(`createLegacyMenuProfileButton`), the Options/Pause overlay's username button
(`createLegacyOverlayUsernameButton`), and the active-play pause/settings
control (`drawLegacySettingsCogControl`). All settings surfaces now consume the
same texture and optical bounds instead of retaining a separate procedural cog.

Each source PNG carries a different amount of transparent padding inside
its 1254x1254 canvas (measured directly via Python/Pillow
meaningful-alpha threshold (`alpha > 1`), not eyeballed). The discarded
`alpha == 1` pixels form a sparse, visually transparent noise envelope that
would otherwise make the legible icon cores render at roughly half their
intended HUD size. The retained source bounds are profile `615x729` at
`(320,268)`, leaderboard `692x524` at `(281,359)`, and settings `807x828` at
`(221,204)`. `applyLegacyHudIconFrame` crops each icon to those measured bounds
and scales uniformly off the longer edge, so passing the same `desiredSize` to
any of the three gives the same optical size.

The active-play pause/settings control now consumes the same settings texture
and optical bounds as the menu header. Because that texture is a persistent
Phaser image rather than transient HUD graphics, every HUD teardown path must
hide it explicitly before an overlay or menu surface is shown. This includes
forced auth-gate and password-recovery transitions, which bypass the normal
overlay-opening helper and return before the next HUD draw.

## Fourth asset batch (2026-08-28, catalogued 2026-09-02): goal-star reference frames and one full-scene concept

Five files from the same Downloads drop as the second batch above (same
Aug 28 session, an earlier window within it) were never reviewed or
catalogued at the time -- found during Navigation Core visual-direction
work on 2026-09-02, after a mockup built without them was found to
contradict the live `drawLegacyGoalStarMarker` implementation. Copied
byte-for-byte; SHA-256 verified identical between the Downloads originals
and the repo copies immediately after copying (Python `hashlib.sha256`,
not `sha256sum`, but the same verification -- read-hash-before,
copy, read-hash-after, compare).

| File | Source (Downloads) | Dimensions | Mode | SHA-256 |
|---|---|---|---|---|
| `vfx/goal-star/edge-goal-star-frame-0.png` | `Codex Image Aug 28, 2026, 02_18_54 PM.png` | 1254x1254 | RGB, opaque | `8760126792f1e056e2b88dc392d5f46fb9121b39e85834194183423fc09d854b` |
| `vfx/goal-star/edge-goal-star-frame-1.png` | `Codex Image Aug 28, 2026, 02_18_59 PM.png` | 1254x1254 | RGB, opaque | `7bba30a7b1c345ca85e1cd2f89d08a3b358e1b121dcd1a1dd9a56f197d887d87` |
| `vfx/goal-star/edge-goal-star-frame-2.png` | `Codex Image Aug 28, 2026, 02_19_08 PM.png` | 1254x1254 | RGB, opaque | `6a76f178667706430de6810ede7571ac59c8351a653a0fef2490ceb729eb5628` |
| `vfx/goal-star/edge-goal-star-frame-3.png` | `Codex Image Aug 28, 2026, 02_19_13 PM.png` | 1254x1254 | RGB, opaque | `ba77574457e58c5226c17ec6d2b58447ad1808501173f8c9591a6279ff07dfb4` |
| `docs/assets/reference/mazer-active-play-concept.png` | `Codex Image Aug 28, 2026, 03_12_47 PM.png` | 941x1672 | RGB, opaque | `4b5aea573c4ef2d9a44f20a8e392a2e870d7d5305f3f3227d81bfebeb92c87b8` |

**Goal-star frames**: four rotation phases of one design -- a hollow
five-point star (rainbow gradient stroke), sparkle glints scattered across
the interior, a bright core flare, and an orbiting ring with a small
satellite dot riding it. This matches the live `drawLegacyGoalStarMarker`
(`src/scenes/MenuScene.ts:9590-9713`) closely enough -- hollow star,
rainbow outline, ring, orbiting highlight, twinkle sparkles -- that it is
almost certainly the actual reference asset that function's own comment
refers to ("Modeled on a reference asset the user supplied"). **Not
game-ready as-is**: all four are opaque RGB on a near-white
(`253,253,253`) rounded-card background, no alpha channel -- reference/
concept renders, not drop-in transparent runtime assets, the same
category as the previously-reviewed-but-not-copied `04_24_52 PM` diamond
render. **Status: found, reviewed, not yet wired into anything.** If
runtime integration is ever wanted, this needs either a transparent
re-render from the same source, or a background-removal derivative
generated into a separate directory (documented here, originals kept
untouched) -- consistent with this file's own standing rule.

**Active-play concept**: one full composed scene (header with title/
profile/settings icons, a generated maze, a player marker at the start
tile, a rainbow trail departing it, an end-star marker on a small backing
plate at the goal tile). Stored under `docs/assets/reference/`, not
`public/assets/`, deliberately -- **this is a visual-direction reference,
not a candidate production asset**: it's a single flattened composite
image, not a set of isolated per-element sources, and the trail/header
treatment shown doesn't necessarily match what any individual asset
batch above actually is. Use it to judge overall hierarchy, board feel,
and how the goal-star and player are meant to relate to each other and
the maze -- not as something to crop pieces out of and ship.
