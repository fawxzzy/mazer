# Mazer

This repo is now in a controlled reset lane:

`restore legacy Unreal truth -> port that truth into the web app`

The web app remains the canonical app target.
The old Unreal project is the truth source.

## Current state

- repo: `fawxzzy/mazer`
- canonical app: web app in this repo
- legacy truth source: `legacy/old-project.zip`
- restored legacy workspace: `C:\ATLAS\tmp\mazer-legacy-unreal-restore`
- active branch lane for this pass: `codex/legacy-web-port-truth`

## What changed

The previous productized Phaser shell was not close enough to the old game.
So the runtime was reset and replaced with a smaller legacy-first shell:

- legacy-shaped main menu
- `Exit / Start / Options` front door
- one-overlay-at-a-time menu flow
- legacy-style options/features/game-modes/pause structure
- simpler board-first runtime aimed at a faithful web port

## Current truth docs

Read these first:

1. [docs/current-truth.md](C:/ATLAS/repos/mazer/docs/current-truth.md)
2. [docs/research/MAZER_LEGACY_WEB_PORT_CONTRACT.md](C:/ATLAS/repos/mazer/docs/research/MAZER_LEGACY_WEB_PORT_CONTRACT.md)
3. [docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md](C:/ATLAS/repos/mazer/docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md)
4. [docs/legacy/gameplay-spec.md](C:/ATLAS/repos/mazer/docs/legacy/gameplay-spec.md)
5. [docs/legacy/ui-spec.md](C:/ATLAS/repos/mazer/docs/legacy/ui-spec.md)
6. [docs/legacy/art-direction.md](C:/ATLAS/repos/mazer/docs/legacy/art-direction.md)

## Local development

Install dependencies:

```bash
npm install
```

Key commands:

```bash
npm run legacy:extract
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
npm run test
npm run lint
npm run build
npm run verify
```

Current proof spine:

```bash
npm run legacy:extract
npm run verify
```

## Reset-lane verification

Current `verify` covers:

- reset-lane tests in `tests/reset/`
- production build

This is intentionally narrower than the prior productized shell proof lane because the runtime is being rebuilt from scratch against legacy truth.

## Boundaries

- keep one canonical Mazer repo/app identity
- do not create duplicate Supabase or Vercel surfaces
- do not treat the restored Unreal project as a second live app
- do not claim 1:1 parity until the parity matrix gaps are closed

## Legacy boundary

- `legacy/old-project.zip` is the source of truth, not a second shipped product
- extracted Unreal content belongs in temp workspace only
- do not dump the extracted legacy project into tracked repo paths
