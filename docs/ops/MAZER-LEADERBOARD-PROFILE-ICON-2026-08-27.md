# Mazer Leaderboard and Main-Menu Profile Correction

## Scope

- Restore the documented player completion-ordinal invariant used by the leaderboard.
- Replace the main-menu username text with the inner green profile glyph in the same leading header slot.
- Preserve the account route, touch target, title row, settings/leaderboard controls, username data, rank, bounded difficulty, receipts, RLS, and Auth ownership.

## Root cause

R017 correctly preserved independently reconciled monotonic maxima, but historical player rows can carry a `player_level` and `player_completed_cycles` pair that no longer satisfies the superseding one-completion/one-level contract. The leaderboard reads `player_level` directly, so seven rows in the current public population display a stale completion ordinal even though the scalar and JSON projections agree with each other.

The menu miss is separate and source-local: the front-door account control still executes the older username-label renderer. The reusable profile renderer also draws an outer rainbow ring by default, so it could not meet the requested inner-green-only menu treatment without an explicit ring switch.

## Correction contract

- Close each historical player pair monotonically to `max(player_level, player_completed_cycles + 1)` and set the paired cycle count to one less than that level.
- Never lower level, completed cycles, target complexity, rank, receipts, or ownership state.
- Update the nested player JSON projection and revision with the scalar row in the same transaction.
- Ratchet a validated database check so later drift fails closed.
- Keep the leaderboard RPC shape and client parser unchanged; once the row invariant is true, the existing rank/page functions return the correct value.
- Render only the inner Mazer-green profile glyph on the menu. The transparent square remains the full account hit target, while the overlay profile icon retains its existing outer ring.
- Use the exact settings-cog pulse/hover envelope for the menu profile glyph.

## Shared-pattern intake

| Shared lesson | Classification | Local owner | Proof |
| --- | --- | --- | --- |
| Safe-area and dynamic viewport ownership | `ADAPT` | `resolveLegacyHeaderControlFrame` | Phone and desktop menu capture; icon stays inside the existing safe header lane. |
| Persistent bottom controls | `NOT_APPLICABLE` | No bottom-control change | Existing play/touch tests remain green. |
| Safe-default responsive layouts | `ADOPT` | `resolveLegacyMenuLayout` | 320px, normal-phone, and desktop header-layout tests plus captures. |
| Install is a capability, not a promise | `NOT_APPLICABLE` | No install change | Existing PWA verification remains green. |
| Served-build provenance | `ADOPT` | Production release verification | Exact merged commit/deployment readback and route-aware production smoke. |
| One overlay and recoverable interaction | `ADOPT` | `MenuScene` account action | Existing account overlay route and back/close tests remain green. |
| Accessible motion and visual preferences | `ADAPT` | Existing menu animation owner | Profile reuses the settings pulse and the existing reduced-motion frame policy. |
| Versioned, explainable persistent state | `ADOPT` | Master progression row/RPC contract | Migration fixture, exact pre/post aggregate proof, revision ratchet, and rollback preimage. |

## Verification and release gates

1. Focused UI/layout, leaderboard, remote-progression, migration, and capture-contract tests: `133/133` passed.
2. PostgreSQL 17 apply/rollback fixture: monotonic closure, JSON projection, sibling JSON preservation, validated constraint, and exact rollback passed with zero provider calls/live writes.
3. Canonical `npm run verify`: `759/759` runnable tests passed (`1` explicitly skipped), followed by the production build (`main-BHhIrHDh.js`).
4. Desktop and phone built-app menu captures passed with zero browser page errors; the inner-only profile glyph occupies the leading title row and opens the existing Account surface.
5. Exact live aggregate preflight before the protected database repair; private preimage retained for exact rollback.
6. Post-apply zero invariant failures, unchanged row/receipt/ownership denominators, exact leaderboard rank/value readback, merged production deployment, and final route smoke.
