# Mazer Web V1 and Cyberdeck Canonical Deep Research

Status: canonical planning input, not an implementation packet.

This document records the merged deep-research decisions supplied for the
Mazer Web V1 and Cyberdeck horizon. Source, provider, deployment, and board
state still require an admitted packet and exact verification.

## Provenance

- Imported research artifact: `Mazer Web V1 and Cyberdeck Canonical Deep Research Packet`
- Source digest (SHA-256): `A432C0EFE11844151C7B28A9489F981542602A35AD6FB1536345CB893BC5006E`
- Imported: 2026-07-27
- Canonical architecture synthesis: `docs/MAZER-MULTI-TARGET-DEPLOYMENT-ARCHITECTURE.md`

## Product sequence

1. Finish and release Mazer Web V1.
2. Pass a local, offline-capable portability gate.
3. Admit Cyberdeck implementation as a separate execution lane.

Web V1 remains the active product. Cyberdeck planning must not displace the
current UI, controls, account, release, or shared-platform gates.

The bounded Web V1 planning budget is one single-player mode, three enemy
archetypes, four item types, one earned currency, and twelve earned cosmetics.
The planned one-time USD $5 entitlement is tied to immutable shared user
identity, never to a mutable email string. These are product contracts only;
they do not authorize payment, provider, database, or production changes.

## One codebase, multiple profiles

Keep one Mazer source repository. Build profiles and adapters rather than a
Cyberdeck fork:

- Web: authenticated account, cloud-backed features, browser/PWA runtime.
- Cyberdeck: local identity, local durable saves, offline core play, no account
  or recovery UI.
- Development: configurable fixtures and local persistence.
- Future arcade: operator/session profile, local persistence, and service mode.

Shared domain rules cover movement, progression, scoring, rank, achievements,
levels, run quality, and reset semantics. Platform-specific identity,
persistence, navigation, input, telemetry, and runtime behavior belong behind
explicit contracts.

## Responsive proof contract

Responsive equivalence means the same hierarchy, capability, readability,
input reliability, safe-area behavior, and gameplay semantics. It does not
require identical pixels.

Release proof combines fresh-load desktop/tablet/phone matrices,
breakpoint-minus-one/plus-one and continuum sweeps, live resize/maximize/
orientation/overlay/scroll/keyboard transitions, and physical mobile browser
plus installed-PWA checks. The keyboard case is mandatory because layout and
visual viewports can diverge while the on-screen keyboard is open.

## Input and Cyberdeck runtime

Gameplay consumes normalized semantic input, not browser events, GPIO pins, or
controller-specific keycodes. Preserve independent directional state before
diagonal, turn, dead-zone, repeat, or smart-steering policy resolves it.

The logical Controller Bus is staged:

1. descriptor/report/mapping contract;
2. standard USB HID and arcade encoders;
3. Pico 2/RP2350 retro or custom adapters;
4. magnetic/pogo transport research;
5. custom controller/base PCBs.

Cyberdeck V1 is a dedicated appliance on a Linux base: boot directly into
Mazer, hide desktop/browser chrome, use a local identity and save, recover
after crashes, expose operator health/version, and install versioned artifacts
atomically with health checks and rollback. Do not synchronize a development
repository onto the device.

## Staged hardware gates

- Reusable tools and bench measurement first.
- Raspberry Pi 5 bench proof before a portable enclosure.
- Wired portable proof before battery or dock decisions.
- Measured thermal, peripheral-current, and power behavior before custom
  carrier boards, battery systems, or magnetic connectors.
- Commercial arcade and multi-game work remain future research.

## Current dependencies and holds

- The Fitness-derived Mazer Auth capability-parity implementation is already
  captured in PR #83 and remains held by shared-Auth convergence. Do not
  duplicate it or silently merge it into production.
- PWA/installability is an independent web lane and may progress without
  Supabase/Auth schema or provider mutation.
- Progression persistence, reset commands, entitlements, and Cyberdeck local
  identity require separately admitted contracts.

## Canonical rule

Atlas absorbs this research as durable planning context. A future
implementation packet must name its owner, base, exact files, dependencies,
proof, rollback, provider impact, and lifecycle destination before source
mutation.
