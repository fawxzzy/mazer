# Mazer Legacy Web Port Contract

Date: 2026-06-28
Status: active owner-repo port lane

## Intent

Target the current web app as the canonical Mazer app while porting the legacy Unreal project as faithfully as possible.

This lane is not "make recovery mode nicer."
This lane is "use the legacy project as source truth and move that truth into the web runtime."

## What "1:1" means here

For the web app, `1:1` means:

- same gameplay loop
- same maze lifecycle and reset behavior
- same menu and overlay structure
- same movement model
- same player/start/end/trail semantics
- same major visual composition
- same color-role hierarchy
- same menu-time demo behavior
- same options/features/game-mode surface responsibilities

## What cannot be literally 1:1

The Unreal code itself cannot run unchanged inside the browser app.

So `1:1` does **not** mean:

- ship Unreal C++ directly in Vite/TypeScript/Phaser
- reuse Blueprint execution as-is in the browser
- claim engine-level rendering parity where the engines differ
- preserve non-deterministic random rolls bit-for-bit when the legacy project itself mixed random sources

The right contract is:

- restore the old Unreal project as read-only source truth
- port behavior/system/UI semantics into the web app
- verify the port against the restored project, legacy screenshots, and repo-owned proof receipts

## Source-of-truth order for this lane

1. Restored Unreal project from `legacy/old-project.zip`
2. Legacy screenshots under `legacy/screenshots/`
3. Existing legacy docs under `docs/legacy/`
4. Current web runtime code and proof surfaces

If current web behavior disagrees with restored legacy truth, the legacy truth wins for this lane.

## Immediate execution plan

### Phase 1: restore and inventory legacy truth

- restore `legacy/old-project.zip` into an ATLAS temp workspace outside the repo worktree
- record engine version, runtime ownership map, UI ownership map, and material/asset surfaces
- keep the restored project read-only for comparison and port verification

### Phase 2: define direct web-port slices

Port by systems, not by broad shell polish:

1. maze generation/runtime parity
2. player movement and win/reset parity
3. menu demo AI parity
4. menu/options/features/game-mode overlay parity
5. visual composition and palette-role parity
6. final proof and drift cleanup

### Phase 3: move web app truth toward legacy

- rewrite the current web shell where needed
- remove productized deviations that block legacy parity
- keep only one canonical Mazer app identity

## Hard boundaries

- no duplicate app identity
- no new Supabase surface
- no new Vercel surface
- no production deploy as part of this truth-restoration start
- no claim that the current Phaser shell is already close enough when legacy evidence says otherwise

## First concrete next slice

`legacy restore + system parity matrix`

Deliverables:

- reproducible legacy extraction command
- restored Unreal workspace in ATLAS temp storage
- parity matrix mapping:
  - legacy source owner
  - current web owner
  - parity status
  - exact gap
  - next port target
