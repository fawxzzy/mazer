# 2026-11-28 - Mazer: first-time cards on by default in the browser build (?lab=off per-load kill switch)

- WHAT changed: `FIRST_TIME_CARDS_BUILD_DEFAULT` is now true, so first-time cards (Move/Wrap/Switch/Shard/Pulse Gate/trail/L1 goal, Guide "New" pills, "All tips"/"Show tips again") show for everyone. With no `window` (node tests) the default stays off. `?lab=off` turns the system off for that load only. Hazards/shards stay behind `?lab=hazards`.
- WHY it changed: Zac 2026-11-28 "do everything you recommend, get it deployed and finished"; slices 1-9 were merged and live but flag-off.
- Rule: a build-default flip is its own deploy, separate from the feature merges, with a one-line rollback (alias to the previous build).
- Evidence: tsc clean; vitest full run 7098 pass, 3 fail + 2 suites that are node:test files and need the missing local playbook worktree (ENOENT playbook.contract.example.v1.json), same on any checkout without it; phone-shot chromium + webkit of `?previewLevel=1` shows the neon "New / Move" card with Got it; headless only.
- Status: source only
