# Mazer Runtime Diagnostics AI / Draw Progress Packet

Date: 2026-07-01

## Lane

`legacy Unreal truth -> web app reset/port`

## Segment

Main menu diagnostics, menu-demo AI review surface, and menu generation draw-stage proof.

## Intent

Make the current side-browser/runtime proof surface more useful before changing deeper gameplay internals.

This packet does not rewrite maze topology, solver truth, or demo walker behavior. It exposes the already-owned live state so follow-on tweaks can be made module-by-module against evidence instead of broad visual guessing.

## Changes

- Runtime diagnostics now summarize menu stage-6 draw progress with:
  - row count
  - rows visible
  - rows remaining
  - completion state
  - percent complete
- The visible runtime diagnostics panel now shows live menu-demo AI counters:
  - wrong branch count
  - backtrack count
  - recovery count
- Visual diagnostics now carry the same draw-progress fields for route-aware proof scripts.
- Visual diagnostics now carry the live menu-demo telemetry object.
- The reset-lane source guard now points at the named draw-row bridge instead of the old inline call.

## Boundaries Preserved

- No maze topology rewrite.
- No change to demo walker movement behavior.
- No change to the legacy `0/3/4/5/6/7/8` stage contract.
- No production deploy.
- No Supabase, Vercel, or GitHub app-resource mutation.
- No duplicate app identity.

## Validation

Passed:

```bash
npm run test -- tests/scenes/menu-runtime-diagnostics.test.ts
npm run test -- tests/reset/legacy-reset.test.ts
npm run test -- tests/ai/demo-walker.test.ts
npm run lint
npm run build
npm run verify
```

Localhost sanity:

```text
http://127.0.0.1:4173/?runtimeDiagnostics=1 -> 200
port 4173 -> one listener
```

Browser-control note:

The in-app browser remained on the single maintained `4173` tab, but the Playwright MCP profile was locked and could not attach without creating an isolated second browser instance. Because the current workflow explicitly prefers one maintained browser, no extra browser instance was opened for this packet.

## Marker Decision

Marker remains held at `97%`.

Reason: this packet improves proof quality and future edit safety, but it does not close a new visible 1:1 parity gap by itself. The next marker movement still requires a bounded segment that changes behavior or closes screenshot-grade visual parity with proof.

## Next Best Packet

Continue modularly:

1. Use the single `4173` preview with `runtimeDiagnostics=1` to watch the new AI counters and draw progress.
2. If draw progress looks too coarse or too fast, open a dedicated stage-6 cadence packet.
3. If AI counters/cues reveal a mismatch, open a dedicated demo AI branch-selection/backtrack packet.
4. Do not mix either packet with broad menu polish.
