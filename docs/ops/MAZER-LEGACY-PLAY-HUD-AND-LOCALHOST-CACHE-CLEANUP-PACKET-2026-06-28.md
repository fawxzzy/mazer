# Mazer Legacy Play HUD And Localhost Cache Cleanup Packet

Date: 2026-06-28
Lane: legacy Unreal truth -> web app reset/port
Mode: owner-repo only
Branch: `codex/legacy-web-port-truth`

## Intent

Tighten two connected play-lane issues:

- remove a non-legacy active-play help strip from the HUD
- make localhost/browser proof truthful again by unregistering stale Mazer service workers before boot

This packet stayed inside the canonical Mazer web app and did not open deployment or infrastructure work.

## Landed work

- removed the productized footer help text from active play in `src/scenes/MenuScene.ts`
- added a reset-lane guard so the active-play HUD stays limited to the timer + goal arrow contract
- implemented localhost Mazer service-worker cleanup in `src/boot/main.ts`
- added a boot guard that requests one reload after unregistering stale localhost service workers/caches
- added reset-lane source guards in `tests/reset/legacy-reset.test.ts`

## Why this packet mattered

Live right-pane browser verification showed a truthful mismatch:

- repo code no longer wanted the footer help text
- but the localhost app was still rendering it after reload

That indicated stale localhost state rather than current runtime truth. After the localhost cleanup landed, the in-app browser stopped serving the stale footer and matched the current repo code again.

## Verification

Commands run:

- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`

Live browser checks performed:

- reload live localhost tab
- enter play mode from the menu
- confirm the footer help strip no longer renders
- open pause overlay and confirm no new runtime error surfaced

Latest visual matrix artifact:

- `tmp/captures/mazer-layout-matrix/2026-06-29T02-40-14-668Z`

## Truth after this packet

- active-play HUD is closer to the legacy contract
- localhost development/browser verification is less likely to lie through stale service-worker state
- the right-pane app now reflects current repo truth after reload
- no deploy was attempted
- no Supabase surface was created
- no Vercel surface was created
- no duplicate Mazer identity was introduced

## Still open

- exact demo AI parity
- exact generation/reset-flow parity
- exact play HUD parity beyond this cleanup
- final screenshot-grade visual parity

