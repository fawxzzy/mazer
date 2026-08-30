# Mazer UI Audit (Phase 0)

Date: 2026-08-29
Scope: `src/scenes/MenuScene.ts` and everything it owns (menu, active play, pause,
settings, guide, leaderboard, auth/profile), plus the design-token and DOM
component layers that already exist elsewhere in the repo.

This is a documentation-only pass. No rendering code changed as part of this
audit.

## 0. Correction (post-review): this redesign is already underway, under its own governance

**The first version of this audit got this wrong.** It searched `src/` for
consumers of `src/ui/dom/*` and, finding none, framed "adopt vs. shelve
`src/ui/dom/*`" as an open decision for this PR to make. It is not open. A
real, dependency-ordered "UI rework" wave system already exists, already
merged to `main`, governed by `docs/architecture/MAZER-UI-REWORK-*.md` and
`docs/contracts/mazer-ui-rework-*.v1.json`, enforced by
`tests/architecture/decision-registry-contract.test.ts`. This audit simply
never searched `docs/architecture/` or `docs/contracts/` broadly enough to
find it — a real gap in the first pass, not a disagreement to negotiate.

The registry's own locked `renderer-ownership-split` decision already
states: Phaser owns world/maze presentation; DOM owns application shell,
HUD, touch controls, settings, dialogs, and system chrome; tokens, state,
commands, geometry, and diagnostics are shared contracts owned by neither
renderer alone. `src/ui/dom/*` (Wave 2A/2A.1) was **deliberately** built and
left unmounted — its own doc says so explicitly: "These primitives are
DOM-only... They remain unreferenced by shipping runtime entrypoints until
a later dependency-ordered integrator wave owns composition and cleanup."
Not abandoned. Not a question for this audit to reopen.

Wave status, read directly from `docs/architecture/MAZER-UI-REWORK-*.md`
(2026-08-29):

| Wave | Scope | Status |
|---|---|---|
| 0A | Decision registry, architecture guardrails | done |
| 1A | Shared state/commands/view-models foundation | done |
| 1B | Design tokens (`src/theme/tokens.ts`/`.css`) | done |
| 1C | Diagnostics schema split (`docs/architecture/MAZER-UI-REWORK-DIAGNOSTICS-V1.md`) | done |
| 2A / 2A.1 | DOM primitives (`src/ui/dom/*`) | done, deliberately unmounted |
| 2B | Topology/path geometry contract (`src/geometry/topologyPath.ts`) | done |
| 2C | Asset/icon generator | no spec file existed; status unclear |
| **3A** | **Command bridge / live-scene mapping — gates 3C, 4D, and 3B** | **not started — next** |
| 3B | Auth migration (`src/legacy-runtime/legacyAuth.ts`, `legacyPlayerMessage.ts`), owner `auth-migration-integrator` | not started, gated behind 3A |
| 4D | Actual Phaser board/title renderer switch (topology contract + tokens) | not started, gated behind 3A — **must ship before 3C starts, per AGENTS.md's board-first rule** |
| 3C | DOM primitive mounting, view-model projection, one-overlay enforcement | not started, gated behind 3A **and** 4D |

**Ordering correction (2026-08-30):** an earlier version of this note
claimed no dependency was registered between 3A and 3B, and said not to
assume 3B is blocked on 3A. That's wrong — `scripts/check-decision-registry.mjs`
defines `INTEGRATOR_WAVE_ORDER = ['0C', '1B', '1C', '3A', '3B', '5B']` and
enforces it as a locked dependency order: `checkIntegratorWaveOwnership`
rejects any `integratorWaveOwnership.assignments` entry whose wave sorts
earlier in that array than a wave already seen, with the violation
message itself stating assignments "must follow the locked 0C -> 1B ->
1C -> 3A -> 3B -> 5B dependency order." 3B does have its own exclusive
owner (`auth-migration-integrator`) over a disjoint path set
(`legacyAuth.ts`, `legacyPlayerMessage.ts`, not `MenuScene.ts`) — that
part was right — but disjoint ownership doesn't mean unordered: 3B
follows 3A in the registered sequence and doesn't start before it.
Separately, the board-first sequence (3A → 4D → 3C) is its own
independent contract — no ordering between 3B and 4D is invented here,
and auth-path work is never routed through whoever picks up 3A.

