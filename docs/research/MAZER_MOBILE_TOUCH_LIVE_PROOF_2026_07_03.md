# Mazer Mobile Touch Live Proof

Date: 2026-07-03
Status: accepted mobile-touch movement and control proof

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
- Touch control state: pause opens, pause resumes from the same target, toggle-thoughts changes state, restart returns player state, and action controls no longer overlap D-pad hit slop
- State changed: `yes`

## Result

The proof confirms touch movement and the maintained mobile touch-control route: pause, resume, toggle-thoughts, restart, and post-restart movement all change state in the `mobile-touch-smoke` timeline. Runtime diagnostics expose overlay/resource state for maintained proof, and the touch action column is separated from D-pad hit slop.

This closes the mobile input/control proof lane for the current mechanics/mobile marker. Visible mobile control affordances remain a visual-readability task, and `control_used` telemetry remains out of this reset-lane proof.
