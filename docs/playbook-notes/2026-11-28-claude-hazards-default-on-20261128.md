# 2026-11-28 - Mazer: hazard/shard layer on by default in the browser build (?lab=off per-load kill switch)

- WHAT changed: `HAZARD_LAYER_BUILD_DEFAULT` is now true, so the shard layer (shard chip, locked end star from L100, Pulse Gate, Switch, hazard schedule from manifest v2) is on for everyone in the browser build. With no `window` (node tests) it stays off. `?lab=off` forces it off for that load and clears the remembered lab switch; the build default re-applies on the next load. `legacyHazardHandoff.ts` stays a dormant historical record (literal false, imported by no runtime module). Manifest v1/v2 `flag.buildDefaultEnabled` and their schemas now say true.
- WHY it changed: Zac 2026-11-28 "turn this shit on, why is it turned off" and "dont wait for the phone check for this one".
- Known risks carried (not fixed here): L340/345/400 multi-shard placement fails (the run fails open: that level ships without shards, never a locked star); shard-placement sweep not rerun under manifest v2; desktop 45x27 solvability seed missing; L120 Switch and everything on a real phone unverified.
- Rule: a build-default flip is its own deploy with a one-line rollback (alias to the previous build).
- Evidence: tsc clean; full vitest 7098 pass, 3 fail in 3 files that need the missing local playbook worktree (same as the first-time flip); phone-shot chromium + webkit of `?previewLevel=120` and `?previewLevel=150` with no lab params show the shard chip "0/1" at L150 and the normal maze at L120; headless only.
- Status: source only
