# Navigation Core v1 — Approved Visual Authority

```
NAVIGATION CORE V1
Approved reference: Revision 6
Amendment 6.1: trail continuity
Amendment 6.2: glow, seam, player connection, and shine refinement
STATUS: APPROVED — FROZEN (2026-09-03)
```

This package is the durable, repository-addressable record of the approved
Mazer Navigation Core visual design (maze, player, trail, start marker, end
star). It replaces reliance on chat history, a local `Downloads` folder, or a
mutable Claude artifact URL as the authority for what was approved.

**This is a design specification, not a finished runtime implementation.**
No files under `src/`, `public/`, or any other runtime path were changed to
produce this package. See "Implementation ownership" below.

## Files

| File | Role |
|---|---|
| `mazer-navigation-core-v1-approved.html` | The approved reference sheet itself — a self-contained, live-animated HTML document. Open it directly in a browser; every effect described below (trail path, shine sweep, end-star pulse) is a real running animation, not a static illustration. |
| `mazer-navigation-core-v1-target.png` | Straight segment + corner, normal (64px) tile scale — the primary evidence frame. |
| `mazer-navigation-core-v1-compact.png` | Same scene at compact (26px) tile scale, proving the design holds at small-device sizes. |
| `mazer-navigation-core-v1-adjacent.png` | Player immediately adjacent to the end tile — proves the trail-to-player and player-to-goal connections read correctly at minimum distance. |
| `mazer-navigation-core-v1-shine-states.png` | Six sampled states of the trail's traveling shine (fade-in at origin, straight segment, corner traversal, approaching the player, faded out at the player, quiet reset interval), frozen via `animation-delay` on the actual live element — not six separately drawn illustrations. |

All four PNGs are static evidence crops taken directly from the live HTML at
specific animation phases; they exist for review contexts where motion can't
be judged, not as a replacement for the HTML itself.

## Visual contract (what is locked)

- Connected ivory/mint checker maze corridor, with visible floor texture
  depth and subtle internal seams — not a bleached, featureless slab.
- A single strengthened outer corridor rail is the only border on the whole
  floor; no per-cell border duplication, no black substrate cracks visible
  in the reference at normal or compact scale.
- Stable-green one-cell player: a flat `#39F58A` rounded-square core, one
  thin edge, 58–64% of tile width, with idle breathing and a neon-tube glow
  treatment (`drop-shadow`, not a second opaque halo body).
- One continuous spectral trail, 16% of tile width, rendered as a single SVG
  path (not N glued-together per-cell pieces) with uninterrupted color and
  geometry phase through corners.
- The trail terminates exactly at the player's rear structural boundary
  (`tile * 0.3` short of the player's center, matching the player core's own
  measured half-width) — it must never run underneath the visible green
  core and never stop short enough to look disconnected.
- One shared traveling shine sweep per trail (not per-cell pulses, not a
  circular packet): a short tapered highlight roughly 9.5% of the visible
  path length, fading in over the first ~4% of its travel and fading out
  over the final ~4%, holding a quiet interval before restarting at the
  trail's origin. The loop point is continuous by construction — the dash
  pattern's own period equals the offset-animation's period, and the fade
  keyframe's opacity is `0` at both `0%` and `100%`.
- A vivid, readable one-cell end star: increased saturation/glow over the
  earlier reference-only render, same one-cell footprint, no outer white
  frame, no permanent white decorative dots.
- Canonical energy palette (shared by trail and end star): cyan, blue,
  violet, magenta dominant; red, orange, yellow as brief accents; green as a
  transition tone, not a resting color.

## Prohibited regressions

Do not reintroduce, in any future runtime or design pass, without a new
explicitly-approved revision:

- Detached/black tile gaps between adjacent floor cells.
- A bleached, featureless floor (texture contrast washed out to hide seams).
- Per-cell trail rendering (independent color blocks, independent pulse
  timers) instead of one continuous path.
- The trail's shine reading as a circular dot/packet instead of a tapered
  highlight segment of the trail itself.
- The trail stopping visibly short of the player (a gap) or running through/
  past the player's front edge.
- An oversized or relocated goal/end-star marker relative to its measured
  one-cell footprint.

## Reduced-motion contract

Every state must remain understandable without: continuous shine travel,
repeated pulsing beyond a single breathing cycle, or particle streams. Use
short crossfades between hard states instead.

## Scale rules

Verified at Navigation Core's own two locked scales: 64px (normal board) and
26px (compact/small-device). The trail's shine, glow envelope, and core
width are all tile-relative percentages, not fixed pixel values, so they are
expected to scale proportionally — this package's compact-scale export is
the evidence that they actually do.

