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

- `edge-diamond-iridescent.png` -- **wired in**: replaces the procedural
  diamond shapes drawn by `drawLegacyMenuPathTitleOrbitSigils`
  (MenuScene.ts). Rendered as a pooled Phaser Image per orbit sigil,
  position/rotation/scale/alpha driven by the existing orbit-pose math;
  colors are the source art's own (no additional tint), since the art is
  already an iridescent/rainbow crystal. A twinkle sparkle overlay
  (`drawLegacyFourPointSparkle`) was added alongside each diamond.
- `edge-diamond-energy-core.png`, `edge-diamond-energy-absorption-state.png`,
  `teleport-beam-iridescent.png` -- **loaded, not yet wired into gameplay**.
  The full choreography described in the source bundle's own
  `CLAUDE-INTEGRATION.md` (maze-build charge crossfade, player spawn-in,
  player teleport-out, deterministic beam-cap slicing) is a substantially
  larger integration than the idle-diamond swap and has not been
  implemented yet -- tracked as explicit follow-up work, not silently
  dropped.
