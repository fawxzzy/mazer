# Mazer Authoritative Progression Hydration

## Root cause

The browser used one normalization path for both untrusted local saves and authenticated own-row Supabase responses. The local anti-tamper path requires a browser-only provenance sentinel. Coherent historical server rows created before that sentinel existed therefore normalized to Level 1 even though their level, completion count, and difficulty were valid and owned by the signed-in account.

## Contract

- Untrusted local progression still requires the provenance sentinel and fails closed to Level 1 when it is missing.
- An authenticated own-row Supabase response may supply missing provenance when its player level does not exceed completed cycles plus one.
- Accepted remote history is stamped with the sentinel before it enters account-scoped local storage, so later offline reads preserve the same account state.
- Impossible local progression and impossible remote ordinals still rebase to the safe Level 1 tutorial state.
- A remote row with a valid ordinal but obsolete difficulty above today's earned ceiling keeps its server-proven level/cycles while the unsafe difficulty pressure is clamped to that ceiling.
- The change does not alter authentication, row ownership, RLS, completion ordering, leaderboard ranking, maze generation, or production data.

## Verification surface

- A production-shaped historical row at Level 110 with 109 completed cycles remains 110 after remote hydration and after a later local read.
- The same payload remains rejected when presented as an unproven local save.
- An impossible remote Level 99 / three-cycle payload remains rejected.
- A valid remote Level 4 / three-cycle payload with obsolete maximum difficulty remains Level 4 while difficulty is clamped to the safe three-cycle ceiling.
- Existing remote merge, outbox, rollback, progression, TypeScript, and production-build checks remain required before publication.

## Source verification

- Focused progression and remote-hydration proof passed `2` files / `70` tests.
- Canonical verification passed `87` files / `769` tests with one intentional skip, plus the isolated Unreal source fixture at `1` file / `12` tests.
- TypeScript and the production Vite/PWA build passed; the build transformed `248` modules and generated `35` precache entries.
- The initial canonical run failed only because the isolated worktree could not auto-discover the retained Unreal fixture. Re-running the same command with its documented absolute `MAZER_LEGACY_UNREAL_RESTORE_ROOT` binding passed completely.
