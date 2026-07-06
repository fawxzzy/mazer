# Mazer Hosted Preview Proof

This runbook separates local proof health from the remaining hosted/manual closure gate.

## Rule

- Browser-heavy proof runs are serial-only for the closure lane.
- Do not run the matrix capture and the Edge live lanes in parallel for canonical proof.
- A hosted-preview hold is a manual gate until the deployed preview is opened and checked in the intended browser context.
- Treat a hosted/manual hold as a release-status note, not as evidence that the product lane is broken.

## Canonical Local Proof Order

Run these in order from the repo root:

1. `npm run visual:matrix -- --preset core --skip-build true`
2. `npm run edge:live -- --skip-build true --headless true --run core-only-watch`
3. `npm run edge:live -- --skip-build true --headless true --run core-only-play`
4. `npm run verify`

If one step fails, stop and receipt that failure before moving to the hosted lane.

## Hosted Preview Closure

Run the hosted deploy path from [`_stack`](../../../_stack/README.md):

1. `pnpm run mazer:deploy:preflight`
2. `pnpm run mazer:deploy:preview`
3. Open the deployed preview in the intended browser context.
4. Complete the manual interactive pass and record the outcome.

The hosted step is not closed by local green receipts alone. It closes only after the deployed preview has a successful browser pass in the required manual or authenticated context.

## Latest Status

2026-07-05 local / 2026-07-06 UTC hosted browser recheck:

- The in-app browser refresh of the original protected Vercel login URL still stayed on `https://vercel.com/login?...`; the external browser login did not transfer into the Codex in-app browser profile.
- Vercel connector access generated an authorized share URL for the deployed preview route:
  `https://fawxzzy-mazer-2fi0qbdkf-fawxzzy.vercel.app/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&v=hosted-preview-proof&_vercel_share=LUNrDGWTwKmc4zw2N236Ato085Dc8lQg`
- The authorized share URL reached the app route and normalized to:
  `https://fawxzzy-mazer-2fi0qbdkf-fawxzzy.vercel.app/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&v=hosted-preview-proof`.
- Browser title was `Mazer`; document state was `complete`.
- Render proof showed one full-viewport Phaser canvas at mobile dimensions `405x958`, with active-play maze, timer, player marker, and touch controls visible.
- Current-page app log proof showed Phaser `v3.90.0 (WebGL | Web Audio)` startup from the Mazer asset bundle.
- Captured errors were Vercel login FedCM errors from the earlier protected-login page, not from the Mazer app URL.

Current hosted state: `hosted-preview-app-loaded-via-authorized-share`.

Remaining hosted limitation: the protected preview still does not become reachable by simply refreshing the Vercel login URL inside Codex. Browser proof currently requires either the Vercel connector share/access flow or a Vercel-authenticated in-app browser session.

2026-07-04 status after mechanics/mobile cleanup reached `main`:

- Local repo proof is healthy on `main` at `f96829fa`.
- `main` still cannot be used directly for the deploy-identity gate because the latest GitHub squash commit author is not the owner identity required by the Mazer Vercel lane.
- A disposable deploy-proof branch, `codex/mazer-hosted-preview-proof`, was used with an owner-authored commit over the same runtime tree to avoid rewriting merged `main` history.
- Workspace-local Vercel linking is now established at `.vercel/project.json` for team `team_CMJn7MvzFZZBnhNnjVUZF2RD` and project `prj_t3zothbtj9DExrh3FjMsH98hwwSZ` (`fawxzzy/fawxzzy-mazer`).
- `_stack` Mazer deploy preflight passed on the deploy-proof branch after linking.
- The direct non-interactive deploy command `vercel.cmd --cwd <mazer repo> deploy --yes` succeeded.
- Vercel reports deployment `dpl_4jfbnZby1pHpUDZNRMc6jBMCFtrb` as `READY`.
- Preview URL: `https://fawxzzy-mazer-2fi0qbdkf-fawxzzy.vercel.app`.
- Deployment metadata points at `codex/mazer-hosted-preview-proof` commit `ccfbcf9a17e815a9149f929d5216aebef15b6a75`.
- Direct browser navigation to the preview route redirected to Vercel login until an authorized share/access flow was used.

## Stop Rule

- Local proof green means the repo-owned runtime and proof surfaces are healthy.
- Hosted-preview closure stays held until the browser pass on the deployed preview succeeds.
- If local proof is green and hosted proof is still pending, describe the lane as `healthy-but-held`.

## Receipt Minimums

Record these with the hosted pass:

- deploy command used
- deployed preview URL
- browser and mode used for the hosted pass
- whether a manual or authenticated step was required
- pass/fail result and any blocker classification
