# Mazer UI Rework Platform Profiles

## Status

Wave 1A registers the seven output profiles from the authoritative handoff. Profiles are deployment/runtime capability contracts, not public themes and not user-authored brand choices. This source-only lane does not activate profile routing.

## Registered profiles

| Profile | Auth | Sync | Input | Chrome |
| --- | --- | --- | --- | --- |
| web | yes | yes | keyboard, pointer, touch | full |
| mobile | yes | yes | touch, keyboard | compact |
| desktop | yes | yes | keyboard, pointer | full |
| tv | configurable | optional | controller, remote | distance |
| obs | no | optional | external | minimal |
| arcade | no | optional | hardware | kiosk |
| cyberdeck | optional | optional | hardware, touch, keyboard | configurable |

`docs/contracts/mazer-ui-rework-platform-profiles.v1.json` is the packet-exact registry. `src/state/uiProfiles.ts` independently mirrors it as frozen typed values, and `scripts/check-ui-platform-profiles.mjs` plus its architecture tests fail on missing, extra, reordered, or capability-drifted profiles.

## Boundaries

- Profile capability is not an Auth, provider, entitlement, or environment mutation.
- Profile chrome does not alter the canonical Precision Arcade theme.
- No DOM, Phaser, `MenuScene`, route, viewport, or deployment code imports this module yet.
- Runtime selection and responsive composition remain later waves.

## Fitness pattern intake

- `ADOPT` safe-default responsive intent as a profile-level distinction only; layout proof remains with the future viewport solver.
- `ADAPT` safe-area/dynamic viewport and persistent-control lessons into future layout contracts, not this capability registry.
- `ADOPT` capability-not-promise semantics: false/optional/configurable remain distinct rather than flattened to a truthy UI promise.
- `NOT_APPLICABLE` served-build provenance in this source contract; production proof remains a release concern.
