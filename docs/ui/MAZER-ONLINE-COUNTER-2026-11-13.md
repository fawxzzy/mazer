# Main-menu "online now" counter (MAZER-UI-024)

The main menu shows a small live count of players currently in Mazer, top-left, where the signed-in username used to be. It is
the same mechanism as the website header counter (FawxzzyWeb `docs/live-presence.md`, `src/lib/presence/*`), on its own channel.

## Where the number comes from
- Supabase Realtime **presence** on the public channel `mazer-presence-v1` (the website uses `web-presence-v1`, so the two counts never mix).
- Joined with the public key Mazer already ships for sign-in (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), through the same
  fail-closed project allow-list as the sign-in client (`legacySupabaseSchemaBinding.ts`).
- **No SQL, no Edge Function, no table, no policy, no Supabase setting, no new env value.** Nothing was applied anywhere.
- The count is recomputed from the channel's presence snapshot on every sync, never accumulated from join/leave events.

## Definition
**Online** = a Mazer tab that is signed in and **visible in a browser right now**. One per tab; a person with two visible windows counts
twice; a hidden tab does not count. Not a visitor total, not an account count.

## Privacy model
- Each tab joins with a random in-memory key (`crypto.randomUUID()`), tracked payload is exactly `{ v: 1 }`. No account, username, email,
  route, user agent or free text. No cookie, no storage. Only an aggregate number is ever shown, never a name.
- No session across visits: the key is gone when the tab closes. Nothing is stored by Mazer; Realtime drops a presence when its socket goes away.
- Signed out: **no connection at all** (no extra network). The counter is not shown.
- Leaves on `visibilitychange` to hidden, on `pagehide`, on sign-out and when the scene shuts down.
- Only the production origin `https://mazer.fawxzzy.com` connects. Localhost, previews and other hosts are inert.

## Cadence and failure behaviour
| What | Value |
| --- | --- |
| Join | 2.5 s after the signed-in menu is up (never competes with first paint) |
| Heartbeat | the Realtime client's own websocket heartbeat, 25 s, only while connected (i.e. while the tab is visible) |
| Watchdog | every 30 s: a socket that is not connected/joined reports "unknown" |
| New count accepted | at most once per 1.5 s (bursts coalesce, newest wins) |
| Number change | eased in whole steps over 0.7 s, at most 8 visible steps, lands exactly on the count |
| Appear / disappear | fade in 0.45 s; on "unknown" the last number is held 5 s, then fades out 0.3 s |
| Reduce Motion | no fade, no easing, no pulse dot |
| Zero, unknown, error, timeout, offline, library load failure, missing config | **nothing is drawn** (no "0 online", no dash, no toast, no error text) |

The first presence sync arrives before this tab has joined and reports 0; it is never shown.

## Look
Tile glyph font (the 5x7 chip cells the wordmark uses), lit mint number, quieter word `ONLINE` when there is room, optional small
pulse dot (only when Reduce Motion is off and there is room). Every digit advances the same width (tabular), the number is anchored
to the leading icon so growing counts extend to the right. Fit tiers (`legacyPresenceCounterLayout.ts`): number + ONLINE at cell 3, at cell 2,
number alone at cell 3, at cell 2, otherwise hidden. It never overlaps the icon or the title. Counts of 1,000 or more read `1K`, `12K`
(capped `99K`) because the tile font has no punctuation; the website shows `1.2k`.

## Header order
Leaderboard icon top-left (leading), the counter beside it, the MAZER title centred, then the profile icon and the settings cog on the
right (profile = trailing slot 1). The username is no longer shown in the main-menu header; it stays in the leaderboard (your row)
and the account portal. `legacyHeaderIdentity*.ts` is left in place (still unit-tested) but nothing in the scene uses it any more.

## Known limits
- The channel is public: anyone holding the public key can join it and inflate the number. It is a casual indicator, not a measurement.
- Realtime connection quotas are shared across the Supabase project; past them the counter simply disappears.
- The tile font has no `.` or `,`, so 1,234 is shown as `1K`.
- Changing the definition (for example dedupe per browser) needs a reviewed identifier and retention contract.

## Code
`legacyPresenceContract.ts` (pure rules), `legacyPresenceClient.ts` (lazy Realtime session, injectable), `legacyPresenceDisplay.ts`
(coalesce, ease, fade, stale), `legacyPresenceCounterLayout.ts` (geometry), `legacyPresenceController.ts` (signed-in lifecycle),
`MenuScene.drawLegacyMenuPresenceCounter` / `tickLegacyPresence` (thin wiring). QA: `window.__MAZER_QA__.setPresenceCount(n | null | undefined)`
(only with `?runtimeDiagnostics=1`, no network).

## Privacy copy
Mazer has no privacy page of its own (`/privacy` redirects to the account portal, text in FawxzzyWeb `src/config/legal.ts`). That text
needs one added sentence naming Mazer, for example: "While Mazer is open and visible in your browser and you are signed in, it may open an
anonymous live connection to Supabase so the menu can show how many players are online. The connection uses a random identifier that exists
only in memory for that tab, is not linked to you or your account, is not stored, and ends when you leave or switch tabs." That is a
FawxzzyWeb change, not part of this PR.
