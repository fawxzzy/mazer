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
| `npm run verify:local` | Run the repo-local Playbook activation gate: verification report, adoption evidence, and the canonical Mazer verify bridge. |

## Visual proof

| Script | What |
| --- | --- |
| `npm run visual:capture` | Capture a repo-owned visual proof packet. |
| `npm run visual:matrix` | Capture the shipping layout matrix. |
| `npm run visual:matrix:recovery` | Capture the recovery-design layout matrix without changing the shipping default proof route. |
| `npm run edge:live:recovery:watch` | Capture the recovery-design watch shell through the repo-owned Edge harness. |
| `npm run edge:live:recovery:play` | Capture the recovery-design play shell through the repo-owned Edge harness. |
| `npm run visual:gate` | Evaluate the latest visual proof gate outputs. |
