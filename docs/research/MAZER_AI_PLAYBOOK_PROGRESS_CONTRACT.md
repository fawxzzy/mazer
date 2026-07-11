# Mazer AI, Playbook, and Progression Contract

Status: active local-first contract

## Scope

This contract formalizes how Mazer can learn from completed maze cycles without
adding enemies, traps, obstacles, items, accounts, payments, or remote analytics
as gameplay features.

The current pass is metrics-only:

- record compact cycle receipts
- record compact AI decision summaries for menu-demo runs
- keep player progression and AI-runner progression separate
- expose Atlas-safe reports and docs
- leave future danger/enemy/trap/item/urgency scoring as dormant advisory inputs

## AI Thinking Model

The menu-demo runner uses `human-local-memory`:

- it starts from the start tile after build completion
- it sees only local neighboring paths plus the known goal direction/distance
- it stores visited tiles
- it stores split points and which branches were tried
- it marks exhausted dead-end branches so it does not intentionally re-enter them
- when local options run out, it chooses the best remembered split and travels
  the shortest known route back to that split when known-space topology allows
  it; physical stack-unwind backtracking is only the fallback
- it scores split choices by distance-to-goal plus deterministic human-like noise
- it accounts for wrapped/off-border neighbor distance when those paths exist
- it falls back to a legal path only if the bounded local-memory route cannot finish

The model is intentionally not omniscient. It should feel like a top-down human
tracing a route with memory, not a perfect solver and not a random walker.

## Decision Receipt

AI decisions are summarized as a compact receipt attached to menu-demo cycle
telemetry:

```ts
{
  thinkingModel: 'human-local-memory' | 'legacy-source' | 'unknown',
  decisionCount: number,
  wrongBranchCount: number,
  backtrackCount: number,
  recoveryCount: number,
  optionalRetargetCount: number,
  visitedUndoCount: number
}
```

Rules:

- Do not store the full AI route in Atlas reports.
- Do not expose these details to players by default.
- Do not use these fields to legalize movement.
- Use them to tune menu-demo AI feel, AI-runner progression, and future
  difficulty recommendations.
- `optionalRetargetCount` means the AI chose to walk back through known floor
  to a previously recorded split because that remembered option scored clearly
  better than the current local option. It is a planning signal, not a teleport.

## Complexity Formula

`resolveLegacyMazeComplexity()` is the current numeric complexity source. It
combines:

- maze size
- solution path length
- floor coverage
- route quality
- meaningful shortcut/bypass coverage
- checkpoint/path-builder contribution

Size is already part of the formula, but the next safe evolution is to separate:

- fixed render frame size: the board should keep filling the same border area
  for mobile readability
- logical generation span: the maze generator can cap or expand the active
  usable X/Y span inside the fixed frame
- runtime performance cap: if frame timing degrades, the generator should hold
  or lower logical span instead of increasing visual tile density beyond what
  the device can render smoothly

This complexity number maps to:

- `level`: bounded 1-99 display/rank progression
- `rank`: E, D, C, B, A, S
- `targetComplexity`: next-cycle generation target
- `peakComplexity`: highest proven completed complexity
- `colorTier`: player/trail/badge visual progression palette

## Separate Progression Tracks

Mazer tracks two progression lanes:

- `player`: advanced only from played-game completions
- `ai-runner`: advanced only from menu-demo completions

They must not be merged. The main menu may display AI-runner level because the
menu is the AI-runner surface. Play mode may display player level because the
played game is the player surface.

## Playbook Boundary

Playbook may score only legal candidate moves.

Current advisory scoring terms:

- frontier value
- backtrack urgency
- trap suspicion
- enemy risk
- item value
- puzzle value
- rotation timing

Hard boundary:

- these terms are scoring inputs only
- they are dormant unless observations provide cues
- they do not add traps, enemies, obstacles, or items to gameplay
- they do not decide legal moves
- they do not write truth into Atlas

Future obstacle/enemy work should plug into these existing scoring fields only
after the game design explicitly unlocks that lane.

## Diagonal And Wrapped Path Boundary

Wrapped/off-border cardinal paths are active in the AI neighbor and distance
model. They should be treated like a folded globe/cylinder: an edge exit is a
real neighbor to the opposite-side matching tile when both tiles are valid.

Diagonal movement and diagonal path tiles are not active gameplay yet. The
safe implementation sequence is:

1. Add diagonal neighbor legality to the maze graph model.
2. Add diagonal path generation with no corner clipping or wall-cut exploits.
3. Add a diagonal visual material that fills the touching-corner gap while
   keeping tile-scale readability.
4. Update AI, player movement, compass, trail, telemetry, and topology tests to
   use the same graph contract.
5. Only then use diagonal paths for spiral, loop, or more organic maze layouts.

Do not add visual-only diagonal tiles before the movement graph supports them.

## Atlas Use

Atlas should consume `mazer.cycle-learning.report.v1` reports, not browser
localStorage directly.

Atlas-safe reports may contain:

- aggregate cycle learning
- compact recent receipt previews
- compact AI decision summaries
- progression/rank signals
- risk flags
- next-action recommendations

Atlas-safe reports must not contain:

- full raw player paths
- service-role secrets
- Supabase tokens
- unbounded localStorage dumps
- player-facing debug internals

## Auth And Remote Sync

Auth is currently local-first unless Supabase env vars and a dedicated Mazer
Supabase project are configured.

Remote sync should remain behind:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAZER_REMOTE_PROGRESSION=true`

Remote tables must use explicit grants plus RLS. Stripe/license tables are
future-ready schema planning only until the payment wall is intentionally
unlocked.

## Next Implementation Lanes

1. Configure local/Vercel browser-safe Supabase env vars for the dedicated
   Mazer project.
2. QA signup/login/logout with a test account.
3. Enable gated login screen only after auth QA passes.
4. Add remote progression sync proof for both `player` and `ai-runner`.
5. Persist compact cycle receipts remotely after auth proof.
6. Feed compact reports into Atlas receipts for cross-session reasoning.
