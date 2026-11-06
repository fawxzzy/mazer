# AI run seed pack baseline: mazer-ai-seed-wrap-anomaly v1.0.0

- Pack hash: `sha256:fff6da86ebfc73b45d6ffadbe599b2e6b5b7516ff04b802bc1929b990f56405c`
- Result digest: `sha256:f2a385dc16a4dcfbd3752d635e7cbd6793127fc9a639fbcb02c27293d1d33fab`
- Purpose: wrap-anomaly; runner contract: `menu-demo-advance-walker-v1`
- AI scorer: `mazer.maze-cycle-ai-decision-pressure@1.0.0`; run-quality scorer: `mazer.maze-cycle-run-quality@1.1.0` (playable-wrap-aware-shortest-path-v1)
- Cases: 24; reached goal: 24; reset used: 0; wrapped mazes: 24; path shorter than benchmark: 0
- Data policy: fixtures and generated mazes only; no account data, database, or progression state touched.

| target | band | scale | cases | goal | reset | wrapped | complexity (med) | run quality (med/min) | AI pressure (med) | overrun ratio (med) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| wrap-explorer-both-axes | explorer | 43 | 8 | 8 | 0 | 8 | 183 | 100/100 | 0 | 0 |
| wrap-navigator-heavy-feeders | navigator | 55 | 8 | 8 | 0 | 8 | 251.5 | 100/100 | 0 | 0 |
| wrap-navigator-portrait | navigator | 55 | 8 | 8 | 0 | 8 | 248 | 100/100 | 0 | 0 |

Generation parameters are carried explicitly per target in the pack and this report (not derived from level or band), so a later generation change shows up as a changed result digest for an unchanged pack hash.

