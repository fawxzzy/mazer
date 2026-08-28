# Mobile + PWA Plan

## Current status (April 6, 2026)
- The web app remains tuned for laptop keyboard-first play and board readability.
- Touch support stays intentionally secondary (swipe to move, tap to pause) and should only be active for coarse-pointer environments.
- PWA installability plumbing is wired to repository-supplied assets via:
  - `public/manifest.webmanifest`
  - icon/meta links in `index.html`
  - `vite-plugin-pwa` integration in `vite.config.ts`

## Service worker stance
- Keep service worker disabled in local development (`vite dev`) to avoid stale localhost caches during gameplay iteration.
- Enable service worker only in production builds/deploys.

## Asset policy
- The only authoritative icon artwork is `src/brand/source-art/mazer-app-icon-master.png`, locked to SHA-256 `ede90e596682795d10f97bed615071ca1f60e08e290eacf1ea143006df914d78`.
- Run `npm run brand:icons` to generate these repository-owned delivery assets:
  - `/public/favicon.ico`
  - `/public/icons/mazer-app-icon.ico`
  - `/public/icons/mazer-app-icon.png`
  - `/public/icons/apple-touch-icon.png`
  - `/public/icons/icon-192.png`
  - `/public/icons/icon-512.png`
  - `/public/icons/icon-192-maskable.png`
  - `/public/icons/icon-512-maskable.png`
- Maskable outputs add deterministic opaque padding so the complete master fits the guaranteed safe circle; they must not be byte-identical to standard outputs.
- Older Atlas reference copies and the Mazer emblem files are superseded evidence, not design sources or active consumers.

## Installability checks
- Confirm `manifest.webmanifest` references all provided icon binaries.
- Confirm `index.html` links include ICO favicon, PNG favicon sizes, apple-touch icon, and manifest.
- Confirm production build emits PWA registration plumbing.
- Confirm localhost development does not register a service worker.
- Run `npm run brand:icons:check` and confirm Workbox precaches every generated delivery asset.

## Capacitor / app-store path (later)
When web gameplay and UI stabilization are complete:
1. Add a Capacitor shell around the built web app.
2. Map system back-button behavior to in-game overlay state.
3. Verify orientation lock and safe-area handling on device.
4. Add native store metadata, screenshots, and privacy details.
5. Ship as a store track only after parity checks against the web build.

## Near-term checks
- `npm run build`
- `npm run test`
- Validate that localhost dev does not register a service worker.
- Run Lighthouse installability checks against the production preview.
