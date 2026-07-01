# Mazer Legacy Maze Shortcut Topology Packet

Date: 2026-07-01
Mode: owner-repo implementation
Branch: `codex/mazer-pass2-menu-parity`

## Intent

Improve the browser maze shortcut builder without claiming a full line-for-line Unreal generator port.

The specific user-facing problem was that shortcut carving had been too weak and random. The desired behavior is not merely "open extra walls"; it is to create plausible alternate routes so generated mazes can expose more than one useful way toward the goal.

## Changes Landed

- Replaced random dead-end wall punching with scored shortcut candidates.
- Added family-aware shortcut profiles so dense, sparse, braided, framed, split-flow, and classic mazes do not all receive the same shortcut shape.
- Added bounded point-to-point open-graph distance checks instead of full distance-map scans per dead end.
- Prevented sparse mazes from falling back into weak low-quality shortcuts when no suitable sparse shortcut candidate exists.
- Added a bounded route-aware braided bypass pass after endpoint selection so braided mazes can add alternate start-goal route options where the final route actually lives.
- Kept route-aware bypasses in the existing `braid` generation trace phase so step-by-step generation playback can surface the additional openings without a trace schema change.

## Proof

Focused proof:

```bash
npx vitest run tests/maze/maze-domain.test.ts --maxWorkers 1 --testNamePattern "size presets|family archetypes|shortcut braiding|braid ratio"
```

Result:

```text
4 passed
```

Full maze proof:

```bash
npx vitest run tests/maze/maze-domain.test.ts --maxWorkers 1
```

Result:

```text
19 passed
```

## Marker Re-Evaluation

Touched marker segment:

- `Generation lifecycle exactness`

Current points before packet:

- `9 / 16`

Current points after packet:

- `9 / 16`

Repo-wide marker remains:

- `70 / 100`

Reason:

- This packet improves browser-native shortcut topology and proves route-affecting bypasses.
- It does not recover or port the old Unreal `CreateGrid` / `MapPath` / `CreatePath` / `CreateShortCuts` implementation line-for-line.
- The correct truth is "stronger browser equivalence," not "literal generator parity."

## Boundaries Preserved

- No deploy.
- No Supabase or Vercel resource mutation.
- No duplicate app identity.
- No claim that Mazer is 97% or near-100% 1:1 complete.
- No broad visual/menu rewrite in this packet.

## Next Honest Seams

- Capture desktop and mobile localhost views after full repo verification.
- Continue modular maze-generation review if old Unreal source can be directly compared against this browser-native topology builder.
- Keep screenshot-grade board/material and HUD parity separate from shortcut topology work.
