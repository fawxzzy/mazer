# Mazer Mobile Touch Live Proof

Date: 2026-07-03
Status: accepted mobile-touch movement proof

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
- State changed: `yes`

## Remaining Gap

The proof confirms touch movement through the maintained mobile play route. It does not close touch controls for pause, resume, toggle-thoughts, or restart because the current mobile smoke run recorded no `control_used` events and those control steps did not change runtime state.

The active marker can credit mobile movement proof, but touch-control proof remains open.
