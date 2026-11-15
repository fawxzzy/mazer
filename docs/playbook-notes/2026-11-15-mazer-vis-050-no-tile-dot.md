# 2026-11-15 MAZER-VIS-050 chip tiles lose the centre dot

- WHAT changed: the baked Chip floor (`paintChipFloor`, `src/render/boardTileBake.ts`) no longer paints pass 4 (one faint pad dot per floor tile). `BOARD_TILE_BAKE_VERSION` is `mazer-board-tile-bake-v3`. Trace style, wall sockets, markers and trail are unchanged.
- WHY it changed: owner request, the dot in every tile centre is unwanted.
- Rule: a bake pixel change bumps the bake version so no cached bake survives.
- Evidence: headless Chromium 390x844 DPR3 and WebKit iPhone 15 Pro, settled `?previewLevel=7`: no dots. tsc, full npm test, playbook:verify pass. Not checked on a real phone.
- Status: item 1 of the card (thin white line before the reveal) NOT changed: no separate draw found; only candidate is the 1px rim of first low-alpha reveal cells showing before their dark fill (`composeBoardTileRevealSoft`). Needs owner confirmation.
