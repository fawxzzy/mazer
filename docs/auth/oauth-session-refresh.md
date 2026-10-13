# Mazer OAuth session refresh

Mazer is a public OAuth client of the master Supabase Auth server. Its PKCE
callback obtains tokens from `/auth/v1/oauth/token`. These tokens also refresh
through that endpoint with `grant_type=refresh_token` and the registered public
`client_id`. The normal supabase-js `/auth/v1/token` refresh is for native Auth
sessions and does not implement this OAuth client flow.

`legacyOAuthRefresh.ts` adapts only that exact SDK refresh request for a current,
matching Mazer OAuth session. All other requests and native password/recovery
sessions retain their existing transport. The SDK still owns session persistence,
cross-tab locking, refresh scheduling, notifications and retry behavior; there is
no second session manager or global fetch patch.

The adapter sends only the refresh grant and public client ID to the fixed master
OAuth endpoint. It forwards no cookies or caller headers, follows no redirects,
and bounds time and response size. It checks issuer, client, subject, session,
audience, role and expiry before normalizing the response for the SDK. The user
object belongs to the existing validated session; this refresh does not claim to
refresh profile metadata. A returned refresh token replaces the old one; omission
preserves the old token, as allowed by the provider contract.

Storage drift or transport uncertainty is retryable through the existing SDK.
HTTP 408, refresh-contention 409, 429 and server errors become sanitized 503 responses because the pinned
SDK treats other error statuses as terminal and removes the session. Invalid
grants and malformed successful responses still fail closed. No errors contain tokens or raw provider
body content. Tokens never belong in receipts, browser console output or tests
using live accounts. This adapter changes no gameplay, progression or profile data.

Normalized success and error responses use the baseline `Response` constructor,
so supported browsers do not need the newer static `Response.json` method.

Focused tests use synthetic tokens and a mock provider, including an actual
supabase-js expired-session refresh. Production acceptance must separately observe
the OAuth refresh endpoint, authenticated reload and unchanged progress. The
October 13 HTTP400 response body was unavailable, so its precise provider error
and all historical sign-out causes remain unknown.

Reference: [Supabase OAuth 2.1 flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows).