**Correction (second pass):** an earlier version of this paragraph claimed
`MenuScene.ts` "isn't yet assigned to a specific wave's exclusive-writer
lock." That's factually wrong — `docs/contracts/mazer-ui-rework-decision-registry.v1.json`'s
`integratorWaveOwnership.assignments` explicitly assigns
`src/scenes/MenuScene.ts` to Wave 3A, owner `command-bridge-integrator`.

`tests/architecture/decision-registry-contract.test.ts` currently passes
against this session's own changes (verified: `npx vitest run
tests/architecture/decision-registry-contract.test.ts`, 29/29), but the
real reason is narrower than "not violated": the specific check the
"real working tree" test runs, `collectIntegratorWaveMixViolations`,
flags a changeset only when it touches paths assigned to *two or more
different* registered waves at once. It doesn't (in that invocation)
enforce "only the Wave 3A integrator may ever touch this file" against a
branch that isn't itself claiming to operate under a different wave — that
stricter check exists too (`collectIntegratorWaveOwnershipViolations`,
which takes an explicit current-wave argument) but isn't what's being run
here. So this session's `MenuScene.ts` edits passing this test is real
signal that they haven't mixed wave-owned paths, not a registry statement
that ad-hoc edits to an assigned file are pre-approved indefinitely. The
assignment to Wave 3A is real and should be treated as the actual owner
going forward, not as inactive metadata.

**What this means for scope:** the actual redesign implementation — wiring
Wave 3A's command bridge, then Wave 4D's board/title renderer switch, then
mounting `src/ui/dom/*` under Wave 3C (in that mandatory order, per
`UI-MIGRATION-PLAN.md`'s ordering section — Wave 3C does not start before
Wave 4D ships) — already has an owner and a plan. This audit's job is to
*not duplicate that plan*, and to flag where this session's own work
should stay clear of it.
Sections 1-6 below are corrected against that reality; §7 (the original
draft's proposed migration plan) has been removed in favor of pointing at
the real wave docs — see `UI-MIGRATION-PLAN.md`.

## 1. Screen inventory

One file, `src/scenes/MenuScene.ts` (16,466 lines), owns every player-facing
surface. There is no per-screen file/component split at all today.

| Surface | Entry point | Overlay kind |
|---|---|---|
| Boot/loading | `BootScene.ts` (separate scene) | n/a |
| Auth-resolution boot blocker | automatic on boot while `authGateAwaitingResolution` is true; `overlay` stays `'none'` throughout | n/a — not a `LegacyOverlayKind`, see correction below |
| Main Menu | `mode === 'menu'`, `overlay === 'none'` | `'none'` |
| Active Play | `mode === 'play'`, `overlay === 'none'` | `'none'` |
| Settings (menu context) | `openOverlay('options')` from menu/QA entry points only | `'options'` |
| Pause | `openOverlay('pause')` from play | `'pause'` |
| Login/Account (auth) | `openOverlay('auth')`, or `update()` force-setting `overlay = 'auth'` once resolution finishes locked (signed-out, no guest access) | `'auth'` |
| Leaderboard | `openOverlay('leaderboard')` | `'leaderboard'` |
| Progression reset confirm | `openOverlay('confirm-progression-reset')` | `'confirm-progression-reset'` |
| Guide | **not a screen** — a section rendered inline inside Settings/Pause via `createLegacyOptionsInfoSection` | n/a |

**Correction (third pass — got this wrong in both directions across two
earlier corrections):** there are genuinely **three** distinct auth-related
states, not one and not two:

1. **Awaiting resolution** (`authGateAwaitingResolution = true`, the
   default on boot, `MenuScene.ts:1475`): `overlay` stays `'none'` the
   entire time — `update()`'s `pendingAuthGateTransition` branch
   (`MenuScene.ts:2292-2308`) that would ever set `overlay = 'auth'` is
   itself only reachable once `applyLegacyAuthSnapshot()` clears this
   flag. Independently of `overlay`, `syncLegacyAuthGateLoadingScreen()`
   (`MenuScene.ts:15734`) draws a full-screen, max-depth interactive
   blocker every frame while this flag is true — its own comment states
   its purpose is blocking "every click from reaching whatever the menu
   front door is doing underneath." This is a real, distinct boot-phase
   surface with no `LegacyOverlayKind` at all — a second correction's
   attempt to merge it entirely into the `'auth'` overlay (previous
   version of this section) was itself wrong.
2. **Resolved, locked** (`authGateLocked = true` — signed out, no guest
   access, set in `applyLegacyAuthSnapshot()`): `update()` now does set
   `overlay = 'auth'`, dispatched to `buildAuthOverlay()` exactly like
   `openOverlay('auth')` from the menu. This genuinely is the same
   `'auth'` overlay kind as the manually-triggered one — the very first
   version of this table was wrong to give this its own separate "n/a"
   row alongside Login/Account.
3. **Resolved, not locked** (signed in, or guest access granted):
   `overlay` stays/returns to `'none'`; the gate is fully invisible.

Net effect for Wave 3C's one-overlay-at-a-time invariant: the boot
blocker (state 1) needs its own accounted-for input-blocking behavior
*before* any overlay exists to enforce "one at a time" over — removing it
while only preserving the `'auth'` overlay's enforcement would drop real
input protection during that window, not just simplify bookkeeping.

`LegacyOverlayKind` (`src/legacy-runtime/legacyOverlayRouting.ts:2`) is the
complete list, read directly from the live type: `'none' | 'options' |
'pause' | 'auth' | 'confirm-progression-reset' | 'leaderboard'`. There is
no dedicated `'guide'` kind — confirmed below, this is a real structural
issue, not just a visual one. Play-context Settings is reached only
through Pause duplicating Settings' own content directly, not by
navigating into the `'options'` overlay kind — see §2, and
`UI-SCREEN-MAP.md`'s Settings/Pause rows.

**Reconciled (2026-08-30), per explicit owner decision:** an earlier
version of this section flagged, but declined to resolve, a conflict with
`docs/current-truth.md` ("Current overlay family" listed options/
features/game modes/pause with no auth/leaderboard/confirm-progression-
reset). The owner has since directed that the live runtime overlay model
is authoritative for current-truth purposes, and `docs/current-truth.md`
has been corrected accordingly: its overlay-family bullet now lists the
real top-level `LegacyOverlayKind` set (options, pause, auth, confirm-
progression-reset, leaderboard), and the old `features`/`game modes`
entries are marked stale — a repo-wide search of `MenuScene.ts` found no
live top-level overlay or nested panel under those names; feature/game-
mode-style settings exist today only as ordinary rows inside the single
`options`/`pause` overlay content (`createFeatureControlRows`). This is
no longer an open conflict between docs.

## 2. Confirmed: Pause is literally Settings' own content, reused

`buildPauseOverlay()` (`MenuScene.ts:11031`) and `buildOptionsOverlay()`
(`MenuScene.ts:10527`) both call:
- `this.createLegacyOptionsInfoSection(...)` — the Guide section
- `this.createFeatureControlRows(...)` — the settings toggle/slider rows

Pause's own addition on top of that shared content is just a different
header (Home + back-chevron instead of the menu's own header icons).
**Correction:** an earlier version of this line also cited
`includeMovementSpeed: false` as a Pause-specific difference from
Settings. It isn't — every call site in both `buildOptionsOverlay()`
(`MenuScene.ts:10554,10577,10593`) and `buildPauseOverlay()`
(`MenuScene.ts:11063,11085`) passes `includeMovementSpeed: false`; no call
site anywhere in the file ever passes `true`. Neither current surface
renders a Move Speed slider today — it's dead, flag-gated functionality
on both, not an asymmetry between them. **Reconciled (2026-08-30), per
explicit owner decision:** this previously conflicted with
`docs/current-truth.md:268`'s claim that both surfaces "separate the
Move Speed label and slider lanes." `docs/current-truth.md` has been
corrected to state plainly that neither surface currently renders the
slider, with re-introduction left as a separate future product/UI
decision rather than described as current behavior. No longer an open
conflict. Everything else — guide
cards, every other settings row, the scroll behavior — is the *exact
same function call* Settings makes. This is direct, code-level
confirmation of "Pause behaves too much like another settings screen,"
not just a visual
impression from a screenshot.

## 3. Confirmed: icon duplication survives past this session's own icon work

This session wired real HUD icon assets (`hud-profile.png`,
`hud-leaderboard.png`, `hud-settings.png`) into the main menu header, the
profile buttons, and the in-play pause control. But
`drawLegacyLeaderboardTitleGlyph` (`MenuScene.ts:11123`) — the decorative
icon drawn next to the title *on the Leaderboard screen itself* — is still a
completely separate, hand-drawn "three ascending bars" procedural glyph,
not the real leaderboard asset. Its own comment says the intent was for it
to "read as 'the thing that icon opens,'" but it draws its own bars from
scratch instead of reusing `applyLegacyHudIconFrame` +
`MAZER_HUD_LEADERBOARD_ICON_METRICS` the header button now uses. Same
glyph, two independent implementations, one real and one procedural,
visible one screen apart.

The Guide section's own illustrative icons (`drawLegacyOptionsGuideGlyph`,
`drawLegacyOptionsGuideMoveGlyph`, `drawLegacyOptionsGuideTrailGlyph`,
`MenuScene.ts:10946-11030`) are a third visual language again: thin-line
procedural icons for concepts (move, trail) that have no real asset at all
today. Not necessarily wrong (some guide concepts may never need a full art
asset), but worth an explicit decision per the redesign brief's own Guide
section ("Player, Trail, End Tile, Edge Diamonds, Diamond Energy, Teleport
Beam, Bleed-Off Paths... use the same canonical gameplay assets").

## 4. Function inventory (representative, not exhaustive)

64 `drawLegacy*`/`createLegacy*Button`/`createLegacy*Overlay`-style private
methods exist in `MenuScene.ts`. Grouped by the surface they actually
serve:

**Backdrop / board (shared by menu + play, always running):**
`drawBackdrop`, `drawLegacyBackdropShard`, `drawLegacyBackdropRune`,
`drawLegacyBackdropSigils`, `drawStaticBoard`, `drawLegacyPathMaterialTile`,
`drawLegacyPathTileFacet`, `drawLegacyPathBorderDock(Facet)`,
`drawLegacyBleedPathImage`, `drawLegacyBleedOffGlow`, `drawBoardPaths`.

**Title / orbit diamonds (menu + play, decorative):**
`drawLegacyMenuPathTitleCell/PrismSweep/GemFacets/Diamond/OrbitSigils(Twinkle)/Title`,
`drawLegacyPlayerTransferEnergy`, `drawLegacyPlayerSpawnBurst`.

**HUD chrome (menu header + play touch controls):**
`drawLegacyMenuSettingsCog`, `drawLegacyMenuLeaderboardIcon`,
`drawLegacySettingsCogControl`, `drawLegacyPlayTouchControls`,
`drawLegacyPlayTouchStick`, `createLegacyMenuSettingsCogButton`,
`createLegacyMenuLeaderboardButton`, `createLegacyMenuProfileButton`.

**Trail / markers / level announcer:**
`drawLegacyTrailBorder`, `drawLegacyPlayerTrailTileOverlay`,
`drawLegacyPlayDynamicTrailPulse`, `drawLegacyDynamicTrailBorderDock`,
`drawLegacyEndpointGlow`, `drawLegacyGoalStarMarker`,
`drawLegacyProgressionBadge`, `drawLegacyLevelAnnouncer(NumberGlyph)`,
`drawLegacyGlyphWordTileBlock` (the shared tile-font renderer, genuinely
reused well — see §6).

**Overlay shell (correction: only `drawOverlayPanel` is actually shared by
all 5 — see `UI-SCREEN-MAP.md`'s "Shared shell" correction for the
per-function call-site breakdown):**
`drawLegacyCyberPanel` (used by Options' Guide subsection plus 3 unrelated
non-overlay call sites), `drawOverlayPanel` (genuinely universal, 1 call
site), `drawLegacyOverlayScrollFacade` (Options + Pause only),
`createOverlayTitle` (Leaderboard, confirm, Auth — not Options/Pause),
`createOverlayBackChevronButton` (Options, Pause, Leaderboard, Auth — not
confirm), `createButton`.

**Per-overlay content (NOT shared, one implementation per screen even
where the content overlaps — see §2):**
`buildOptionsOverlay`, `buildPauseOverlay`, `buildAuthOverlay`,
`buildLeaderboardOverlay`, `buildProgressionResetConfirmationOverlay`,
`createLegacyOptionsGuideHeaderButton`, `drawLegacyOptionsGuideGlyph(s)`,
`drawLegacyLeaderboardTitleGlyph`, `createLegacyAuthActionButton`,
`createLegacyAuthPasswordVisibilityButton`, `createLegacyOverlayUsernameButton`,
`createLegacyOverlayHomeButton`, `drawLegacyProfileIcon`.

## 5. What is already good and should be kept

- `cyberArcadeMaterial` + `designTokens` (§0): a real semantic color/typography/
  spacing/radius/motion token layer exists and much of the file already
  reads colors from it (`cyberArcadeMaterial.signal.player`, `.rail.mint`,
  etc.) rather than hardcoding hex values inline.
- `applyLegacyHudIconFrame` (this session): a genuinely shared, tested
  primitive for the 3 canonical HUD icons, consumed by 4 independent call
  sites. This is the pattern the rest of the redesign should generalize,
  not replace.
- `drawLegacyGlyphWordTileBlock`: one shared tile-font renderer used by the
  title, both front-door buttons, and the level number. Already exactly
  the "one shared primitive, many call sites" shape the redesign wants.
- `resolveLegacyHeaderControlFrame`, `resolveOverlayPanelFrame`,
  `resolveLegacyOverlayShellLayout`: real shared layout-resolver functions
  (not components, but not one-off math either) already factor out header/
  panel geometry.

## 6. Issue log

Severity per the redesign brief's own scale.

**P0 — structural, already tracked by the wave system (§0), not new findings for this PR to resolve**
- No dedicated `'guide'` overlay kind; Guide is a section glued into
  Settings/Pause, not a real screen (§2) — in scope for Wave 3C's mounting
  work per the DOM-primitives doc's own settings-boundary section.
- Pause has no content of its own distinct from Settings (§2) — same,
  Wave 3C's "one-overlay enforcement" and route-aware wiring is the
  natural place this gets resolved, once `src/ui/dom/*` is actually mounted.

**P1 — major hierarchy/duplication**
- **Confirmed runtime defect, not just a doc gap:** the progression-reset
  confirmation overlay has two entry points — the authenticated Account
  section of the Auth overlay (`buildAuthenticatedAccountSection`,
  `MenuScene.ts:11491`) and Pause (`MenuScene.ts:14951`) — but
  `legacyOverlayRouting.ts:31-35` always routes its Cancel/back action to
  `'pause'` unconditionally, regardless of which context opened it.
  Cancelling from Account currently opens the play-oriented Pause surface
  while still in menu mode. See `UI-SCREEN-MAP.md`'s progression-reset row
  for the exact call sites. Relevant to `UI-MIGRATION-PLAN.md`'s
  recommended ConfirmDialog first-proof (Option B): that proof's own
  focus-restoration requirement would need to fix this, not just port the
  Pause-only behavior into DOM form.
- Leaderboard screen's own title icon is a second, procedural
  reimplementation of an icon that already has a real asset one screen
  away (§3).
- Per-call-site magic-number sizing: this session alone tuned icon
  `desiredSize` ratios per call site (0.68/1.15, 0.48/0.9, 0.42/0.78) with
  no shared "icon size" token — every future icon placement will need the
  same manual eyeball pass again.
- One 16,466-line file owns every screen; there is no per-surface
  ownership boundary at all, which is why unrelated screens (Pause,
  Settings) can't help sharing bugs and can't be worked on independently
  without re-reading the whole file's context.

**P2 — polish/consistency**
- Guide's illustrative icons (move/trail glyphs) are a third procedural
  visual language, distinct from both the real HUD icon assets and the
  real gameplay VFX assets (diamond/beam/trail) the guide is describing.
- Tile-font usage is already fairly disciplined (title, level number,
  Start/Login) — worth confirming as a rule going forward rather than a
  problem to fix.

**P3 — optional**
- `summarizeCyberArcadeMaterial()` exists for diagnostics but isn't
  surfaced anywhere in the UI itself; could back a future "about/version"
  debug panel.

## 7. Correction: a real visual-proof harness exists and works — but needs a canonical pinned seed for topology determinism, and isn't pixel-deterministic even then

`npm run visual:ui-surfaces` (`scripts/analysis/capture-ui-surfaces.mjs`) is
a real, working Playwright-based capture-and-assert harness — 39 checks
covering per-screen color contracts, text-label presence/bounds, scroll
affordance/reachability, console/page-error cleanliness, reduced-motion
behavior, and mobile layout invariants, plus real PNG screenshots of menu/
auth/options/play/pause. Verified by actually running it in this session:
a first attempt (immediately after a fresh `npm run build`) hit `page.goto:
Page crashed`; a second attempt with `--skip-build` against the already-
built `dist/` succeeded cleanly (build-then-immediately-preview may need a
brief settle or a retry — worth a small hardening pass, not evidence the
harness itself is broken). The successful run surfaced two real,
pre-existing failing checks unrelated to this audit
(`options-bottom-account-action`, `mobile-overlay-scroll-reachability` —
both about a missing "Account" label at the bottom of the Options/Pause
scroll area) — genuine signal this harness produces, not noise.

**Correction, real gap (2026-08-30):** the harness's default invocation is
**not** deterministic, despite earlier framing in this section and in
`UI-MIGRATION-PLAN.md`. `resolveRoute()` in `capture-ui-surfaces.mjs` only
sets the `mazeSeed` URL param when an explicit `--maze-seed` CLI arg is
passed (`resolveCaptureTarget`, line ~621). Without it,
`resolveInitialLegacyRuntimeSeed()` (`src/legacy-runtime/legacyRuntimeSeed.ts`)
falls through to `createLegacyRuntimeRandomSeed()`, which mixes
`Date.now()` and `Math.random()` — a genuinely different maze every run.
Every command in this PR set (including this document's own) that invokes
`npm run visual:ui-surfaces` without `--maze-seed` produces
non-reproducible, non-diffable results for any topology-sensitive check,
contradicting the "deterministic"/"diffable" framing used throughout.
**The required gate must pin a fixed, canonical `--maze-seed`, not an
arbitrary per-caller value** — this repo already has one:
`--maze-seed 3749`, the existing maintained proof seed used this exact
way elsewhere (`docs/research/MAZER_UI_VISUAL_SYSTEM_NEXT_CHUNK_PLAN.md:22`
and dozens of other scripts/docs/tests). Every invocation of this gate
should use exactly that value.

**Second correction, narrower than the first:** pinning `--maze-seed`
only makes the maze *topology* and the 39 structural assertions
reproducible — it does not make the raw PNG screenshots pixel-diffable.
`createLegacyMenuBackdropStars()` (the animated starfield visible behind
menu/auth/options/pause) is called with no arguments at its one live
call site (`MenuScene.ts:5911`) and defaults its `random` parameter to
`Math.random`; nothing in `capture-ui-surfaces.mjs` or its URL params
reaches that seam, and animation timing keeps advancing the stars before
capture regardless. So even at a pinned seed, repeated runs can still
produce different pixels on every screen carrying the backdrop layer.
"Deterministic and diffable" should be read as topology/assertion
determinism, not screenshot-level reproducibility, until the backdrop RNG
gets its own seedable seam.

**Recorded gap, not yet fixed:** the harness's own `surfaces` object
(`capture-ui-surfaces.mjs`) captures and checks exactly menu, auth,
options, and pause (plus play) — it never opens or captures the
Leaderboard overlay or the progression-reset confirmation overlay. Two
of the file's 5 real `LegacyOverlayKind` screens have **zero** automated
visual coverage today. This means the required gate can pass while
either of those two Phaser overlays is broken, and — relevant to
`UI-MIGRATION-PLAN.md`'s recommended first mounted-DOM proof — it cannot
today verify a progression-reset confirmation dialog migration at all,
DOM or Phaser. Extending the harness to open and check both (or
explicitly carrying this as a known-uncovered exception) should happen
before either surface is treated as gate-verified.

This directly corrects the previous version of this section, which claimed
no reliable screenshot capture existed in "this environment." That claim
was accurate for the ad-hoc Browser-pane tooling used earlier in this
session, but wrong as a statement about the repository: a real harness was
sitting in `scripts/analysis/` the whole time and just hadn't been found.

One caveat for whoever uses this next: the default capture route
(`?content=core-only&theme=aurora&runtimeDiagnostics=1`) renders a reduced
"core-only" surface — the header settings/leaderboard/profile icons in the
captured menu screenshot render as thin-line glyphs, not the real bitmap
HUD assets this session wired in. Whether that's this test mode
deliberately stripping asset-dependent rendering for speed/determinism, or
an actual asset-loading gap under `core-only`, wasn't resolved in this
pass — worth checking before relying on these screenshots to verify
icon-asset-specific work.

## 8. DOM primitive status and adaptation needs

`src/ui/dom/*` (MazerButton, MazerPanel, MazerIconButton, MazerIcon,
MazerField, MazerPasswordField, MazerSlider, MazerSwitch,
MazerSegmentedControl, MazerScrollArea, SettingRow, SettingsSection,
ConfirmDialog, StatusBanner, AppShell, StageShell) is current, deliberate,
token-backed (consumes `designTokens`/`.css`, not its own palette), and
covered by its own Wave 2A/2A.1 tests. It is not finished UI, though —
being built and being wired into the live app are different milestones,
and treating "the components exist" as "the migration is done" would be
its own mistake in the other direction. What's still missing before any
of these primitives are load-bearing:

- **Canonical image-backed icon support.** `MazerIconButton`/`MazerIcon`
  currently render a named vector icon at a fixed internal size. The 3
  real HUD assets (profile/leaderboard/settings) are bitmaps with
  non-uniform internal padding — the same problem `applyLegacyHudIconFrame`
  solves on the Phaser side (§5) needs an equivalent asset-backed icon
  slot or shared image-icon child here, while keeping the primitive's
  existing button semantics (native button element, accessible label,
  pointer target, pressed state, focus ring) untouched.
- **One mounted DOM application root above the Phaser canvas** — doesn't
  exist yet; this is Wave 3C's job, not something to improvise per-screen.
- **Shared responsive/safe-area geometry** between the DOM root and the
  Phaser canvas underneath it (notch/home-indicator insets, viewport
  resize) — currently only solved ad hoc inside `MenuScene.ts`'s own
  layout-resolver functions (§5); needs a contract both renderers read.
- **Pointer-event and z-index ownership** between DOM overlays and the
  Phaser canvas beneath them — nothing currently defines who wins during
  the transition window when a DOM modal opens over live gameplay.
- **DOM view-model projection** from the Wave 1A state/command model into
  whatever these primitives render — the primitives themselves are
  stateless factories today and correctly so; they don't yet have
  anything live to project.
- **Command bridge into current gameplay state** (Wave 3A, not started —
  see `UI-MIGRATION-PLAN.md`) — without it, a mounted `ConfirmDialog`'s
  confirm/cancel buttons have nothing real to dispatch to.
- **Route-aware lifecycle and cleanup** — mount/unmount tied to overlay
  open/close, not just component existence.
- **Reduced-motion behavior** consistent with `prefersLegacyReducedMotion()`
  (already centrally checked on the Phaser side per `UI-DESIGN-CONTRACT.md`'s
  Motion section) — needs the same single gate on the DOM side, not a
  second implementation.
- **Automated visual acceptance** — once mounted, DOM surfaces need their
  own `visual:ui-surfaces` coverage (§7). Correction: not "the same as
  every Phaser screen already gets" — 2 of the file's 5 real overlay
  kinds (Leaderboard, progression-reset confirm) have no harness coverage
  today either (§7's recorded gap). A DOM-mounted surface without an
  existing Phaser equivalent (e.g. a newly-extracted Guide screen) starts
  from the same zero-coverage baseline those two already have, not from
  parity with a fully-covered set.

None of the above is a reason to build a second, competing primitive
system, or to push `MenuScene.ts`, stores, providers, persistence, or
network clients into these stateless primitive factories — that would
turn tested, reusable factories into screen-specific one-offs and defeat
the point of building them ahead of the mounting wave. It's a reason to
treat "the primitives exist" as necessary but not sufficient, and to route
the actual mounting/wiring work through Wave 3A → 4D → 3C in that
mandatory order — DOM mounting under Wave 3C does not start before Wave
4D's board renderer ships — per `UI-MIGRATION-PLAN.md`.
