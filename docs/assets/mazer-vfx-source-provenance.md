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
