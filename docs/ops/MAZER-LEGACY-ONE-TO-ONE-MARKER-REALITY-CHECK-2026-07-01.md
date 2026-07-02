# Mazer Legacy 1:1 Marker Reality Check

Date: 2026-07-01
Status: landed

## Purpose

This packet rechecked the `97%` legacy 1:1 completion marker against restored legacy truth and the current localhost web runtime.

Conclusion:

- `97%` is not defensible as a literal old-Mazer-to-web 1:1 completion marker.
- The corrected held marker is `70%`.

## Evidence Checked

Legacy truth:

- `legacy/old-project.zip`
- `legacy/screenshots/menu-01.png`
- `legacy/screenshots/menu-02.png`
- `legacy/screenshots/menu-03.png`
- restored source under `tmp/mazer-legacy-unreal-restore/Source`
- `docs/legacy/gameplay-spec.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`

Current web truth:

- localhost side browser at `http://127.0.0.1:4173/?runtimeDiagnostics=1`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`

## Current Runtime Readback

The localhost runtime remained healthy during the check:

```text
diag s1 r3 perf:full
fps 137 avg 7.3ms worst 15.0ms spikes 0
trail 46/46 listeners 4 vis 0/0 low off
demo explore cue explore mistakes on cursor 55
ai wrong 1 back 2 recover 1
gen stage consumed-finalized:7 signal player-finalized complete yes
draw rows 25/25 remaining 0 progress 100% batch 1 rows staged yes
```

That proves the current diagnostics, AI counters, and staged draw-surface are functioning. It does not prove screenshot-grade or line-for-line legacy closure.

## Why 97% Was Rejected

The previous marker awarded near-full credit for several segments that are useful but not complete 1:1 clone evidence:

- visual composition still differs materially from the restored menu screenshots
- the current board reads more blocky/cellular than the restored dense Unreal corridor geometry
- the generation lifecycle is mapped, but topology internals are still browser-native rather than a line-for-line `CreateGrid` / `MapPath` / `CreatePath` / `CreateShortCuts` port
- demo AI carries important restored behavior, but it is not a line-for-line Unreal path-stack and backtracking port
- HUD timer and goal-arrow parity remain partial

The parity matrix already said the current web app is not a 1:1 legacy port. The marker needed to match that truth.

## Corrected Marker

The repo-wide marker is now:

```text
70 / 100
```

Interpretation:

- strong legacy extraction and proof foundation
- several restored behavior contracts are implemented and tested
- current app is inspectable and useful on a single maintained localhost browser
- not close enough visually or algorithmically to call the 1:1 clone almost complete

## Next Honest Slice

Resume with a bounded module, not a broad polish pass.

Recommended next packet:

```text
legacy screenshot-grade board/material review packet
```

Target:

- compare one board/material/silhouette miss against `legacy/screenshots/menu-01..04`
- edit only the visual owner chain for that module
- preserve current diagnostics and proof lanes
- do not ratchet the marker unless the bounded miss is visibly reduced and verified

