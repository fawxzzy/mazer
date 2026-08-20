# Mazer Branded Host Migration

## Current contract

- Canonical public origin: `https://mazer.fawxzzy.com`.
- The stable legacy host `https://fawxzzy-mazer.vercel.app` is a migration entrypoint only.
- Requests on that exact legacy host receive a permanent redirect to the same path and query on the canonical origin, except `/sw.js`, and add the one-use `compatibility=mazer_legacy_origin` marker.
- `/sw.js` is a same-origin retirement worker for existing legacy installations. The current app worker is `/app-sw.js`.
- Preview and immutable Vercel deployment URLs do not match the host condition and remain available for rollback and verification.
- Git-triggered Vercel deployments remain disabled. Source publication does not imply a production deployment.

## User migration behavior

The host change does not transfer cookies, local storage, or installed-PWA identity across origins. Existing legacy `/sw.js` registrations update to a retirement worker that clears Mazer caches, unregisters itself, and navigates controlled windows to the branded origin with path and query preserved. Existing users may still need to sign in again and reinstall Mazer from the branded origin. Server-backed account progress remains authoritative after sign-in; browser-only state on the old origin remains local to that origin.

The branded runtime removes the compatibility marker immediately. When
`VITE_FAWXZZY_ANALYTICS_URL` is configured, it sends one closed anonymous
`compatibility_visit` event; when the variable is absent, no analytics request is made. The legacy
host remains in place until a declared observation window records zero matching events, rollback
evidence is retained, and a separate retirement decision is approved.

## Provider boundary

Supabase site URL and redirect allowlists, OAuth callbacks, and any other provider-managed origin policy must admit the branded origin under separate authenticated provider authority before production cutover. The source redirect does not grant or perform that provider mutation.

Historical receipts may continue to name the old Vercel host as provenance. They are not current routing authority and must not be rewritten.
