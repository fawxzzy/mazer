# Mazer Cycle Telemetry Atlas Bridge

Status: active local-first bridge

## Purpose

Mazer already records compact completion receipts in browser storage under
`mazer.cycle-telemetry.v1`. The Atlas bridge turns those receipts, or runtime
diagnostics containing `cycleTelemetry`, into an Atlas-safe report that future
Codex/Atlas sessions can read without importing unbounded gameplay data.

This is not remote analytics and does not train a model. It is a bounded
local-learning export path for product tuning.

## Owner Surfaces

| Concern | Owner | Proof |
| --- | --- | --- |
| Runtime cycle recorder | `src/legacy-runtime/mazeCycleTelemetry.ts` | `tests/reset/legacy-cycle-telemetry.test.ts` |
| Menu/play completion hooks | `src/scenes/MenuScene.ts` | `tests/reset/legacy-reset.test.ts`, runtime diagnostics |
| Report/export bridge | `scripts/analysis/maze-cycle-telemetry-report.mjs` | `tests/analysis/maze-cycle-telemetry-report.test.mjs` |
| Runtime diagnostics readback | `src/scenes/menuRuntimeDiagnostics.ts` | `tests/scenes/menu-runtime-diagnostics.test.ts` |

## Data Contract

Input may be one of:

- raw `mazer.cycle-telemetry.v1` history JSON
- runtime diagnostics JSON containing `cycleTelemetry`
- localStorage-style JSON containing a `mazer.cycle-telemetry.v1` string

Output schema:

```json
{
  "schema": "mazer.cycle-learning.report.v1",
  "source": {},
  "learning": {},
  "cohorts": {},
  "aiReview": {},
  "decision": {},
  "dataPolicy": {},
  "atlas": {},
  "risks": [],
  "nextActions": []
}
```

The report intentionally excludes raw full `playerPath` arrays. It keeps only
bounded previews plus aggregates.

## Command

```bash
npm run cycle:report -- --input tmp/cycle-telemetry.json --pretty
```

Optional Atlas receipt write:

```bash
npm run cycle:report -- --input tmp/cycle-telemetry.json --atlas-receipt-root ../../runtime/receipts/mazer/cycle-telemetry --pretty
```

That writes both:

- `runtime/receipts/mazer/cycle-telemetry/<timestamp>.json`
- `runtime/receipts/mazer/cycle-telemetry/latest.json`

## Interpretation Rules

- `signal="hold"` means do not tune yet or signal is mixed.
- `signal="ease"` means recent cycles suggest too much pressure or friction.
- `signal="challenge"` means recent play cycles are clean enough to test more pressure.
- Menu-demo receipts can tune demo AI feel, but human play difficulty should wait for enough `play` receipts.
- Performance issues can distort completion timing and control-read signals, so high `averageFrameMs` is a tuning risk.

## Atlas/Cortex Path

This bridge gives Atlas a durable, compact artifact. Future Cortex or Playbook
flows should consume the report schema, not raw browser localStorage.

Safe next lanes:

1. Add a browser/dev export button if manual localStorage copy becomes annoying.
2. Add an Atlas-side validator for `mazer.cycle-learning.report.v1`.
3. Add adaptive tuning only after enough `play` receipts exist and the report signal is stable.
