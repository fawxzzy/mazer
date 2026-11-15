# Reaching levels 60, 100 and 190 for checks (MAZER-QA-011)

Two supported routes already exist. Neither is a player shortcut: both are sandboxed and neither reads or writes a real account.

| Route | Use for | Guard |
| --- | --- | --- |
| `?previewLevel=N` (see `docs/ui/MAZER-LEVEL-PREVIEW-2026-11-09.md`) | looking at a level by hand in a browser, screenshots, the pause-sheet jump list (60, 100, 190 are checkpoints) | in-memory storage and the QA auth fixture identity, so no account call can fire. On `mazer.fawxzzy.com` a plain browser tab is stopped by the install gate (`offline-shell-proof` row `route-level-preview`); only localhost, 127.0.0.1 and `::1` lift it. |
| `node scripts/visual/phone-emulation-sweep.mjs --only levels --levels 60,100,190` | repeatable headless checks: each level loads, no console errors, a solvable route exists, screenshot written | seeds `mazer.progression.v1` for the QA fixture user inside a throwaway Playwright context against a dev or preview server; never touches production storage |

`--levels` takes a comma list of whole numbers 1-999 (default 60,100,190); anything else throws, so a typo cannot silently check nothing.

Example (dev server on another port):

```
npm run dev -- --host 127.0.0.1 --port 5193 --strictPort
node scripts/visual/phone-emulation-sweep.mjs --base-url http://127.0.0.1:5193 --out tmp/levels --only levels --levels 60,100,190 --assert
```

Overlap with QA-007 (the preview jump list): that card owns the in-app checkpoint list; this card adds no new route and no in-app UI. Correction to `MAZER-QA-009-HEADLESS-PHONE-SWEEP-2026-11-14.md`: levels 60/100/190 are reachable headlessly (the sweep did it); only playing them on a phone still needs a device.

Not covered: real-phone feel. Nothing here was run on a device.
