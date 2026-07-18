# Mazer auth capability parity v1

## Authority

The machine-readable denominator is `docs/contracts/fitness-mazer-auth-capability-matrix.v1.json` (18 rows). It measures capability parity with Fitness without copying Fitness's server-rendered implementation into Mazer's client-only Phaser runtime.

## Phase-one contract

- Email and password remain the only login credentials. Mazer never resolves usernames client-side.
- New signup and updated passwords require at least 10 characters. Existing 6–9 character Mazer credentials remain login-compatible so adopting the stronger policy cannot lock out legacy accounts. The client does not truncate passwords or impose an application maximum; 128-character values are covered by regression proof.
- Supabase owns browser session persistence through `persistSession`, `autoRefreshToken`, `detectSessionInUrl`, and browser `localStorage`. This is Mazer's client-only equivalent of Fitness's server cookie synchronization, not a cookie implementation.
- Signup confirmation and password recovery always provide an explicit exact redirect URL. `VITE_MAZER_AUTH_CONFIRMATION_REDIRECT_URL` and `VITE_MAZER_AUTH_RECOVERY_REDIRECT_URL` may transfer ownership to the shared account portal when it exists. Until then, exact same-origin Mazer callback URLs remain the compatibility owner.
- `https://account.fawxzzy.com` is the approved future central origin. It is declared as future authority, not used as a false live cutover.
- Wildcard, credential-bearing, fragment-bearing, non-HTTPS, and otherwise invalid configured redirects fail closed to the exact same-origin compatibility route. Provider callback credentials are never logged and callback parameters are removed after Supabase consumes the callback.
- Reset requests use neutral copy for known and unknown accounts and a deterministic 60-second client cooldown. Provider rate limits remain authoritative.
- Provider errors are mapped into an allowlisted player-safe vocabulary. Raw provider messages are not rendered.
- Authenticated users can reach Account from Options to update email/display name, change or recover a password, and sign out locally.
- The canonical global username slot exists behind `VITE_MAZER_PLATFORM_USERNAME_CAPABILITY=read-write`. The default is disabled. Enabling the slot permits profile metadata editing only; it does not claim uniqueness, privileged resolution, or username login.

## Deferred provider/platform capabilities

TOTP, social login, phone login, anonymous login, magic-link-only login, and enforced MFA remain deferred. Leaked-password protection is a future Supabase provider setting and must not be represented as a client-side guarantee.

## Operational boundary

This source packet does not change a Supabase project, Auth settings, redirect allowlists, email templates, database objects, Vercel configuration, aliases, domains, or production deployments.
