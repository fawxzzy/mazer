# Teleport System v1 — Approved Visual Authority

```
TELEPORT SYSTEM V1
Approved reference: Revision 2.4
STATUS: APPROVED — FROZEN (2026-09-03)
```

This package is the durable, repository-addressable record of the approved
Mazer Teleport System visual design (perimeter diamonds, beam/conduit,
spawn, and extraction). It replaces reliance on chat history, a local
`Downloads` folder, or a mutable Claude artifact URL as the authority for
what was approved.

**This is a design specification, not a finished runtime implementation.**
No files under `src/`, `public/`, or any other runtime path were changed to
produce this package. See "Implementation ownership" below.

## Files

| File | Role |
|---|---|
| `mazer-teleport-system-v1-approved.html` | The approved reference sheet itself — a self-contained, live-animated HTML document. Open it directly in a browser; the diamond rotation, conduit gradient travel, packet motion, and shell twinkles are real running animations, not static illustrations. |
| `mazer-teleport-system-v1-derivative-manifest.json` | Machine-readable inventory of every derivative image (crop/downscale) used or considered in the reference sheet, with source SHA-256, crop coordinates, and accept/reject status for each — see "Asset decisions" below. |
| `mazer-teleport-system-v1-port-proof.png` | Diamond & beam-port proof: the shell's measured native tip (marked, unrotated) next to the same shell rotated to face its target, zoomed tight on the conduit seam — proves the beam originates from the shell's visible tip, not its transparent square canvas. |
| `mazer-teleport-system-v1-perimeter-proof.png` | Four perimeter cases (top/right/bottom/left primary), each showing the engaged shell rotated toward its target while remaining in its own anchor sector and clearing the HUD/safe-area exclusion bands. |
| `mazer-teleport-system-v1-beam-study.png` | The target beam composition: shell → conduit → contained target flare, demonstrating the shared Navigation-Core-style energy material (cool-dominant with brief warm accents) traveling as one continuous phase. |
| `mazer-teleport-system-v1-spawn-keyframes.png` | Seven-frame spawn contact sheet: ambient → charging → conduit opens → packet arrives (contained start-tile energy peaks) → player materializes → conduit retracts → settled, with faint residue. |
| `mazer-teleport-system-v1-extraction-keyframes.png` | Seven-frame extraction contact sheet: player present → primary charges → conduit established → player contracts → packet travels to primary → same shell absorbs it → stored (player absent, same energized shell, no alternate silhouette). |

## Visual contract (what is locked)

### Topology
- Eight ambient perimeter diamonds; one deterministic primary gameplay
  anchor; one primary transfer conduit.
- The same primary persists through `outbound -> stored -> delivering`.
- The full eight-origin volley is reserved for menu/title choreography or
  exceptional completion moments — it is never the default gameplay
  transfer.

### Primary selection (deterministic, never random)
1. Begin with all eight fixed perimeter anchors.
2. Exclude anchors that cannot legally clear HUD/safe-area boundaries.
3. Choose the valid anchor whose inward beam port is closest to the
   extraction target.
4. Break ties using a fixed anchor-ID order.
5. Persist the same primary through the full outbound/stored/delivering
   cycle; remap only when a viewport or safe-area change invalidates the
   held anchor.

### Shell
- `edge-diamond-energized.png` is the canonical structural shell in **every**
  state: ambient, waking, charging, ready, extraction, absorption, stored,
  delivery. Only intensity, contained glow, glints, and internal energy
  change — never silhouette or registration.
- No live compositing of `edge-diamond-energy-core.png` onto the shell (a
  rejected experiment — reads as an unrelated second diamond, since the
  core has no inherent "point toward center" orientation of its own).
- The central-gem crop derivative is a rejected experiment (see the
  derivative manifest).
- `edge-diamond-energy-absorption-state.png` is reference-only; it never
  appears as a runtime shell swap.

### Beam
- The shell rotates so its **measured** visible inward tip (found via the
  source PNG's own alpha-channel bounds, not eyeballed — native resting
  angle documented in the port-proof export) faces the target; this applies
  everywhere a real target direction exists (perimeter, beam study, spawn,
  extraction, scale-proof).
- The conduit begins at that measured, transformed tip and is drawn beneath
  the shell, so the shell's own art masks the first few conduit pixels — no
  beam may appear to originate from transparent canvas space.
- Thin continuous conduit (not a thick bar); one shared traveling packet
  with a compact white-hot center that inherits the conduit's own energy
  material/phase rather than an unrelated color.
- Contained one-cell target flare — not a second mirrored diamond cap (the
  mirrored cap is source-analysis only, documented in the beam-decomposition
  section, never the gameplay target).
- Energy material is the same palette-stops contract Navigation Core
  Revision 6.1 locked for its trail: cyan/blue/violet/magenta dominant,
  brief red/orange/yellow accents, green as a transition tone — animated as
  one continuous distance/time phase across conduit, packet, and target
  flare together, not independent unrelated colors per element.

### Spawn
```
primary charges -> conduit opens toward start -> packet reaches contained
start energy -> player materializes as stable green -> conduit collapses
-> faint start residue remains -> primary settles
```
The start target is a real one-cell tile with contained energy (an
`aspect-ratio: 1` box, not a collapsed line) — not a free-floating dot with
a horizontal guide.

