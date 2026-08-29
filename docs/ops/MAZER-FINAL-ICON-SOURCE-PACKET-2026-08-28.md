# Mazer Final Icon Source Packet — 2026-08-28

## Scope and identity

- Owner: `owner.mazer`
- Source-only writer: `repo.mazer.final-icon-source`
- Immutable parent: `f49f7c8ae8a09e290fe0c7fd032443ed335fd498`
- Parent tree: `59a6db0741c0036ddabfca6d182e90f6b672f7f9`
- Canonical master: `src/brand/source-art/mazer-app-icon-master.png`
- Master identity: 1024x1024, 1,173,366 bytes, SHA-256 `ede90e596682795d10f97bed615071ca1f60e08e290eacf1ea143006df914d78`
- Generator: `scripts/brand/generate-mazer-icons.mjs`
- Cache contract: `mazer-final-icon-v2`

The canonical checkout and the paused preview-video lane are outside this packet. Downloads are input provenance only and never a runtime dependency. This packet authorizes no merge, deployment, production alias, provider, Auth/live-data, DNS, billing, credential, deletion, or retention effect.

## Precedent and decision

Question: Have we already solved this?

Answer: partially. Mazer already had a versioned TypeScript icon target and wired delivery surfaces, so that structure is reused. It did not have a repository-owned source master or deterministic generator, standard and maskable assets were byte-identical, and watch-pass pages still consumed the superseded emblem. The coherent correction is one locked master plus one deterministic derivative fan-out.

## Consumer inventory

| Surface | Consumer | Result |
| --- | --- | --- |
| Browser | `index.html`, implicit `/favicon.ico` | canonical ICO plus versioned PNG favicons |
| Social metadata | existing Open Graph and Twitter tags | intentional canonical 1024 consumer retained |
| Watch pass | preview and paywall HTML | legacy emblem replaced with canonical favicon and Apple asset |
| Install metadata | `public/manifest.webmanifest` | standard, maskable, shortcut, and 1024 assets |
| Apple touch | `index.html` | canonical 180 derivative |
| Offline cache | Vite PWA / Workbox | all active derivatives explicitly included; `v` query maps to revisioned precache |
| Windows shortcut | `scripts/windows/Prepare-MazerShortcut.ps1` | deterministic multi-size ICO |
| Runtime diagnostics | icon-quality target and cyber-arcade material | canonical path, source identity, and target version |

No native wrapper or asset catalog exists. `public/icons/mazer-emblem.svg` and `.ico` are preserved as superseded, non-authoritative evidence because deletion and retention changes are outside scope.

## Derivative identities

| Asset | SHA-256 |
| --- | --- |
| `public/favicon.ico` | `050a42199c7762f21508df8d53d3cd40eaa8086543de448f3e0b3bc7ae1e43fc` |
| `public/icons/mazer-app-icon.ico` | `050a42199c7762f21508df8d53d3cd40eaa8086543de448f3e0b3bc7ae1e43fc` |
| `public/icons/mazer-app-icon.png` | `ede90e596682795d10f97bed615071ca1f60e08e290eacf1ea143006df914d78` |
| `public/icons/apple-touch-icon.png` | `337c61c2b6fd2c1dd6c2e67e92b5b596137e456e88605afc2edc510c66fc3395` |
| `public/icons/icon-192.png` | `f7195a659b978ffb790202925a038b991194f69882dda99ebffb7f4b7b6e5279` |
| `public/icons/icon-512.png` | `50461c1f1b370f45f20492149ba3480c07be1d68abcfabe1050e064710f0d0c9` |
| `public/icons/icon-192-maskable.png` | `1c134cc6ec2f8656f8af4d4e351ba65b491fed60ebbb2609c8ccf7bb56b78b80` |
| `public/icons/icon-512-maskable.png` | `c28062ea9de69856558be5cf499cc616fb1e90177df0ba966d90101ec9a8d102` |

## Fitness pattern intake

- Install capability, not install promise: ADOPT. Metadata and build artifacts are proven locally; no production-install claim is made.
- Served-build provenance: ADOPT. Cache version and route/resource proof bind the delivered icon identities.
- Accessible motion/preferences, safe-area layout, one-overlay architecture, and versioned user state: NOT_APPLICABLE. This packet changes static icon assets and metadata only.

## Acceptance, rollback, and reusable learning

Generation must pass twice from clean output roots with byte-identical relative-path hashes. Focused icon/manifest/service-worker tests, typecheck, build, full verify, stale-reference classification, route-aware visual/resource proof, and independent exact-head review must pass before source review is terminal.

Rollback is one source revert of this complete packet. Partial rollback is invalid because master, derivatives, metadata, cache matching, contracts, and tests are one coupled identity.

Rule: one exact repository master is the only icon design authority.

Pattern: fan out deterministic minimum derivatives, hash every result, and test every real consumer.

Failure Mode: manually copied derivatives drift; byte-identical standard and maskable files expose edge artwork to destructive platform crops.
