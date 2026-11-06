# Space Grotesk (self-hosted)

The Mazer UI face declared by `docs/contracts/mazer-ui-rework-design-tokens.v1.json`
(`fonts.ui`) and `src/styles/base.css`. Shipped so text no longer depends on
whatever the OS happens to fall back to.

| Field | Value |
| --- | --- |
| Family | Space Grotesk (Florian Karsten), SIL Open Font License 1.1 (see `LICENSE.txt`) |
| File | `space-grotesk-latin-wght-normal.woff2` (variable `wght` 300-700, latin subset) |
| File sha256 | `0640890476fc1198ab4de571fb658de443c4d85b66466ec09534a8737ab1ce9d` |
| Size | 22,288 bytes |
| Source package | `@fontsource-variable/space-grotesk@5.3.0` (npm, `files/space-grotesk-latin-wght-normal.woff2`) |
| Package tarball sha1 (npm `dist.shasum`) | `f35f8915850afbefe92b0fe15b1db49928e55186` |
| Package tarball sha256 | `47d1b51d64ed541b7e74f38e9e682a8ff1bbfd1b68bfd7fff74ac9175058e73c` |
| Upstream | https://github.com/floriankarsten/space-grotesk (via google/fonts) |
| Retrieved | 2026-11-06 with `npm pack` in a temp directory (not a repo dependency) |

Weights used by the game: 400, 500, 600 (DOM) and 500/700 (`bold`, Phaser canvas).
One variable file covers all of them. Latin-ext/vietnamese subsets are
intentionally not shipped; those code points fall back to the system stack.

To update: `npm pack @fontsource-variable/space-grotesk@<version>` outside the
repo, copy the `latin-wght-normal.woff2` and `LICENSE`, and refresh this table.
