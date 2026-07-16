# Mazer Mobile Control Intent Rework - 2026-07-16

## Status

Review-ready maintenance packet on `codex/mobile-control-intent-rework-20260715`.

This packet fixes the reported Player Guide clipping and reworks held stick/arrow intent at walls and junctions. It does not add route knowledge, solver behavior, or production deployment.

## Requested-edit reconciliation

| Requested behavior | Disposition | Evidence |
|---|---|---|
| Stop clipping the left side of Player Guide | Landed | Compact guide geometry now starts at the overlay viewport mask; 390x844 browser diagnostics reported guide left `44` and viewport left `44`, with clean visual inspection. |
| Keep a mostly-cardinal stick pull on its dominant lane at a T | Landed | A live up-dominant/right-secondary hold at player `(11,18)` continued to `(11,13)` without taking the legal right branch. |
| Auto-shift one tile at a wall, then resume the held direction | Landed | Resolver fixtures cover horizontal and vertical wall offsets and require the dominant lane to be legal immediately after the one-tile fallback. |
| Do not leave the stick stuck after reaching a wall/corner | Landed | Captured held input now keeps a bounded repeat scheduled while blocked, allowing the same pointer to recover after retargeting. |
| Let arrow input slide beyond buttons and through the center without dropping | Landed | Live captured Down input remained active outside the visible frame and through the center deadzone; pointer release cleared control, capture, and timer state. |

## Root causes

1. The compact guide card began six pixels left of its scroll mask after the scrollbar-center adjustment, so the mask clipped the card's left edge.
2. The held-touch repeat timer was canceled on the first blocked movement. The pointer stayed captured, but identical later samples returned early and never restarted movement.
3. Stick input produced an ordered 16-segment dominant/fallback pair, but `MenuScene` recomputed it using a separate `0.82` analog threshold. That discarded useful fallback intent and conflated a weak secondary lean with a real queued turn.
4. Captured arrow movement returned `null` outside the frame and inside the center deadzone, dropping the held direction during a continuous thumb slide.

## Contract and implementation

- `legacy-directional-intent-v3` separates the single bounded secondary direction into explicit `turn` and `fallback` roles.
- A decisive new preferred direction remains a queued turn and is consumed at its first legal opening.
- A weak analog secondary cannot peel the player off a legal dominant lane at a T. It is considered only when the dominant lane is blocked and the one-tile shift immediately restores that lane.
- Held arrow/stick input keeps its repeat scheduled at a blocked cell until pointer release or another lifecycle cleanup boundary.
- Captured arrows can resolve beyond the rendered frame and preserve the previous direction through the center deadzone.
- Compact Player Guide horizontal margin moved from `36` to `48`, aligning it with the viewport mask instead of crossing it.

## Verification

- TDD red phase: five expected failures covered dominant-lane junction behavior, one-tile fallback behavior, beyond-frame arrow capture, held-repeat recovery, and compact guide alignment.
- Focused green gate: `5` files / `84` tests.
- TypeScript: `npm run lint` passed.
- Full repository verify: clean rerun passed `49` files / `367` tests and the production-mode Vite/PWA build; output included `assets/main-C7dv4-4e.js`.
- The first full verify run passed `48` files / `366` tests but one unrelated generated-menu topology case exceeded its fixed `20s` limit. The isolated retry passed in `10.38s`, then the clean full rerun passed the same case in `9.66s`.
- Isolated 390x844 browser proof showed:
  - Player Guide aligned and visually uncut;
  - real T-junction dominant-lane continuity;
  - arrow capture beyond the frame and through the center deadzone;
  - blocked-cell repeat still active while held;
  - complete release cleanup;
  - no page errors or warning/error console output.
- Local-only proof artifacts: `tmp/captures/mazer-mobile-control-intent-rework-options.png`, `tmp/captures/mazer-mobile-control-intent-rework-play.png`, and `tmp/captures/mazer-mobile-control-intent-rework-arrows.png`.
- `tests/ai/demo-walker.test.ts` remained untouched.
- `git diff --check` passed.

## Post-work review

- Scope is limited to control intent, held touch capture/retry, compact guide alignment, their tests, and their governing documentation.
- Gameplay legality still routes through `resolveLegacyNavigationTarget(...)`; accepted mutation still routes through `WorldTurnSystem`.
- No production deployment, account mutation, Supabase mutation, or unrelated Mazer/Atlas/DiscordOS source work occurred.
- Remaining acceptance is operator feel verification on a physical phone after a separately authorized release.
