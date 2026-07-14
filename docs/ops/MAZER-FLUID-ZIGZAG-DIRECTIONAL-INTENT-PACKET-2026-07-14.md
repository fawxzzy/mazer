# Mazer Fluid Zigzag Directional Intent Packet

Date: `2026-07-14`

## Outcome

The bounded directional-intent slice of `mazer-fluid-controls-and-motion` is complete and review-ready in draft PR [#64](https://github.com/fawxzzy/mazer/pull/64). The parent card remains open: this packet closes shared run-to-block steering, latest-wins queued turns, bounded zigzag assistance, and exact browser proof, but does not claim the card's broader pace/feel tuning is terminal.

No production deployment occurred.

## Git truth

- Base: `0db88a153b5ed990664903f031e988fb88c5288e` (`origin/main` when admitted)
- Branch: `codex/fluid-zigzag-intent-resolver`
- Product commit: `dd5e94836c3984525d744b30ef326693918e8f69`
- Fresh-maze proof-race fix: `177d7e86d37134a1003673f62befa1f3bda6a843`
- Explicit desktop proof context: `542bc3f5d43baeb56d0eb742972d960e7cfd16df`
- Draft PR: `#64`, base `main`, head `codex/fluid-zigzag-intent-resolver`
- Protected canonical modification `tests/ai/demo-walker.test.ts` in `C:\ATLAS\repos\mazer` was not edited, staged, reset, or moved.

## Implemented contract

- One `LegacyDirectionalIntentResolver` is shared by keyboard, on-screen arrows, stick drag, board swipe, and the QA bridge.
- The resolver keeps one active direction and exactly one latest-wins queued direction.
- A queued turn is consumed immediately at its first legal opening; otherwise the active direction continues while legal.
- Exactly one non-reversing continuation may be taken at an unambiguous blocked corner, with a hard four-assisted-turn bound.
- Dead ends, genuine branch ambiguity, mismatched queued intent, and the assistance bound stop automation and require fresh input.
- Direct and paired-wrap legality stays owned by `resolveLegacyNavigationTarget(...)`; accepted mutation still enters `WorldTurnSystem`.
- Release, focus loss, pause, reset, generation, menu entry, and lifecycle locks clear or synchronize intent.
- Diagnostics remain bounded to active/queued directions, requested candidates, assisted-turn count/limit, and the last decision; no future route is exposed.

## Verification

- Pure resolver fixtures: `10/10` passed, covering immediate and delayed turns, latest-wins replacement, unambiguous corners, genuine intersections, dead ends, explicit reverse, paired wrap, the four-turn bound, and release cleanup.
- Focused control/scene packet: `5 files / 96 tests` passed.
- Focused architecture packet: `3 files / 16 tests` passed.
- Proof-harness regression packet: `2 files / 19 tests` passed.
- Full `npm run verify`: `47 files / 354 tests` passed, followed by the Vite `7.3.1` / PWA build with `221` transformed modules.
- `git diff --check`: passed.

## Route-aware browser proof

All accepted runs used clean commit `542bc3f5d43baeb56d0eb742972d960e7cfd16df`.

- Phone keyboard, `405x958`: `74/74` planned/executed/admitted turns, goal reached, goal-hold/deconstruct/handoff/build/ready lifecycle passed, fresh world-turn lock passed, `60 FPS`, no recent spikes.
  - Summary: `C:\ATLAS\tmp\captures\mazer-live-play-input-equivalence\2026-07-14T22-56-29-028Z\methods\keyboard\fluid-zigzag-intent-final-phone-20260714-keyboard.summary.json`
  - Screenshot: `C:\ATLAS\tmp\captures\mazer-live-play-input-equivalence\2026-07-14T22-56-29-028Z\methods\keyboard\fluid-zigzag-intent-final-phone-20260714-keyboard.png`
- Phone stick, `405x958`: `58/58` planned/executed/admitted turns, goal reached, the same lifecycle/fresh-world gates passed, `60 FPS`, no recent spikes.
  - Summary: `C:\ATLAS\tmp\captures\mazer-live-play-input-equivalence\2026-07-14T22-56-29-028Z\methods\stick\fluid-zigzag-intent-final-phone-20260714-stick.summary.json`
  - Screenshot: `C:\ATLAS\tmp\captures\mazer-live-play-input-equivalence\2026-07-14T22-56-29-028Z\methods\stick\fluid-zigzag-intent-final-phone-20260714-stick.png`
- Desktop keyboard, `1280x720`, `isMobile=false`, `hasTouch=false`: `70/70` planned/executed/admitted turns, goal reached, the same lifecycle/fresh-world gates passed, `60 FPS`, no recent spikes.
  - Summary: `C:\ATLAS\tmp\captures\mazer-live-play-qa\2026-07-14T22-58-00-301Z\fluid-zigzag-intent-final-desktop-20260714.summary.json`
  - Screenshot: `C:\ATLAS\tmp\captures\mazer-live-play-qa\2026-07-14T22-58-00-301Z\fluid-zigzag-intent-final-desktop-20260714.png`
- Visual review: both portrait captures and the true desktop capture show an unobscured active-play surface, readable board/endpoints/player, contained HUD/control lanes, and no rotation overlay or layout corruption.

An earlier stick run reached its goal but exposed a race in proof collection: the one-per-phase building probe could occur before the fresh maze replaced the world-turn system. Commit `177d7e86` makes the fresh build probe seed-correlated. An earlier landscape run also exposed that the harness still forced a mobile browser context; commit `542bc3f5` adds and records an explicit desktop context. Neither superseded run is counted as acceptance evidence.

## Board and shared-writer reconciliation

- Local exact-card admission intent: `C:\ATLAS\tmp\mazer-fluid-zigzag-intent-ready-intent-20260714.json`
- Event ID: `mazer-fluid-controls-and-motion-zigzag-intent-ready-20260714`
- Source thread/starter: `1524889582590496798`
- Live mutation: deferred; this packet changed no Discord thread, starter, journal, or lifecycle state.
- No config-wide/full-board Mazer live sync occurred after receipt `dbr_ac4e8d82f30fc73a6a230a9837505fd4`.
- Exact live threads changed after that receipt by this lane: none.
- Incident readback retained: `65` active Mazer cards, `8` healthy, `57` drifted; all `57` carry `stable_card_id_missing`, `canonical_card_body_missing`, and `canonical_updated_timestamp_missing`; global duplicates `0`.
- DiscordOS PR `#69` merged writer downgrade protection at `87c84f66e9b7a835fed2a3d5acb5a53620a4d889`, but Atlas remains the sole operational repair writer. No live Mazer board writes resume until explicit recovery clearance.
- Preserved DiscordOS closeout branch `codex/mazer-edge-wrap-completion-closeout` at `1964f84` remains unmerged and unre-based.

## Post-work review

- Scope review: focused product, tests, architecture, proof harness, and receipt only; no secrets, Supabase data, unrelated repo work, or production mutation.
- Correctness review: no unresolved code finding after pure, focused, full, and route-aware checks.
- Lifecycle review: this slice is terminal; the parent Fluid Controls card remains open for separately admitted pace/feel work.
- GitHub disposition: draft PR `#64` is ready for final review/merge after this receipt commit lands.
- Board disposition: queue exact single-card implementation/review intents locally after GitHub finalizes; do not run live board mutation until Atlas clearance.

## Decisions and questions

None. The earlier settings-completion decision blocker is obsolete; that work is already completed and merged. No operator input is required for this packet.
