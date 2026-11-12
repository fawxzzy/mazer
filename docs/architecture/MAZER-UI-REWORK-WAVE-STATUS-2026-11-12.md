# Mazer UI Rework Wave Status, 2026-11-12

Status: read-only status report (MAZER-UI-019). Changes no registry, no runtime and no card.
Base: `origin/main` at `8bc01637`. Everything below was read from that commit, from GitHub (`gh pr view`), and from the external bundle named in section 3.

Labels, never merged: **DOCUMENTED FACT** (read in this repo or on GitHub), **EXTERNAL EVIDENCE** (the bundle), **ASSESSMENT** (my reading of the facts, open to the owner), **UNKNOWN** (not evaluated), **PROPOSAL**.

## 1. Where the rework stands

**ASSESSMENT.** The contracts layer (waves 0 to 2) is on main and enforced by tests. The migration layer (wave 3 onward, the part a player would see as "the UI moved to the new standards") has not happened: the shared DOM components have no production caller, the shared topology/path geometry is not used by the title or the board, `MenuScene.ts` has grown instead of shrinking, and waves 6 and 7 have no work on main. The registry correctly records `redesignComplete.claimed = false`. The umbrella card can honestly be described as "registries done, migration not started".

**DOCUMENTED FACT** (checked on `8bc01637`):

- `src/ui/dom/*` (Wave 2A primitives: AppShell, MazerButton, MazerField, MazerSwitch, MazerSlider, SettingRow, ConfirmDialog, StatusBanner and others) is imported by tests only (`tests/ui/dom-primitives.test.ts`, `dom-settings-primitives.test.ts`, `dom-primitives-styles.test.ts`, `tests/reset/legacy-player-message-inventory.test.ts`). No file under `src/` imports it.
- `src/geometry/topologyPath.ts` (Wave 2B) is imported by `tests/architecture/topology-path-contract.test.ts` only. Neither the title nor the board renderer uses it.
- `src/scenes/MenuScene.ts` is 16,628 lines (11,748 at Wave 0A per `docs/architecture/MAZER-UI-REWORK-WAVE-0A-RECONCILIATION.md`). `git log origin/main --since=2026-10-01 -- src/scenes/MenuScene.ts` lists 81 commits. The Options, Pause, Guide and Leaderboard sheets are still painted by that scene (`docs/current-truth.md`, the 2026-11-06 Wave 5C wiring update: "painted from `src/legacy-runtime/legacySettingsSheetPlan.ts`").
- `src/state/*` (Wave 1A) is imported by `MenuScene.ts`, `src/legacy-runtime/legacyPauseMenuView.ts` and `src/geometry/topologyPath.ts`.
- Eight HTML entrypoints still build (`index.html`, `proof-surfaces.html`, `visual-proof.html`, `watch-pass-setup.html`, `watch-pass-preview.html`, `watch-pass-paywall.html`, `future-phaser.html`, `planet3d.html`); `vite.config.ts` lists all of them.

## 2. Wave by wave

Ownership is `integratorWaveOwnership` in `docs/contracts/mazer-ui-rework-decision-registry.v1.json`. "Active" there means "current exclusive writer for those paths", not "work in progress"; "completed" is a historical handoff. Dates are PR merge dates.

