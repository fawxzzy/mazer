# Codex Visual Evidence Prompt

Use this template for a new visual lane.

```text
You are working on {{repo_name}}.

Goal
Build a repeatable visual evidence lane for {{feature_or_surface}}.

Rules
- Use screenshots as the primary agent input.
- Use video only when motion, camera movement, rotation, or animation must be reviewed.
- Capture only from {{preview_host_or_staging_host}}.
- Use only resettable temp users or test fixtures.
- Do not capture from production accounts or production sessions.
- Keep disposable artifacts in tmp/ and commit only durable pointers, docs, and indexes.

Evidence packet
Each packet should include:
- before.png
- after.png
- focus.png
- contact-sheet.png
- metadata.json
- REPORT.md
- run.webm for motion scenarios
- score.json
- diff-summary.json
- baseline.json
- keyframes/

Workflow
1. Capture a latest packet set.
2. Compare the latest run to baseline.
3. Review the ranked regressions and the failed gates.
4. Promote the run to baseline only after it passes.

Acceptance Criteria
- [packet-completeness] The final lane produces the declared packet artifacts needed for the target surface.
- [baseline-discipline] Baseline promotion remains explicit and only happens after the contract passes.
- [bounded-capture] Captures stay on preview or staging only and use disposable fixtures or temp users.
- [durable-proof] Durable docs or indexes point to the approved packet path without treating summary text as proof.

Expected Changed Paths
- Declare only the repo-relative visual-lane code, docs, fixture, and durable pointer paths the final diff actually needs.

Expected Unchanged Paths
- Any repo path outside the declared visual-lane surfaces.
- Raw packet artifacts under `tmp/` unless the lane explicitly promotes a durable pointer or index.

Blocked / Skipped Reporting Rules
- Mutating Codex tasks are not governed unless they declare explicit acceptance criteria.
- Summary text is not proof. Do not claim the lane passed unless the packet artifacts, visual comparison, and final diff prove each satisfied criterion.
- If any expected unchanged path must change or any criterion cannot be completed, report it as blocked, skipped, or failed with the exact reason.

Output
Return the packet path, the comparison result, the baseline pointer, and the top regressions by scenario and viewport.
```

Example: Mazer

```text
Repo: fawxzzy-mazer
Surface: isolated visual-proof lane
Host: preview only
Auth: none
Use the visual packet as proof of player readability, shell legibility, and orientation recovery.
```

Example: Auth app

```text
Repo: {{auth_app_repo}}
Surface: authenticated preview flow
Host: preview or staging only
Auth: resettable temp user only
Never use a production account or a real user session.
Use the packet to prove the login and post-login flow without depending on live data.
```
