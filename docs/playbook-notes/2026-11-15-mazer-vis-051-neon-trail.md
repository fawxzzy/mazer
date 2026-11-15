# 2026-11-15 MAZER-VIS-051 trail colours less pastel, stronger bloom

- WHAT changed: `src/render/trailPalette.ts` core stops (neon cyan, electric azure, neon violet, hot magenta, arcade apricot), bloom stops nudged, white lifts reduced (pulse core 0.2 to 0.1, pulse bloom 0.3 to 0.12, sheen bloom 0.5 to 0.35); `src/render/trailLegibility.ts` `TRAIL_GLOW_ALPHA_RATIO` 0.32 to 0.5. The guide trail icon reads `resolveIridescentRestingCore`, so it follows with no edit; guide copy names no colours.
- WHY it changed: owner request, the trail read too pastel.
- Rule: the 3:1 core-on-chip floor (chip luminance about 0.12, so core luminance at least 0.47) caps blue/violet/magenta saturation; only cyan can go fully neon. The per-redraw step bound (8 core, 10 at a 4-frame gap) caps stop-to-stop channel deltas near 60. More saturation needs a contract change to those tests, not a palette tweak. `rainbowUiPalette` left alone: backdropStarHue tests pin saturation 0.8.
- Status: headless only (Chromium DPR3, WebKit iPhone 15 Pro); nothing checked on a real phone.