| Wave | Registry status | Paths claimed (summary) | Evidence on main | What is still open |
| --- | --- | --- | --- | --- |
| 0A decisions and guardrails | not listed (done before the ownership table) | new docs/specs/tests | PR #124 (2026-08-04) registry and docs; PR #266 (2026-08-24) ownership reconciliation; `tests/architecture/decision-registry-contract.test.ts` | Nothing registry-side. The nine-point acceptance matrix has no automated enforcement (section 3). |
| 0B PR #83 reconciliation | not listed | integrator-only | The old PR #83/#131 hold was retired by the registry (decision 11). No separate merge record found in this pass. | UNKNOWN whether 0B was formally closed or just superseded. |
| 0C measured baseline | active | `scripts/analysis/capture-auth-capability-surfaces.mjs` (the UI-surface capture moved to 5C on 2026-11-06) | PR #377 (2026-11-06) aligned the UI-surface capture with Welcome auth and the Pause card; CI step "Verify Wave 0C measured-baseline required coverage" (`scripts/verify/run-measured-baseline-required-tests.mjs`) | Bundle gate: "no redesign code until root causes are recorded" for DPR/backing/raster. Whether a baseline with budgets was ever committed: UNKNOWN. |
| 1A state model | not listed | `src/state/*` | PRs #130 (2026-08-07, contract) and #269 (2026-08-24, shared state foundation); `tests/architecture/ui-state-model-contract.test.ts` | Contract only drives `MenuScene` through the 3A bridge; no DOM consumer. |
| 1B tokens | active | `src/theme/tokens.ts`, `src/theme/tokens.css` | PRs #129 (2026-08-07), #270 (2026-08-24), #381 (2026-11-06, motion/legacy/tone values, sync test, off-token meter); `tests/architecture/design-tokens-contract.test.ts`, `design-tokens-sync.test.ts`, `off-token-report.test.ts` | Scene colours still hard-coded: 347 of 422 hex literals are off the theme (`node scripts/report-off-token-literals.mjs`); MAZER-UI-013 holds that work and a ratchet PR is open. |
| 1C diagnostics | active | `src/scenes/diagnostics/*` (7 files), `src/scenes/menuRuntimeDiagnostics.ts` | PR #273 (2026-08-24) versioned diagnostics; seven `src/scenes/diagnostics/*.ts` modules on main | None found. The compatibility adapter's retirement date depends on capture scripts migrating (bundle). |
| 2A DOM primitives | not listed | `src/ui/dom/*` | PRs #276, #277, #278 (2026-08-24); `tests/ui/dom-*.test.ts`; `docs/architecture/MAZER-UI-REWORK-DOM-PRIMITIVES.md` | No production caller (section 1). |
| 2B topology/path geometry | not listed | `src/geometry/topologyPath.ts` | PR #132 (2026-08-08); `tests/architecture/topology-path-contract.test.ts` | No renderer uses it ("no shipping renderer switch yet" in the bundle). |
| 2C asset/icon generator | not listed | PWA emblem source, icons | UNKNOWN as a wave; `npm run brand:icons:check` and `src/brand/*` exist | Not evaluated here. |
| 3A command bridge | completed (`063c9a56`) | `src/scenes/MenuScene.ts`, `src/state/uiLegacyBridge.ts` | PR #343 (2026-09-04) | `uiLegacyBridge.ts` has no active claimant. |
| 3B auth to DOM | active | `src/legacy-runtime/legacyPlayerMessage.ts` | Auth gate fixes landed (PRs #361, #362, 2026-09-21), and the player message queue became a toast in PRs #430 and #431 (2026-11-11), the toast is drawn in Phaser by the scene, not by a DOM component. | The auth form and messages are not DOM. |
| 3C settings/guide/confirmations to DOM | not listed | | None: the sheets are still painted by `MenuScene.ts`. | Not started (**ASSESSMENT**). |
| 4A to 4C high-DPI, DOM HUD, DOM controls | not listed | | `src/render/pixelAlignment.ts` and the 2026-11-10 render-alignment work correct a measured fractional-pixel misalignment; no DOM HUD or DOM control surface found. | HUD and controls are still Phaser. 4A as defined in the bundle (measured backing-store fix with diagnostics) is UNKNOWN. |
| 4D-A Navigation Core v1 | active | `src/render/navigationCore*.ts`, `src/scenes/BootScene.ts` | PR #345 (2026-09-06, `daf92fd4`); CI step "Verify Wave 4D-A ... required coverage" | Holds paths only; implementation merged. |
| 4D-B Teleport v1 | active | `src/render/teleport*.ts` | PRs #346 (2026-09-06) and #348 (2026-09-11); CI step for 4D-B | Holds paths only; slice 1 merged. |
| 4E World Identity / responsive | active | `src/legacy-runtime/legacyMenuBackdrop.ts` | PR #358 (2026-09-15) among others; CI step "Verify Wave 4E World Identity required coverage" | The bundle's 4E ("responsive compositions: portrait, small phone, landscape, tablet, desktop, TV, OBS") is only partly covered: a supported viewport matrix PR is open (MAZER-QA-006). |
| 5A results, tutorial | not listed | | UNKNOWN | Not evaluated. |
| 5B system / PWA | active | `package.json` | PR #380 (2026-11-06) | Holds `package.json` only. |
| 5C shared-account OAuth consumer | active (depends on 0C, 3B, 4E, 5B) | `index.html`, `vercel.json`, `vite.config.ts`, `src/boot/*` (4 files), `legacyAccountPortal.ts`, `legacyAuth.ts`, `MenuScene.ts`, `base.css`, two analysis scripts | PRs #361, #362, #382 (2026-11-06 menu accessibility); CI step "Verify Wave 5C ... required coverage"; many 2026-11 account PRs | Broadest active claim: every `MenuScene.ts` edit lands under 5C. |
| 5D arcade/cyberdeck profile routing | not listed | | `docs/contracts/mazer-ui-rework-platform-profiles.v1.json` and `tests/architecture/ui-platform-profiles-contract.test.ts` exist; no routing found. | Not started (**ASSESSMENT**). |
| 6 satellite surfaces (proof surfaces, Watch Pass, visual-proof, future-phaser retirement, planet3d isolation) | not listed | | Entrypoints are classified in the registry (`entrypoints`), and `proof-surfaces`, `visual-proof`, `watch-pass-*`, `future-phaser`, `planet3d` still build. | No migration or retirement on main. |
| 7 cleanup and release | not listed | | None. | Not started. |

Registry detail worth knowing: the registry lists ten assignments. Only 3A is `completed`; the other nine (0C, 1B, 1C, 3B, 4D-A, 4D-B, 4E, 5B, 5C) are `active` and hold their paths until marked completed. Several of those delivered their implementation long ago (1B, 1C, 4D-A, 4D-B) and only keep the claim. Marking them completed is a registry edit and an owner decision, not done here.

## 3. The nine-point Definition of Complete

**EXTERNAL EVIDENCE.** The bundle is `C:\ATLAS\handoff\mazer\mazer-everything-bundle-20260803.zip` (163 entries). The list is in `01_FINAL_AUTHORITATIVE_HANDOFF/blueprint/00_EXECUTIVE_DECISIONS.md`, section "Definition of complete". The bundle's `blueprint/10_VERIFICATION_AND_ACCEPTANCE.md` lists the gates and `blueprint/09_MIGRATION_WAVES_AND_PR_LANES.md` the waves. The registry (`decision no-redesign-complete-without-acceptance-matrix`) forbids claiming the redesign complete until this list passes.

| # | Requirement (bundle wording) | Current main | State |
| --- | --- | --- | --- |
| 1 | One state/command/token contract drives Phaser and DOM | Contract and token modules exist and are tested; Phaser consumes them (`MenuScene.ts` via the 3A bridge; 14 source files import the token module). The DOM side has no production consumer. | **Partial** |
| 2 | Core player surfaces are migrated to shared components | `src/ui/dom/*` exists and is unused in production; auth, settings, guide, pause, HUD and controls are Phaser. | **Not met** |
| 3 | High-DPI rendering is measured and corrected | Fractional-pixel alignment fixes and DPR diagnostics exist; a committed baseline with budgets was not found. | **Partial / UNKNOWN** |
| 4 | Title and board share topology/path geometry | Pure module and contract only; no renderer uses it. | **Not met** |
| 5 | All acceptance viewports pass without overlap or hidden actions | The bundle's `VIEWPORT_ACCEPTANCE.csv` has 13 viewports. `core`, `extended` and `platform` presets in `scripts/visual/layout-matrix.config.mjs` cover 12 of them; the bundle's 360x720 small phone is not a preset (MAZER-QA-006 adds 360x800 and 320x568 instead). Overlap diagnostics exist; no recorded all-viewport pass. | **Partial** |
| 6 | Keyboard, pointer, touch, reduced motion and screen-reader behaviour verified | PR #382 fixed 320 px clipping and 44 px hit zones; the DOM primitives have semantic tests; reduced-motion capture is used in the matrix. No screen-reader pass or manual keyboard pass is recorded. | **Partial / UNKNOWN** |
| 7 | Proof and Watch Pass surfaces have an explicit product/tool boundary | Registry classifies every entrypoint (`proof-surfaces-internal-only`, `watch-pass-incubating-no-billing`, `planet3d` lab) and a test cross-checks it against the live HTML files; the surfaces themselves are not migrated. | **Partial** |
| 8 | Obsolete UI paths, theme variants and prototype entrypoints retired or isolated | `future-phaser.html` and its runtime still build; archived theme aliases are mapped, not removed; old render paths remain. | **Not met** |
| 9 | Full verification, capture gates, input equivalence, auth persistence, PWA behaviour, final visual review | `npm run verify` and CI exist and are green on main; the full release gate list in the bundle (input equivalence, live play QA, auth persistence soak, runtime soak, final visual review) was never run as one release evaluation. | **Not evaluated** |

Count: met 0, partial 5 (1, 3, 5, 6, 7), not met 3 (2, 4, 8), not evaluated 1 (9). **ASSESSMENT:** the matrix is not close to passing, and points 2, 4 and 8 depend on work that has not started. No part of the matrix should be marked passed until the owner accepts an evidence file for it.

## 4. Proposed child cards (**PROPOSAL**)

Auditor recommendation recorded in `config/mazer-work-ledger.json` (MAZER-UI-019): split into children and keep the umbrella as planning only. The owner decides; no card is created or edited by this report. Titles are 90 characters or fewer.

1. **Decompose MenuScene along the 3A bridge** (point 2). Characterization tests first, then move one surface at a time (Options/Pause sheets, Guide, Leaderboard, auth gate) into modules or DOM, never a rewrite (decision `no-big-bang-menuscene-rewrite`). `MenuScene.ts` is 16,628 lines and every edit is under the single 5C claim, so the card needs its own ordering and an owner-approved release of the 5C claim for each slice.
2. **Move auth, settings, guide and confirmations onto the DOM primitives (Wave 3B/3C)** (points 1 and 2). First production consumer of `src/ui/dom`, behind a per-surface rollback flag as the bundle requires. Depends on card 1's first slice.
3. **Wave 6 proof surfaces and satellites onto the shared primitives** (points 7 and 8). Rebuild `proof-surfaces` as the internal gallery, move Watch Pass setup/preview behind the capability flag, keep the paywall an explicit disabled prototype. Lowest collision risk because none of these paths are under the 5C claim, so it can start without the scene work.
4. **Retire `future-phaser.html` after extracting adapter tests** (point 8). Remove the entrypoint, its `vite.config.ts` input (5C path, needs the owner's release), `src/future-runtime/phaser/*`, `scripts/visual/future-runtime-run.mjs` and the registry entry; keep `tests/future-runtime` coverage that still describes live behaviour. Planet 3D isolation stays a separate small step.
5. **Switch the title and board to the shared topology/path geometry** (point 4). Adopt `src/geometry/topologyPath.ts` in one renderer behind a flag with a pixel comparison, preserving corridor semantics and the reveal lifecycle.
6. **Evaluate the Definition of Complete with evidence** (points 3, 5, 6, 9). Commit the measured DPR/frame/input baselines with budgets, run the full viewport list including 360x720, record a keyboard and screen-reader pass, and add a test that fails if `redesignComplete.claimed` becomes true without an `acceptanceEvidenceRef`. Needs real devices for part of it.
7. **Registry housekeeping** (no code). Mark 1B, 1C, 4D-A and 4D-B completed where their implementation is merged, so the exclusive-writer table lists only real claims. Registry edits are guarded by tests and need the owner.

Open decision for the owner: keep MAZER-UI-019 as the umbrella (planning only) with cards 1 to 7 as children, or close it and track the children alone. Recommendation: keep it as a planning umbrella until the matrix in section 3 is evaluated, as the auditor suggested.

## 5. What this report did not do

- No registry JSON, owner registry, export or current-truth edit; no code change.
- Waves 0B, 2C, 4A, 4B, 4C and 5A could not be mapped to merged PRs from the registry alone and are marked UNKNOWN or "not found". A `git log` search by wave name found only the PRs cited above.
- Nothing was run in a browser and nothing was checked on a real phone.
- The bundle was read as data (the zip was opened and three files read, no extraction to disk, no scripts executed).
