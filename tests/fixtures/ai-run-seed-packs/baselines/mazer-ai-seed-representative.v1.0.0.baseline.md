# AI run seed pack baseline: mazer-ai-seed-representative v1.0.0

- Pack hash: `sha256:0d6e8708fc36c5959ffb7e1a7e218a6a92930fd31520eb1c124f7764a01eb14b`
- Result digest: `sha256:1c0394f9b50b9b802a43351d848aa774636179cf9facba111fdb61c02952fa03`
- Purpose: representative; runner contract: `menu-demo-advance-walker-v1`
- AI scorer: `mazer.maze-cycle-ai-decision-pressure@1.0.0`; run-quality scorer: `mazer.maze-cycle-run-quality@1.1.0` (playable-wrap-aware-shortest-path-v1)
- Cases: 36; reached goal: 36; reset used: 0; wrapped mazes: 18; path shorter than benchmark: 0
- Data policy: fixtures and generated mazes only; no account data, database, or progression state touched.

| target | band | scale | cases | goal | reset | wrapped | complexity (med) | run quality (med/min) | AI pressure (med) | overrun ratio (med) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| tutorial-t8 | tutorial | 29 | 6 | 6 | 0 | 0 | 33.5 | 100/100 | 0 | 0 |
| starter-early-t16 | starter | 30 | 6 | 6 | 0 | 0 | 36 | 100/100 | 0 | 0 |
| starter-mid-t32 | starter | 32 | 6 | 6 | 0 | 0 | 52 | 100/100 | 0 | 0 |
| starter-late-t64 | starter | 35 | 6 | 6 | 0 | 6 | 101 | 100/100 | 0 | 0 |
| explorer-t96 | explorer | 43 | 6 | 6 | 0 | 6 | 177 | 100/100 | 0 | 0 |
| navigator-t160 | navigator | 55 | 6 | 6 | 0 | 6 | 240.5 | 100/100 | 0 | 0 |

Generation parameters are carried explicitly per target in the pack and this report (not derived from level or band), so a later generation change shows up as a changed result digest for an unchanged pack hash.