### Extraction
```
goal accepted -> primary charges -> conduit opens -> player contracts into
spectral energy -> packet travels toward primary -> same shell absorbs it
-> conduit collapses -> primary enters stored state -> player is absent
```
Semantically distinct from spawn played backward: extraction ends on the
same energized shell at reduced/stored intensity, never on
`edge-diamond-energy-absorption-state.png` or any other alternate
silhouette, and never with the player still present.

### Decorative glints
Every decorative shell glint (waking, high charge, peak, absorbing) is the
same four-point twinkling sparkle mark used elsewhere in Mazer (title, goal,
diamond treatment) — not a plain circular dot. The traveling packet is the
one exception: it may keep a compact round white-hot center, since it has a
different semantic role (payload, not decoration).

### Reduced motion
- Short state crossfades; a stable (non-animating) conduit.
- No traveling packet, no continuous orbit, no repeated pulse, no particle
  stream.

## Prohibited regressions

Do not reintroduce, in any future runtime or design pass, without a new
explicitly-approved revision:

- The full eight-origin volley as the *default* gameplay transfer.
- Random (non-deterministic) primary anchor selection.
- An alternate absorption-state shell silhouette appearing at runtime.
- A thick/bar-style beam instead of the thin conduit + packet contract.
- A beam that visibly originates from empty/transparent canvas space
  instead of the shell's measured tip.
- Guide rails / detached line artifacts in any closed conduit state
  (`openFraction <= 0` must render zero conduit/glow/packet/rail pixels).
- The player remaining visible after extraction completes.
- A rainbow-cycling or otherwise non-stable-green final player state.

## Asset decisions

See `mazer-teleport-system-v1-derivative-manifest.json` for the full,
machine-readable per-asset record (source file, SHA-256, crop coordinates,
output size, accept/reject status, and reasoning). Summary:

| Asset | v1 decision |
|---|---|
| `edge-diamond-energized.png` | **Canonical shell**, every structural state |
| `edge-diamond-iridescent.png` | Historical/reference source only |
| `edge-diamond-energy-core.png` | Do not live-composite (rejected) |
| Central-gem crop derivative | Rejected experiment |
| `edge-diamond-energy-absorption-state.png` | Reference-only, no runtime use |
| `teleport-beam-iridescent.png` | Source art for the decomposed beam-study treatment |

## Original local filenames and provenance

Built and verified in a Claude Code session (design/reference-sheet work,
not this repository), going through Revisions 1 → 2 → 2.1 → 2.2 → 2.3 →
2.3.1 → 2.3.2 → 2.4 (final candidate), each revision responding to direct
visual review against real rendered exports (not prose claims) before being
approved. That revision history is preserved as prose inside the HTML
file's own `.approved-banner` / `.record` block, not duplicated here.

Local working filename before archival:
`mazer-teleport-system-reference-rev2-4.html` (Claude Code session
scratchpad). Export filenames before archival used a `-rev2-4` revision
suffix; this package renames them to the version-agnostic `-v1-*` scheme
above, since the repository path (`teleport-system-v1/`) already encodes
the authority.

Convenience link to the source Claude artifact (not canonical authority —
this repository package is): `https://claude.ai/code/artifact/bf3b2b9c-2e67-4f7e-a933-09a286c0083c`

## Source asset dependencies

Verified directly against the archived HTML: it embeds four canonically
named source images as base64 data URIs (`id="src-energized"`,
`id="src-iridescent"`, `id="src-absorption"`, `id="src-beam"`), plus a
further set of unnamed derivative crops (beam caps, beam center, etc.)
already fully catalogued with their own source hashes and crop coordinates
in `mazer-teleport-system-v1-derivative-manifest.json` — that manifest is
the authoritative per-derivative record, not re-duplicated here.

See `docs/assets/mazer-vfx-source-provenance.md` for the canonical source
files' own dimensions and SHA-256.

## HTML packaging (fidelity chosen over normalization, this pass)

`mazer-teleport-system-v1-approved.html` is committed **byte-for-byte
identical** to the approved Downloads export — no normalization to
repository-relative asset paths was attempted in this pass. Its size
(~2.4 MB) is embedded base64 copies of the source assets above, encoded for
artifact-hosting portability during design review.

This is a deliberate fidelity-over-size decision, not an oversight: see the
matching section in `../navigation-core-v1/README.md` for the full
reasoning, which applies identically here. Because no transformation
occurred, `source_sha256` and `archive_sha256` are identical for this file
— see `SHA256SUMS`.

## Implementation ownership

**Wave 4D-B** owns turning this approved design into the actual Phaser
runtime.

## Remaining runtime verification (not settled by this package)

This package locks the *intended visual result*. It does **not** constitute
proof of the following, which Wave 4D-B must verify independently:

- Live timing and easing (this package's still exports establish geometry
  and state, not final motion timing; the reference HTML's own animation
  durations are illustrative targets, e.g. extraction transfer roughly
  700–850ms, delivery transfer roughly 800–1000ms, no unexplained visual
  hold longer than roughly 120ms — subject to live recordings and
  frame-time evidence).
- Selected-anchor persistence and safe-area handling under real HUD layout
  and real device viewports (this reference uses an illustrative
  390x844-representative viewport, not the live HUD).
- The measured beam-port transform and source/target seam masking, applied
  to the real Phaser sprite pipeline rather than CSS `transform: rotate()`.
- Frame performance and reduced-motion behavior on real devices.
