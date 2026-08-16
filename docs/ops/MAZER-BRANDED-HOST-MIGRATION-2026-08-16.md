# Mazer Branded Host Migration

## Current contract

- Canonical public origin: `https://mazer.fawxzzy.com`.
- The stable legacy host `https://fawxzzy-mazer.vercel.app` is a migration entrypoint only.
- Requests on that exact legacy host receive a permanent redirect to the same path and query on the canonical origin.
- Preview and immutable Vercel deployment URLs do not match the host condition and remain available for rollback and verification.
- Git-triggered Vercel deployments remain disabled. Source publication does not imply a production deployment.

## User migration behavior

The host change does not transfer cookies, local storage, service-worker registrations, or installed-PWA identity across origins. Existing users may need to sign in again and reinstall Mazer from the branded origin. Server-backed account progress remains authoritative after sign-in; browser-only state on the old origin remains local to that origin.

## Provider boundary

Supabase site URL and redirect allowlists, OAuth callbacks, and any other provider-managed origin policy must admit the branded origin under separate authenticated provider authority before production cutover. The source redirect does not grant or perform that provider mutation.

Historical receipts may continue to name the old Vercel host as provenance. They are not current routing authority and must not be rewritten.
