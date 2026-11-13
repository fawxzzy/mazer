# Mazer app image: one source (MAZER-VIS-039, 2026-11-13)

Owner request: the image Mazer used for itself differed from the image the FawxzzyWeb site shows for Mazer. Both now come from one file, and every Mazer surface (install icons, favicons, link previews, iOS launch screens, the loader, the install gate) is derived from it.

## Source of truth

| Field | Value |
| --- | --- |
| Site repository | `fawxzzy/FawxzzyWeb` (local checkout `C:\ATLAS\repos\FawxzzyWeb`, commit `6f77084` when copied) |
| Site file | `public/apps/mazer/icon.png` (catalog key `icon` for slug `mazer` in `src/data/apps.ts`, the file the apps page and the Mazer detail page render) |
| Mazer copy | `src/brand/source-art/mazer-app-icon-master.png`, byte for byte |
| Identity | PNG, 1024 x 1024, 934,398 bytes, SHA-256 `91764e546b8c1488b3d48baeda927ae18600b088178e190244fb9d8ce35e2440` |
| Look | Pixel-art "M" drawn as a maze, green / red / cyan markers, the MAZER wordmark, a teal rounded frame, black surround (the file is fully opaque) |
| Replaced | the neon-diamond master `ede90e59...14d78` (1,173,366 bytes) and the 1200x630 maze-screenshot share preview `a7e34fa6...e9f7` |

The site has no separate Mazer link-preview image (its Open Graph image is the generic Fawxzzy one), so the Mazer link preview is the same app image composed onto a 1200x630 card.

To re-sync after the site image changes: copy the new file over the master, update `MASTER_SHA256` / `MASTER_BYTES` in `scripts/brand/generate-mazer-icons.mjs`, `MAZER_ICON_SOURCE_SHA256` and the derived hashes in `src/brand/mazerIconQualityTarget.ts` (and `SITE_SOURCE_SHA256` in `tests/brand/mazer-app-image-single-source.test.ts`), then run the four generators below and bump `MAZER_ICON_CACHE_VERSION`. The test `mazer-app-image-single-source.test.ts` compares against the site checkout when one exists and fails on drift.

## Derivatives (all committed, all reproduced by `--check`)

| Output | Generator | Notes |
| --- | --- | --- |
| `public/icons/mazer-app-icon.png` | `node scripts/brand/generate-mazer-icons.mjs` | byte-identical copy, 1024, manifest "any" |
| `public/icons/icon-192.png`, `icon-512.png` | same | Lanczos3 resize of the whole master |
| `public/icons/icon-192-maskable.png`, `icon-512-maskable.png` | same | master scaled so the VISIBLE art (frame, maze, wordmark; measured radius 583 px of 1024) sits inside the 80% safe circle on black; the older "whole square in the circle" rule made the art 57% of the canvas, this makes it 70% |
| `public/icons/apple-touch-icon.png` | same | 180, flattened on `#02080f`, no alpha (iOS paints transparency black) |
| `public/favicon.ico`, `public/icons/mazer-app-icon.ico` | same | 16, 32, 48 PNG-in-ICO; black surround cropped and corners rounded (transparent) so a tab shows the art, not a black square |
| `public/share/mazer-share-preview.png` | `node scripts/brand/generate-share-preview.mjs` | 1200x630, the image centred on `#02080f` with a teal glow; no text (no system-font drift), no browser |
| `public/splash/ios-*.png` (9) | `node scripts/brand/generate-ios-launch-art.mjs` | icon at 30% of the width, centred; same size and place as the boot loader so the launch image hands over without a jump |
| `src/brand/bootLoaderIconData.ts` and the `<img>` in `index.html` | `node scripts/brand/generate-boot-loader-icon.mjs` | 256 px lossy WebP (80), 11,356 bytes, inlined as a data URI so the loader never waits on a request |

No generator uses the network. `npm run brand:icons` and `npm run brand:icons:check` still drive the first one; the other three are run with `node` (this card does not edit `package.json`).

## Where the image is used

Manifest icons (192, 512, maskable 192 and 512, 1024) and the shortcut icon; `index.html` favicon links, apple-touch icon, `og:image`, `og:image:secure_url`, `twitter:image` (all `https://mazer.fawxzzy.com/share/mazer-share-preview.png?v=share-v2`), nine `apple-touch-startup-image` links (`?v=mazer-launch-v2`); the two watch-pass pages' favicon and apple-touch links; the HTML boot splash; the in-game loading cover; the install gate card. The in-game title wordmark is tile-font text and the Guide uses HUD icons, not the logo, so neither changed.

## Cache and size

- Icon URLs carry `?v=mazer-site-icon-v1` (was `mazer-final-icon-v2`); the service worker ignores the `v` parameter (`ignoreURLParametersMatching`) and precache entries are revisioned by file content (Workbox md5), so the new bytes get new revisions and the old icons are dropped on the next service-worker update. `scripts/brand/verify-mazer-icon-delivery.mjs` checks this against a deployed origin.
- `includeAssets` precache weight: 2,257,957 B before, 1,740,528 B after (-517,429 B); `tests/architecture/boot-payload-budget.test.ts` stays green. The boot preload set (`public/assets`) is unchanged. `index.html` grew by about 14 KB (the inline icon plus the new loader CSS).
- `public/share/` and `public/splash/` are not precached (unchanged).

## Not verified

Link-preview rendering on real platforms (iMessage, Slack, Discord, X, Facebook caches keep the old image until they refetch; the `?v=share-v2` change forces a new URL), the home-screen icon on a real iOS or Android device, and the iOS launch image on a real iPhone.
