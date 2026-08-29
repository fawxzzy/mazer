# Mazer Final Icon Source Contract

Status: canonical target contract v2

Contract owner: `src/brand/mazerIconQualityTarget.ts`

## Sole design authority

`src/brand/source-art/mazer-app-icon-master.png` is the only authoritative Mazer icon artwork. Its locked identity is 1024x1024, 1,173,366 bytes, and SHA-256 `ede90e596682795d10f97bed615071ca1f60e08e290eacf1ea143006df914d78`.

The repository copy is byte-identical to the operator-supplied final master. Downloads, ATLAS data references, generated delivery assets, and legacy emblem files are not design authorities or runtime dependencies. Do not redesign, recolor, reinterpret, destructively crop, add text to, or regenerate the master with generative tooling.

## Deterministic generation

Run `npm run brand:icons` after an authorized master change. Run `npm run brand:icons:check` to fail when any checked-in derivative is stale or missing. `scripts/brand/generate-mazer-icons.mjs` validates the master identity before it writes anything, uses Sharp Lanczos3 with fixed PNG settings, and emits a deterministic PNG-backed ICO directory.

The standard 1024 delivery asset is a byte-identical copy. Standard PNG and ICO frames are high-quality downscales. Maskable derivatives place the complete square master inside the centered circle with an 80% canvas diameter on an opaque black background. That conservative padding protects both the outer rainbow frame and central maze from platform masks.

## Delivery matrix

| Consumer | Repository asset | Sizes | Derivation |
| --- | --- | --- | --- |
| Default browser favicon | `public/favicon.ico` | 16, 32, 48, 64, 128, 256 | PNG-backed ICO |
| Windows shortcut | `public/icons/mazer-app-icon.ico` | 16, 32, 48, 64, 128, 256 | PNG-backed ICO |
| Apple touch | `public/icons/apple-touch-icon.png` | 180 | direct downscale |
| PWA standard | `public/icons/icon-192.png`, `public/icons/icon-512.png` | 192, 512 | direct downscale |
| PWA maskable | `public/icons/icon-192-maskable.png`, `public/icons/icon-512-maskable.png` | 192, 512 | safe-zone padded |
| PWA high resolution and existing social preview | `public/icons/mazer-app-icon.png` | 1024 | byte-identical copy |

`index.html`, both watch-pass HTML entries, `public/manifest.webmanifest`, `vite.config.ts`, and `scripts/windows/Prepare-MazerShortcut.ps1` are the current consumers. Workbox content revisions own invalidation; the explicit `mazer-final-icon-v2` query is ignored only for precache matching so versioned browser and manifest URLs resolve to those revisioned assets offline. There is no native iOS, Android, Capacitor, Electron, or Tauri catalog in this repository.

The existing Open Graph and Twitter metadata deliberately consume the app icon. This contract does not establish a general rule that social-preview artwork must equal the app icon.

## Superseded evidence

The older ATLAS data references and `public/icons/mazer-emblem.svg` / `public/icons/mazer-emblem.ico` remain non-authoritative historical evidence because this packet has no deletion or retention-change authority. They must not be restored as consumers. Historical packet documents may describe their former authority and are not current instructions.

## Verification and rollback

Acceptance requires exact master identity, byte-identical two-pass generation, declared output hashes and dimensions, standard-versus-maskable divergence, ICO frame coverage, browser and manifest resolution, Workbox precache coverage, route-aware favicon/install proof, a stale-reference classification, the affected repository checks, and independent exact-head review.

Rollback is source-only: revert the complete icon contract change as one unit. Do not partially restore old binaries, metadata, or cache configuration because their identities and consumers are coupled.

Rule: one locked repository master owns every app-icon derivative.

Pattern: validate identity, generate a minimum consumer matrix deterministically, bind content hashes, then prove consumer and cache wiring.

Failure Mode: manually replacing delivery binaries creates competing authorities; declaring an edge-to-edge square asset maskable allows platform crops to remove the identifying frame.
