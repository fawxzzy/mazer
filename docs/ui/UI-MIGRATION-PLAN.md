# Mazer UI Migration Plan (draft, Phase 0 output)

Companion to `UI-AUDIT.md` and `UI-DESIGN-CONTRACT.md`. This is the proposed
PR sequence for the actual redesign work, adjusted for two real constraints
discovered during the audit that the original brief didn't know about:

1. **`src/ui/dom/*` already exists** (tested, unused) — see `UI-AUDIT.md` §0.
   This must be resolved before Phase 1 starts, or Phase 1 risks building a
   third system.
2. **No reliable in-browser screenshot capture in this working environment.**
   The original brief's verification steps assume deterministic screenshots
   at every phase gate. That assumption doesn't hold here today. The plan
   below routes visual verification through the user + an external tool
   (screenshots/recordings supplied back into the conversation) instead of
   an automated harness, until/unless that capability is fixed.

Per the user's own direction: work through this **one PR at a time**, not
in parallel waves, and don't start PR N+1 until PR N is reviewed.

## Gate 0 (this document set) — DONE, no code changed

`UI-AUDIT.md`, `UI-SCREEN-MAP.md`, `UI-DESIGN-CONTRACT.md`, this file. Needs
your review, specifically on the `src/ui/dom/*` question, before Gate 1
starts.

## Gate 1 — resolve the DOM-vs-Phaser question

Not a code PR. A decision, informed by actually reading `src/ui/dom/*`'s
current state against `cyberArcadeMaterial`'s current tokens (do the colors/
radii/motion values still match, or has one drifted from the other since
whichever of them was built more recently?). Output: one paragraph, in this
file, recording the decision and why.

## Gate 2 — first real PR, scoped to prove the pattern on ONE screen

Deliberately the smallest real migration, not the token/primitive
mega-PR the original brief proposed as "Phase 1." Candidate: **the
Leaderboard title icon fix from `UI-AUDIT.md` §3** — replace
`drawLegacyLeaderboardTitleGlyph`'s procedural bars with
`applyLegacyHudIconFrame` + `MAZER_HUD_LEADERBOARD_ICON_METRICS`, the same
call every other leaderboard-icon placement already uses. Small, concrete,
already-diagnosed, and it exercises the exact "shared primitive, multiple
call sites, no duplication" pattern the whole redesign is trying to
generalize — a good test of whether that pattern actually holds up before
committing to it everywhere.

## Gate 3 onward — pick the next single item, one at a time

Not pre-sequenced into rigid phases/waves the way the original brief did,
per your own "work thru it systematically" direction. After each item
ships, come back with what's next rather than committing to a fixed
8-PR order now. Reasonable next candidates, roughly in order of how
concretely they're already diagnosed:

1. **Pause vs. Settings** (`UI-AUDIT.md` §2): give Pause its own
   `resume/restart/guide/settings/main-menu` hierarchy instead of inlining
   Settings' own content directly. This is the biggest structural fix
   named in the original brief and the audit found the exact code proving
   it's needed.
2. **A real `'guide'` overlay kind**, extracted out of Settings/Pause into
   its own screen, using the shared overlay shell (`drawOverlayPanel`,
   `createOverlayTitle`, `createOverlayBackChevronButton`) every other
   overlay already uses.
3. **Icon-size token**: formalize the `desiredSize` contract from
   `UI-DESIGN-CONTRACT.md` so the next icon placement doesn't need another
   eyeball-and-bump pass.
4. Main Menu / Active Play / Profile / Leaderboard content-level redesign
   (the actual visual layout changes in the original brief's Phase 2-5) —
   deferred until 1-3 land and prove the primitive pattern, and until
   there's a working way to get visual proof back (screenshots/recordings
   from you, per the workflow you described).

## What every PR in this plan should still do, regardless of which item it is

- Run the full existing test suite + `tsc --noEmit`.
- Follow this branch's existing shipping pipeline (PR -> CI -> merge ->
  clean-checkout deploy -> live verification) already established this
  session.
- Not bundle unrelated gameplay/VFX changes in with UI-structure changes
  (per the original brief's own rule, which is a good one).
- Get visual proof back from you (screenshot/recording) before being
  marked done, since automated capture isn't reliable here yet — this
  replaces the original brief's "deterministic screenshot harness" gate
  for now, not permanently.
