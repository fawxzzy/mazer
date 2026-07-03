# Mazer Mobile Touch Live Proof

Date: 2026-07-03
Status: accepted mobile-touch movement plus partial control proof

## Scope

This receipt records the maintained-browser mobile play proof for the active mechanics/mobile lane. It does not reopen legacy screenshot-grade visual parity.

## Command

```powershell
npm run edge:live -- --skip-build true --headless true --run mobile-touch-smoke
```

## Artifact

- Summary: `C:\ATLAS\tmp\captures\mazer-edge-live\mobile-touch-smoke\summary.md`
- JSON: `C:\ATLAS\tmp\captures\mazer-edge-live\mobile-touch-smoke\summary.json`
- Video: `C:\ATLAS\tmp\captures\mazer-edge-live\mobile-touch-smoke\videos\phone-portrait.webm`

## Result

- Route: `/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1`
- Viewport: `phone-portrait` (`390x844`)
- Board bounds: `24,251 343x343`
- HUD bounds: `14,4 354x32`
- Board overflow: `pass`
- HUD overlap: `pass`
- HUD clip: `pass`
- Touch movement deltas: `3`
- Touch control state: pause opens, restart changes state, and toggle/restart coordinates no longer overlap D-pad hit slop
- State changed: `yes`

## Remaining Gap

The proof confirms touch movement through the maintained mobile play route and now covers a partial touch-control lane: pause opens from the shared mobile touch layout, restart changes state, the action column is separated from D-pad hit slop, and runtime diagnostics now expose overlay/resource state for maintained proof.

The proof does not fully close mobile controls. The same pause touch target does not yet provide a maintained-smoke resume transition while the pause overlay is open, and `control_used` telemetry remains out of this reset-lane proof. The active marker can credit partial mobile control routing, but final touch-control usability remains open.
