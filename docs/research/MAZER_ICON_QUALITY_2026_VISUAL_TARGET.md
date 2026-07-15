# Mazer Icon-Quality 2026 Visual Target

Status: canonical target contract v1

Runtime material: `mazer-cyber-arcade-material-v1`

Contract owner: `src/brand/mazerIconQualityTarget.ts`

## Authority

The approved Mazer app icon is the visual north star for shared game, browser, install, future link, and account-facing surfaces. The raw source remains source-linked in ATLAS rather than copied into more repositories:

- `data/atlas/brand/mazer/mazer-app-icon-2026-07-09-source.png`
- `data/atlas/ui-visual-proof/mazer/app-icon-2026-07-09/reference.png`

Both source references were read back on 2026-07-14 with SHA-256 `55677db4dff3896979d3e00e1b9ebcb85fd9fc04f106d5a67701cee61ea467d1`. They are durable future references for Link Me, Stripe, auth, and other separately admitted product surfaces; this Mazer packet does not mutate them.

The canonical shipped target is `public/icons/mazer-app-icon.png`, a 1024x1024 derived binary with SHA-256 `91764e546b8c1488b3d48baeda927ae18600b088178e190244fb9d8ce35e2440`. Its versioned lineage and every browser/PWA delivery binary are declared in `MAZER_ICON_QUALITY_TARGET` and pinned by focused tests.

## Visual language

Runtime surfaces translate the icon rather than reproducing it literally:

- deep navy is the substrate, never flat gray or muddy black;
- hard cyan and mint rails establish maze, frame, title, and control hierarchy;
- the player and traveled path remain a fixed green signal with sparse white shine;
- goal and direction signals remain red; start remains yellow;
- violet and warm warning colors are bounded accents, not ambient wash;
- glow may reinforce a signal but must not soften tile edges, text, or one-pixel rails;
- shared fills use integer logical pixels, odd-width strokes use half-pixel centers, and the backing store remains DPR-aware up to 2x.

The executable color and geometry authority is `src/render/cyberArcadeMaterial.ts`. It imports the canonical icon path from the brand contract, publishes the icon target version and SHA in runtime diagnostics, and remains the only shared runtime palette owner.

## Delivery surfaces

- Browser favicon: `public/icons/mazer-app-icon.ico`.
- Browser PNG favicons: `public/icons/icon-192.png`, `public/icons/icon-512.png`.
- Apple touch: `public/icons/apple-touch-icon.png`.
- Standard PWA: 192px and 512px PNG assets.
- Maskable PWA: 192px and 512px maskable declarations.
- Canonical high-resolution manifest asset: `public/icons/mazer-app-icon.png`.
- Windows shortcut: `scripts/windows/Prepare-MazerShortcut.ps1` consumes the ICO asset.

`index.html`, `public/manifest.webmanifest`, and `vite.config.ts` remain the delivery owners. `tests/brand/mazer-icon-quality-target.test.ts` verifies their relationship to the versioned contract without reading machine-specific ATLAS paths during normal repo verification.

## Proof policy

Completion requires all of the following:

1. Repository binaries match the contract's dimensions and SHA-256 values.
2. Browser, Apple touch, PWA, maskable, manifest, and Windows shortcut wiring remain exact.
3. The cyber-arcade material diagnostic reports the target version, canonical path, and canonical SHA.
4. Actual current-main menu and play captures show the icon-derived hierarchy on phone and desktop widths with clean console/page diagnostics.
5. The protected `tests/ai/demo-walker.test.ts` remains outside the packet.

Changing the approved artwork or any pinned binary requires a separately reviewed target-version bump, regenerated delivery assets, updated hashes, and fresh route-aware proof. A routine material or layout packet must not silently replace the icon target.
