# Mazer Fluid Progression Pace Packet

Date: `2026-07-14`

## Outcome

The remaining pace/level formula item on `mazer-fluid-controls-and-motion` is complete and review-ready in draft PR [#65](https://github.com/fawxzzy/mazer/pull/65). Together with the already-merged directional-intent packet in PR `#64`, this closes the parent card's requested movement-feel contract locally and on GitHub. Live board completion remains deferred until Atlas returns recovery clearance.

No production deployment occurred.

## Git truth

- Base: `5718fc0bb84ff77468eae5d89012ef0e91d27d72` (`origin/main` when admitted)
- Branch: `codex/fluid-progression-pace-profile`
- Product commit: `8637e448e5343a65b3ef9a427c8dc765d64d9cbd`
- Proof-contract commit: `99d9e33644583225c6edd6bf8d9c7d67f60a2419`
- Draft PR: `#65`, base `main`, head `codex/fluid-progression-pace-profile`
- Protected canonical modification `tests/ai/demo-walker.test.ts` in `C:\ATLAS\repos\mazer` was not edited, staged, reset, or moved.

## Implemented contract

- `legacy-movement-pace-v1` is the single effective speed profile for keyboard repeat gating plus touch, arrow, and stick initial/repeat/turn timing.
- The persisted Move Speed slider remains the player's base preference. The formula does not write preferences, progression, account data, or telemetry.
- New players retain the prior timing exactly because progression context applies only after at least one completed cycle.
- Established players receive a deterministic, bounded adjustment from normalized level and pace-score inputs.
- The preference envelope shrinks the adjustment near the slider endpoints and preserves explicit `0%` and `100%` selections as hard overrides.
- Runtime and live-QA diagnostics publish only the formula version, base/effective speed, context-applied flag, completed-cycle count, level, pace score, and derived timing values.

## Verification

- Focused product packet: `5 files / 80 tests` passed plus TypeScript.
- Fast verification: `10 files / 150 tests` passed plus TypeScript.
- Proof-contract regression packet: `2 files / 19 tests` passed plus TypeScript.
- Clean-head full `npm run verify`: `47 files / 355 tests` passed, followed by the Vite `7.3.1` / PWA build with `221` transformed modules.
- `git diff --check`: passed.

## Route-aware browser proof

All accepted final runs used clean commit `99d9e33644583225c6edd6bf8d9c7d67f60a2419`.

- Phone keyboard, `405x958`: goal reached; `92/92` planned/executed/admitted turns; goal-hold/deconstruct/handoff/build/ready lifecycle, input-lock probes, and fresh-world turn-zero gate passed; `60 FPS`; no recent spikes. Post-cycle diagnostics reported base `0.3`, effective `0.3454`, formula `legacy-movement-pace-v1`, completed cycles `1`, level `5`, and pace `100`.
  - Summary: `C:\ATLAS\tmp\captures\mazer-live-play-input-equivalence\2026-07-14T23-27-20-378Z\methods\keyboard\fluid-progression-pace-clean-head-20260714-keyboard.summary.json`
  - Screenshot: `C:\ATLAS\tmp\captures\mazer-live-play-input-equivalence\2026-07-14T23-27-20-378Z\methods\keyboard\fluid-progression-pace-clean-head-20260714-keyboard.png`
- Phone stick, `405x958`: goal reached; `102` planned/admitted world turns; lifecycle, input-lock, and fresh-world gates passed; `58.7 FPS`; no recent spikes. Post-cycle diagnostics reported base `0.42`, effective `0.4571`, formula `legacy-movement-pace-v1`, completed cycles `1`, level `4`, and pace `85`.
  - Summary: `C:\ATLAS\tmp\captures\mazer-live-play-input-equivalence\2026-07-14T23-27-20-378Z\methods\stick\fluid-progression-pace-clean-head-20260714-stick.summary.json`
  - Screenshot: `C:\ATLAS\tmp\captures\mazer-live-play-input-equivalence\2026-07-14T23-27-20-378Z\methods\stick\fluid-progression-pace-clean-head-20260714-stick.png`
- Desktop keyboard, `1280x720`, `isMobile=false`, `hasTouch=false`: goal reached; `114/114` planned/executed/admitted turns; lifecycle, input-lock, and fresh-world gates passed; `59.54 FPS`; no recent spikes. Post-cycle diagnostics reported base `0.3`, effective `0.3328`, formula `legacy-movement-pace-v1`, completed cycles `1`, level `4`, and pace `86`.
  - Summary: `C:\ATLAS\tmp\captures\mazer-live-play-qa\2026-07-14T23-28-56-339Z\fluid-progression-pace-desktop-clean-head-20260714.summary.json`
  - Screenshot: `C:\ATLAS\tmp\captures\mazer-live-play-qa\2026-07-14T23-28-56-339Z\fluid-progression-pace-desktop-clean-head-20260714.png`
- Visual review: both portrait captures and the true desktop capture show an unobscured board, readable endpoints/player, contained HUD/control lanes, and no layout corruption.

The first dirty-head phone matrix exposed a proof-only race: a valid fresh maze could finish at pristine turn zero without the rejected `simulation-paused` receipt that the harness happened to require. Commit `99d9e336` accepts either a pristine zero-turn state or the expected locked-probe rejection while still rejecting every admitted or inherited turn. Focused tests, full verification, and the clean-head browser matrix all passed after the correction. The superseded run is not acceptance evidence.

## Board and shared-writer reconciliation

- Local exact-card admission intent: `C:\ATLAS\tmp\mazer-fluid-controls-progression-pace-intent-20260714.json`
- Event ID: `mazer-fluid-controls-progression-pace-intent-20260714`
- Source thread/starter: `1524889582590496798`
- Intended terminal lifecycle after merge: `open -> completed` for `mazer-fluid-controls-and-motion`.
- Live mutation: deferred; this packet changed no Discord thread, starter, journal, or lifecycle state.
- No config-wide/full-board Mazer live sync occurred after receipt `dbr_ac4e8d82f30fc73a6a230a9837505fd4`.
- Exact live threads changed after that receipt by this lane: none.
- Incident readback retained: `65` active Mazer cards, `8` healthy, `57` drifted; all `57` carry `stable_card_id_missing`, `canonical_card_body_missing`, and `canonical_updated_timestamp_missing`; global duplicates `0`.
- DiscordOS PR `#69` merged downgrade protection at `87c84f66e9b7a835fed2a3d5acb5a53620a4d889`; PR `#70` merged long-body section preservation at `ca110d698be57a626b3cc57a79b99b2593b9a173`. Atlas remains the sole recovery writer, so this lane performed no live board write.
- Preserved DiscordOS closeout branch `codex/mazer-edge-wrap-completion-closeout` at `1964f84` remains unmerged and unre-based.

## Post-work review

- Scope review: focused product, tests, architecture, proof harness, marker, and receipt only; no secrets, Supabase data, unrelated repo work, user-data mutation, or production mutation.
- Correctness review: one effective profile owns all input timing; endpoint behavior, no-context parity, bounded progression, and diagnostic exposure have dedicated tests.
- Visual review: accepted portrait and true desktop captures are clean.
- Lifecycle review: this final slice plus merged PR `#64` satisfies the parent Fluid Controls card's acceptance and explicit work breakdown. The local completion intent will remain deferred until board recovery clearance.
- GitHub disposition: draft PR `#65` is ready for review/merge after this receipt commit lands and GitHub truth is re-read.

## Decisions and questions

None. The persisted slider remains the user-owned base setting, progression only supplies a bounded post-cycle adjustment, and the earlier settings-completion blocker is obsolete. No operator input is required for this packet.
