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
- Browser navigation to the preview route redirects to Vercel login, so the deployed-browser pass is still held by Vercel Authentication rather than by a build, deploy, or runtime failure.

Current hosted state: `deployed-but-manual-auth-held`.

Blocker: the deployed preview is protected by Vercel Authentication and requires an authenticated browser session before app-level hosted proof can be completed.

Unblocker: sign in to Vercel in the intended browser context or temporarily provide an authorized share/access flow that reaches app HTML, then rerun the hosted browser pass against the deployed preview.

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