## Original local filenames and provenance

Built and verified in a Claude Code session (design/reference-sheet work,
not this repository) from real repository source assets — see
`docs/assets/mazer-vfx-source-provenance.md` for those assets' own
provenance (`mazer-floor-tile.png`, `mazer-player-trail.png`, the goal-star
frames, etc.). The approved sheet went through Revisions 3–6 and Amendment
passes 6.1/6.2 (four internal 6.2 passes plus this final candidate) before
being approved; that revision history is preserved as prose inside the HTML
file itself (its own "approved-banner" / `.record` block), not duplicated
here.

Local working filename before archival: `navigation-core-sheet.html`
(Claude Code session scratchpad). Export filenames before archival used a
`-rev6-2-final-*` / revision-numbered convention; this package renames them
to the version-agnostic `-v1-*` scheme above, since the repository path
(`navigation-core-v1/`) already encodes the authority, and the revision
lineage lives in the HTML's own record and in this README, not the
filenames.

Convenience link to the source Claude artifact (not canonical authority —
this repository package is): `https://claude.ai/code/artifact/7101c38d-cfb5-4169-b155-bed8fcdd2eb7`

## Source asset dependencies

Verified directly against the archived HTML (`grep` for embedded `<img>`/data-URI
constants, not assumed): it embeds six repository source images as base64
data URIs rather than referencing them by path:

- `public/assets/tiles/mazer-floor-tile.png` (the `FLOOR` constant — used
  programmatically as the per-cell floor texture accent layer)
- The four `public/assets/vfx/goal-star/edge-goal-star-frame-{0,1,2,3}.png`
  reference frames (`id="ref-star-0..3"` — shown as reference-only source
  gallery, not composited into the live procedural end-star itself)
- `docs/assets/reference/mazer-active-play-concept.png` (the full-scene
  concept image, shown for board-feel/hierarchy reference only)

**Note:** the trail does *not* embed `public/assets/vfx/trail/mazer-player-trail.png`
as a raster asset — the live trail is a synthesized SVG gradient path
(`buildTrailPath`, using the `ENERGY` color-stop array), not a composited
copy of that PNG. The player-trail asset informed the palette/behavior
design but is not itself embedded in this file.

See `docs/assets/mazer-vfx-source-provenance.md` for each embedded file's own
dimensions and SHA-256.

## HTML packaging (fidelity chosen over normalization, this pass)

`mazer-navigation-core-v1-approved.html` is committed **byte-for-byte
identical** to the approved Downloads export — no normalization to
repository-relative asset paths was attempted in this pass. Its size
(~11.4 MB) is entirely embedded base64 copies of the source assets listed
above, encoded for artifact-hosting portability during design review.

This is a deliberate fidelity-over-size decision, not an oversight:
normalizing the embedded data URIs to repository-relative `<img src>`
references would change the file's bytes, which requires proving the
rendered output is visually equivalent before/after (same viewport, same
animation phase, pixel-identical or a documented bounded rendering-only
diff) before it can be trusted as the same approved authority. That
verification pipeline was not run in this pass. Normalization remains
legitimate future follow-up, tracked here rather than attempted partially.

Because no transformation occurred, `source_sha256` and `archive_sha256`
are identical for this file — see `SHA256SUMS`.

## Implementation ownership

**Wave 4D-A** owns turning this approved design into the actual Phaser
runtime (`src/scenes/MenuScene.ts` and related rendering code).

## Remaining runtime verification (not settled by this package)

This package locks the *intended visual result*. It does **not** constitute
proof of the following, which Wave 4D-A must verify independently against
the live renderer:

- The actual root cause of any black-seam artifact in the current runtime
  (this reference removes the seam via DOM tile adjacency + a per-cell
  texture crop that excludes the source PNG's own border — a different
  mechanism than whatever the Phaser `TileSprite`/procedural-cell compositing
  currently does).
- Pixel alignment, mask coverage, and `TileSprite` filtering behavior at
  both 64px and 26px tiles, and at non-integer fitted tile sizes / board
  zoom levels.
- Actual frame-time smoothness of the shine sweep in the real renderer (this
  package's "no jump at the loop point" claim is proven mathematically for
  the CSS/SVG mechanism used here — dash-pattern period equals offset-period,
  opacity keyframe is `0` at both ends — not measured against Phaser's own
  animation/tween system).
- Device and frame-time evidence generally; none was collected here.

Recommended isolation approach for that verification (from the design
review that produced this package): render the layers independently at a
fixed seed — flat corridor base only, connectivity mask only, floor
`TileSprite` only, procedural cell core/edge only, full composite — before
assuming any single cause for a seam artifact if one is still observed.
