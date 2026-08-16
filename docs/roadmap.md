# Roadmap

- Wave 1: foundation bootstrap and scene wiring.
- Wave 2: 2D board model, generation, pathing, and shipping-runtime migration.
- Wave 3: 2D readability and composition polish across desktop, TV, OBS, and mobile surfaces.
- Wave 4: PWA/installability hardening (manifest/icon plumbing, production SW, localhost SW-off discipline).
- Wave 5: packaging and release-surface hardening after the 2D baseline freeze.

## Current focus (April 16, 2026)
- Keep the current 2D Phaser build as the shipping baseline and local freeze target.
- Prioritize small readability, composition, and repo-truth alignment passes that improve the active shipping lane without reopening runtime churn.
- Keep installability plumbing and verification green with repo-owned assets and production-only service-worker behavior.
- Keep the installable PWA truthful: prompt only when the browser provides it,
  give explicit manual guidance where needed, and never treat installability as
  entitlement or account state.
- Treat future-runtime and planet research as isolated support material, not as the current product claim.

## Web v1 account and PWA sequencing

- The Fitness-derived account/login capability-parity work is preserved in
  draft PR #83 and remains held by the shared-Auth convergence boundary.
- Do not duplicate or partially reimplement PR #83 in the PWA lane.
- PWA/installability can ship independently because it does not change
  Supabase/Auth provider settings, schema, data, or account cutover.
- The next account packet after shared-Auth clearance must carry the full
  capability matrix, native mobile input semantics, safe action-specific error
  mapping, recovery redirect contract, remembered-session behavior, and
  password visibility/autofill proof.

## Deep-research ingestion

The merged Web V1/Cyberdeck research synthesis is now durable at:

- `docs/research/MAZER_WEB_V1_CYBERDECK_CANONICAL_DEEP_RESEARCH.md`

It remains planning truth only. Web V1 release and the current Mazer UI/auth
gates precede primary Cyberdeck implementation.

## Parked future lane
- Rotating planet maze design research is now captured in `docs/research/MAZER_ROTATING_PLANET_MAZE_MASTER_PLAN.md`.
- That lane stays explicitly parked and deferred behind the active 2D shipping lane.
- Fixed staging order for that lane:
  1. design brief
  2. topology sandbox
  3. isolated 3D prototype
  4. later integration decision
- The immediate near-term option remains the 2D readability upgrade in the current product, not a 3D reopen.
- The current Phaser 2D build remains the shipping baseline until a future spike separately proves camera clarity, readability, and orientation on its own terms.
