# Command Glossary

Quickly list all available scripts:

```bash
npm run
```

## App lifecycle

| Script | What |
| --- | --- |
| `npm run dev` | Run the local Vite development server. |
| `npm run build` | Run the TypeScript check and produce the production bundle. |
| `npm run preview` | Serve the production bundle locally on port `4173`. |

## Validation

| Script | What |
| --- | --- |
| `npm run architecture:check` | Validate the explicit scene and architecture wiring rules. |
| `npm run lint` | Run the TypeScript no-emit check. |
| `npm run test` | Run the repo-local reset-lane and demo-walker proof tests, excluding the dedicated maze soak lane. |
| `npm run test:soak` | Run the isolated maze soak test lane. |
| `npm run test:playbook-adoption` | Validate the repo-local Playbook adoption export against the repo schema and owner contract ids. |
| `npm run test:playbook-verification` | Validate the repo-local Playbook verification report against the ATLAS root schema and live command surface. |
| `npm run verify` | Run the repo-local reset-lane proof tests plus the production build path used for the current legacy reset/port lane. |
| `npm run verify:fast` | Run the impacted TypeScript/test slice for iteration work. It selects tests from changed files and does not run the production build unless `-- --build` is passed. |
| `npm run verify:fast:tests` | Run the same impacted test slice as `verify:fast`, but skip TypeScript. Use only after a TypeScript pass already succeeded in the same edit cluster. |
| `npm run verify:fast -- --list` | Print the selected changed files, proof reasons, tests, lint decision, and build decision without running the checks. |
| `npm run verify:fast -- --only=tests/reset/legacy-marker.test.ts --skip-lint` | Run a specific narrow proof packet when the touched surface is known and TypeScript was already checked. |
| `npm run verify:fast:all` | Run the full reset-lane test spine without the production build. Use this before `npm run verify` when narrowing failures. |
| `npm run verify:local` | Run the repo-local Playbook activation gate: verification report, adoption evidence, and the canonical Mazer verify bridge. |

Fast iteration rule:

- Use `npm run verify:fast` while editing a bounded module.
- Use `npm run verify:fast:tests -- --only=<test-file>` for same-cluster reruns after `npm run verify:fast` has already passed TypeScript.
- Use `npm run verify:fast -- --list` before broad proof work to confirm the selected test slice is the intended one.
- Use `npm run verify` for closure, release, prod push, marker ratchet, or any change that needs production bundle proof.

## AI calibration

| Script | What |
| --- | --- |
| `npm run ai:calibrate` | Run the configurable AI calibration harness. |
| `npm run ai:calibrate:fast` | Run a small single-scale, five-seed AI calibration smoke for iteration. |
| `npm run ai:calibrate:biases` | Run the full configured AI bias sweep. |
| `npm run ai:calibrate:ranks` | Run the full configured AI rank sweep. |
| `npm run ai:calibrate:ranks:fast` | Run a small single-scale, five-seed AI rank sweep before spending time on the full rank sweep. |

## Visual proof

| Script | What |
| --- | --- |
| `npm run visual:capture` | Capture a repo-owned visual proof packet. |
| `npm run visual:matrix` | Capture the shipping layout matrix. |
| `npm run visual:matrix:recovery` | Capture the recovery-design layout matrix without changing the shipping default proof route. |
| `npm run edge:live:recovery:watch` | Capture the recovery-design watch shell through the repo-owned Edge harness. |
| `npm run edge:live:recovery:play` | Capture the recovery-design play shell through the repo-owned Edge harness. |
| `npm run visual:gate` | Evaluate the latest visual proof gate outputs. |
