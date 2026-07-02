# Mazer Front-Door Button Baseline Packet

Date: 2026-07-01
Lane: legacy Unreal truth -> web app reset/port

## Trigger

The maintained mobile browser showed the front-door `Start` button sitting higher than `Exit` and `Options`.

That lifted-center layout was encoded directly in `src/legacy-runtime/legacyMenuLayout.ts` and guarded by `tests/reset/legacy-menu-layout.test.ts`, so this was not a transient render bug. It was layout truth that needed to be corrected.

## Scope

- `src/legacy-runtime/legacyMenuLayout.ts`
- `tests/reset/legacy-menu-layout.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`

## Change

The front-door layout now assigns `centerButtonY` from the same `buttonY` used by the side buttons.

This keeps:

- the restored `Exit`, `Start`, `Options` button set
- existing button labels and actions
- existing desktop and portrait button sizes
- menu-only button chrome

It removes:

- the browser-only lifted `Start` button baseline

## Proof

Focused proof:

```bash
npm exec vitest -- run tests/reset/legacy-menu-layout.test.ts --reporter=dot
```

Visual proof:

```text
tmp/captures/mazer-menu-button-baseline-2026-07-01/menu-button-baseline-mobile-390x844.png
```

The local `4173` preview server was rebuilt and restarted before capture so the browser proof used the updated production bundle.

## Marker Re-Evaluation

The Mazer legacy 1:1 marker remains `87%`.

Reason: this packet fixes a clear visible button-placement defect and improves mobile menu composition, but it does not close the remaining screenshot-grade menu composition segment. The remaining visual gaps still include exact maze silhouette, title overlap, final material relief, full button composition, and exact legacy player sprite treatment.

## Next Slice

The preferred next bounded slice is no longer more broad menu polish by default.

Use the current clarified priority:

```text
legacy active-play mobile input and feel review packet
```

Target the active-play owner chain and keep visual work bounded to crisp mobile readability rather than fake-3D exactness.
