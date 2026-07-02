# Mazer Legacy Generation Contract Module Packet

Date: 2026-06-29
Lane: Mazer pass 2 parity
Module: generation / reset contract

## Why this packet exists

The repo already had a generation/reset owner map, but the actual runtime contract was still implicit. Mode-specific maze builder selection, deterministic seed stepping, and the legacy process-stage truth were not yet isolated in one repo-owned module.

## Landed scope

- add `src/legacy-runtime/legacyGenerationLifecycle.ts`
- centralize:
  - legacy process stage ids
  - shortcut-stage inclusion rule
  - menu-vs-play builder routing
  - deterministic seed stepping
- route `MenuScene.ts` through that module for build-mode selection and regeneration seed updates
- add proof in `tests/reset/legacy-generation-lifecycle.test.ts`

## Boundaries preserved

- no full generator rewrite
- no menu shell rewrite
- no demo walker rewrite
- no production deploy

## Proof plan

- `npm run test -- tests/reset/legacy-generation-lifecycle.test.ts`
- `npm run verify`

## Next honest slice

If this packet lands cleanly, the next bounded generation lane should be:

- staged process-port planning for `0/3/4/5/6/7/8`, or
- the first runtime extraction needed to stage those steps without mixing them into unrelated scene logic
