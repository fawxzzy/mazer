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
| **3A** | **Command bridge / live-scene mapping — gates 3C and 4D** | **not started — next** |
| 3C | DOM primitive mounting, view-model projection, one-overlay enforcement | not started |
| 4D | Actual Phaser board/title renderer switch (topology contract + tokens) | not started, gated behind 3A |

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

**What this means for scope:** the actual redesign implementation (mounting
`src/ui/dom/*`, wiring Wave 3A's command bridge, Wave 4D's renderer switch)
already has an owner and a plan. This audit's job is to *not duplicate that
plan*, and to flag where this session's own work should stay clear of it.
Sections 1-6 below are corrected against that reality; §7 (the original
draft's proposed migration plan) has been removed in favor of pointing at
the real wave docs — see `UI-MIGRATION-PLAN.md`.

## 1. Screen inventory

One file, `src/scenes/MenuScene.ts` (16,466 lines), owns every player-facing
surface. There is no per-screen file/component split at all today.

| Surface | Entry point | Overlay kind |
|---|---|---|
| Boot/loading | `BootScene.ts` (separate scene) | n/a |
| Auth gate (blocking, pre-menu) | drawn inline in menu render path | n/a (`authGateGraphics`, not an `OverlayKind`) |
| Main Menu | `mode === 'menu'`, `overlay === 'none'` | `'none'` |
| Active Play | `mode === 'play'`, `overlay === 'none'` | `'none'` |
| Settings (menu context) | `openOverlay('options')` from menu/QA entry points only | `'options'` |
| Pause | `openOverlay('pause')` from play | `'pause'` |
| Login/Account (auth) | `openOverlay('auth')` | `'auth'` |
| Leaderboard | `openOverlay('leaderboard')` | `'leaderboard'` |
| Progression reset confirm | `openOverlay('confirm-progression-reset')` | `'confirm-progression-reset'` |
| Guide | **not a screen** — a section rendered inline inside Settings/Pause via `createLegacyOptionsInfoSection` | n/a |

`LegacyOverlayKind` (`src/legacy-runtime/legacyOverlayRouting.ts:2`) is the
complete list, read directly from the live type: `'none' | 'options' |
'pause' | 'auth' | 'confirm-progression-reset' | 'leaderboard'`. There is
no dedicated `'guide'` kind — confirmed below, this is a real structural
issue, not just a visual one. Play-context Settings is reached only
through Pause duplicating Settings' own content directly, not by
navigating into the `'options'` overlay kind — see §2, and
`UI-SCREEN-MAP.md`'s Settings/Pause rows.

**Flagged discrepancy, not resolved here:** `docs/current-truth.md`
("Current overlay family") lists a different, narrower set — options /
features / game modes / pause — with no mention of auth, leaderboard, or
confirm-progression-reset. Per `AGENTS.md`, `current-truth.md` is the
designated anti-drift override when docs disagree, so this audit does not
just assert its own code-read inventory over it. But `features` and `game
modes` also appear elsewhere in `current-truth.md` as nested *sub-panels*
reached by routing from Options/Pause ("nested overlay routing from
`Options`/`Pause` back through `Features` and `Game Modes`"), which reads
as a different, narrower concept — legacy in-panel navigation depth — than
the top-level `LegacyOverlayKind` union this section documents, and
`current-truth.md`'s list predates (or simply never mentions) the
auth/leaderboard/confirm-progression-reset overlay kinds that verifiably
exist in current source and are reachable (`openOverlay('auth')`,
`openOverlay('leaderboard')`, `openOverlay('confirm-progression-reset')`
all have live call sites in `MenuScene.ts`). Whether that's `current-truth.md`
being stale on this one bullet, or describing a genuinely different
"overlay family" concept than this table, needs the doc owner's call, not
a unilateral fix in this docs-only PR.

## 2. Confirmed: Pause is literally Settings' own content, reused

`buildPauseOverlay()` (`MenuScene.ts:11031`) and `buildOptionsOverlay()`
(`MenuScene.ts:10527`) both call:
- `this.createLegacyOptionsInfoSection(...)` — the Guide section
- `this.createFeatureControlRows(...)` — the settings toggle/slider rows

Pause's own additions on top of that shared content are just: a different
header (Home + back-chevron instead of the menu's own header icons) and
`includeMovementSpeed: false` on the control-row builder. Everything else —
guide cards, every settings row, the scroll behavior — is the *exact same
function call* Settings makes. This is direct, code-level confirmation of
"Pause behaves too much like another settings screen," not just a visual
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

**Overlay shell (shared by all 5 overlay kinds):**
`drawLegacyCyberPanel`, `drawOverlayPanel`,
`drawLegacyOverlayScrollFacade`, `createOverlayTitle`,
`createOverlayBackChevronButton`, `createButton`.

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

## 7. Correction: a deterministic visual-proof harness already exists and works

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
  own `visual:ui-surfaces` coverage (§7), the same as every Phaser screen
  already gets.

None of the above is a reason to build a second, competing primitive
system, or to push `MenuScene.ts`, stores, providers, persistence, or
network clients into these stateless primitive factories — that would
turn tested, reusable factories into screen-specific one-offs and defeat
the point of building them ahead of the mounting wave. It's a reason to
treat "the primitives exist" as necessary but not sufficient, and to route
the actual mounting/wiring work through Wave 3A → 3C in order, per
`UI-MIGRATION-PLAN.md`.
