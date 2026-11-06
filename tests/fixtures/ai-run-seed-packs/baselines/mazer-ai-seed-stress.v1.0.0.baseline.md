# AI run seed pack baseline: mazer-ai-seed-stress v1.0.0

- Pack hash: `sha256:70bae411f671ae4780ccbcf0c17fd52d24931a9248e438c1caf6316777f1f368`
- Result digest: `sha256:41ac9201267fdc0a134fbab341306466598faef33d6ce9ec86aa4c9d06f9f9b7`
- Purpose: stress; runner contract: `menu-demo-advance-walker-v1`
- AI scorer: `mazer.maze-cycle-ai-decision-pressure@1.0.0`; run-quality scorer: `mazer.maze-cycle-run-quality@1.1.0` (playable-wrap-aware-shortest-path-v1)
- Cases: 15; reached goal: 15; reset used: 0; wrapped mazes: 15; path shorter than benchmark: 0
- Data policy: fixtures and generated mazes only; no account data, database, or progression state touched.

| target | band | scale | cases | goal | reset | wrapped | complexity (med) | run quality (med/min) | AI pressure (med) | overrun ratio (med) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| architect-t280 | architect | 71 | 3 | 3 | 0 | 3 | 297 | 100/100 | 0 | 0 |
| mythic-t400 | mythic | 96 | 3 | 3 | 0 | 3 | 400 | 100/100 | 0 | 0 |
| mythic-t400-weak-ai | mythic | 96 | 3 | 3 | 0 | 3 | 400 | 100/100 | 0 | 0 |
| explorer-t96-weak-ai-long-tail | explorer | 43 | 6 | 6 | 0 | 6 | 167 | 93.5/92 | 9.313 | 0.169 |

Generation parameters are carried explicitly per target in the pack and this report (not derived from level or band), so a later generation change shows up as a changed result digest for an unchanged pack hash.

