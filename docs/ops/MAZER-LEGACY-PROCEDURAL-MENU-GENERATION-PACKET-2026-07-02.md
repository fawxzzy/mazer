# Mazer Legacy Procedural Menu Generation Packet

Date: 2026-07-02
Status: landed

## Scope

Move the live main-menu maze off the fixed screenshot snapshot and onto the same procedural checkpoint/path/shortcut builder family used by Start-game mazes.

## Changed

- Added `source: 'menu-generated'` as a first-class runtime maze identity.
- Added `createLegacyGeneratedMenuMaze()` in `src/legacy-runtime/legacyMaze.ts`.
- Routed live menu generation requests through `menu-generated` in `src/legacy-runtime/legacyGenerationLifecycle.ts`.
- Preserved `createLegacyMenuMaze()` as a fixed screenshot fixture, not the live menu runtime owner.
- Kept menu-specific shortcut tuning and row-sliced menu drawing separate from play-specific shortcut tuning and full-stage play consumption.

## Preserved

- Start-game mazes still route through `createLegacyMaze()` and `source: 'play-generated'`.
- The fixed menu snapshot remains available for screenshot comparison and fixture tests.
- Existing demo walker handling still uses fixed-snapshot policy only when the maze is explicitly tagged `source: 'menu-snapshot'`.
- No deploy, key rotation, Supabase/Vercel mutation, or duplicate app surface.

## Marker

The 1:1 marker remains `93%`.

This packet closes a real architecture/runtime direction gap, but it does not close exact Unreal RNG/time seeding or line-for-line process-yield timing. It also requires fresh live-browser visual proof before the visual-composition row can safely ratchet.

## Validation

```bash
npm run test -- tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-generation-diagnostics.test.ts tests/reset/legacy-reset.test.ts tests/reset/legacy-menu-demo-lifecycle.test.ts
```

Result:

```md
20 test files passed
124 tests passed
```
