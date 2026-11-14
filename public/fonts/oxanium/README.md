# Oxanium (self-hosted display face)

The one squared techno display face for short uppercase labels (MAZER-UI-010,
decision record 2026-11-14 pick 1). Body copy stays Space Grotesk. Never used
for sentences or body text; see `docs/ui/MAZER-TYPE-SCALE.md`.

| Field | Value |
| --- | --- |
| Family | Oxanium (Severin Meyer), SIL Open Font License 1.1 (see `LICENSE.txt`) |
| File | `oxanium-latin-wght-normal.woff2` (variable `wght` 200-800, latin subset) |
| File sha256 | `3aa555c528430aab19bb2693dc206bab557767d3082dba66400784c9cc90cfbb` |
| Size | 14,044 bytes |
| Source package | `@fontsource-variable/oxanium@5.3.0` (npm, `files/oxanium-latin-wght-normal.woff2`) |
| Package tarball sha1 (npm `dist.shasum`) | `01b9e7e2783feedb64ce546814eb20da0037ba26` |
| Package tarball sha256 | `be68225f24b076b7deda32a1432753e0b1a15c7635847b4c28c4377263683dad` |
| Upstream | https://github.com/sevmeyer/oxanium |
| Retrieved | 2026-11-14 with `npm pack` in a temp directory (not a repo dependency) |

Loaded lazily by CSS (`font-display: swap`, no preload, not awaited at boot), so
it cannot delay first paint; it is precached so offline launches have it.
