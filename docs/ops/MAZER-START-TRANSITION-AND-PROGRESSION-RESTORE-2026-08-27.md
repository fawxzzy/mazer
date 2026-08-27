# Mazer Start Transition and Progression Restore

## Scope

This correction closes the remaining player-visible defects reported after the
R019 account-runtime release:

- intermittent Start -> maze loading -> menu regression;
- player transfer lasers and green energy landing outside the final
  deconstruct/build steps;
- transfer energy drifting away from the rotating title diamonds;
- border bleed-off paths becoming wider than their single connected corridor;
- incorrect Level-1 leaderboard/account values created by the R019 historical
  progression classifier;
- stale visual-proof assumptions for the retired menu level badge and stateful
  option labels.

The already-shipped ten-user leaderboard page, inner-only green menu profile
button, auth-bound username rename RPC, neutral default Board Zoom, and Levels
1-110 topology contract remain in scope for regression verification rather than
being rebuilt.

## Root causes and corrections

### Start transition

`startPlayMode()` installed the play maze immediately but left an older delayed
menu `pendingGenerationRequest` alive. `update()` could consume that request on a
later frame and let its captured `mode: 'menu'` replace the active play surface.
Both explicit mode-entry functions now cancel the prior mode's delayed request
before installing the new mode. A built-app stress capture clicks Start while a
real queued menu regeneration is present and samples the following four seconds
for any menu-mode or stale-menu-request recurrence.

### Player transfer timing and geometry

The row and tile reveal counters finish independently. The previous inbound
beam trigger watched only one counter, so the beam could finish before the
actual final build step. The arrival trigger now uses the later completion clock
and backdates only the travel portion needed to converge on that final step.
Outbound transfer keeps the player visible while it fades, each build resets the
spawn timestamp, and both energy particles and title diamonds consume the same
orbit geometry and crown size.

### Bleed-off width

Border docks already owned one direction-specific connected-tile band. Extra
cross-axis corner guard rectangles widened that band. The guards are removed;
base, facet, and glow all remain within the same single-corridor dock frame at
DPR 1, 2, and 3.

### Progression reset

R019 classified a historical play receipt as accepted evidence only when
`client_run_id` was non-null. Valid pre-idempotency receipts intentionally have
null `client_run_id`, so nine accounts with exact retained progression were
incorrectly reset to the Level-1 baseline. The source migration now treats any
conserved `surface = 'play'` receipt as historical completion evidence and never
uses nullable metadata as proof that play did not happen.

The bounded R020 restore uses the encrypted R019 preimage to restore the exact
nine retained scalar/JSON player tracks. It does not infer levels from receipt
counts, touch usernames/profiles/Auth/AI state, insert or delete rows, or change
receipt denominators. Action-time gates require the exact R019 postimage and
zero newer targeted play receipts. A private action-time preimage plus a
PostgreSQL 17 fixture prove exact targeted rollback.

Historical player JSON is normalized explicitly: retained keys win, exact
scalar columns supply missing `rank`/`targetComplexity`, timestamp columns
supply the completion time, and canonical peak/color/baseline fields are filled
only when the older shape omitted them. This preserves valid old shapes without
guessing a level or replacing unrelated current state.

At the retained preflight, `trezzz` restores from Level 1 to the exact retained
Level 59 state and `fawxzzy` restores from Level 1 to the exact retained Level
110 state. This is a restoration of observed pre-R019 state, not a fabricated
progression value.

## Verification contract

1. Focused source tests cover stale-request cancellation, independent row/tile
   timing, per-build spawn reset, shared orbit geometry, and one-band bleed
   docks.
2. Built-app transition capture covers menu, options, play, and pause across
   phone -> desktop -> phone viewport changes with no implicit board zoom.
3. Built-app Start stress must include at least one real queued menu request and
   report zero return-to-menu cases, zero stale menu requests, and zero browser
   errors.
4. PostgreSQL 17 runs under PowerShell 7 and Windows PowerShell 5.1, preserving
   all historical play-receipt shapes, rejecting username ownership/collision
   failures, conserving receipts, restoring the R020 preimage, and proving exact
   rollback.
5. The full 110-image progression gallery records actual maze size, selected
   deterministic candidate seed, walkable count, and topology SHA-256. Levels
   1-10 must progress monotonically; each Level 1-99 target-complexity step is
   exactly four; Levels 99-110 must share the same capped topology for the same
   base seed.
6. Final live restore requires fresh nine-row/high-water/RLS/receipt checks and
   one protected single-use approval. Production release remains separately
   bound to the exact reviewed source head.

## Durable lessons

- **Failure Mode:** A nullable idempotency or recipe field is not evidence that
  a historical event never occurred.
- **Rule:** Data repair classifiers must use the oldest conserved evidence shape
  they claim to preserve, and must carry a fixture for that shape.
- **Pattern:** Mode-owned delayed work must be cancelled at the mode boundary;
  an asynchronous request may not retain authority to restore its captured mode
  after the user explicitly leaves it.
- **Pattern:** Coupled visual effects share one geometry owner and align to the
  later of all independently completing build clocks.
