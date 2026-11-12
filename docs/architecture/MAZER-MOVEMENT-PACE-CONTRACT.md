# Mazer Movement Pace Contract

## Status

`legacy-movement-pace-v2` is the active timing formula for held keyboard, touch-arrow, and stick movement. It converts the persisted Move Speed preference into one effective movement profile before any input adapter schedules repeats or turn delays.

## Authority

- The persisted Move Speed value is the player's only speed input. It is never rewritten by progression.
- Level and pace never change the speed. (v1 added up to `+0.10` for level and `+-0.05` for pace after the first completed cycle; owner request 2026-11-12 removed both so the step rate is constant.)
- Owner request 2026-11-12: the player is 8% slower overall. `LEGACY_MOVEMENT_STEP_RATE_FACTOR = 0.92` is applied once: repeat interval, hold-start delay and the touch-stick caps are divided by `0.92` and rounded to whole ms. Turn delay keeps its formula on the scaled hold-start delay.
- The effective speed is deterministic and clamped to `0..1`; it is the single source for initial hold delay, repeat interval, and turn delay.

## Runtime ownership

`MenuScene.resolveLegacyPlayMovementSpeedProfile()` passes only the Move Speed setting to `resolveLegacyMovementSpeedProfile(...)`. Keyboard repeat gating and touch/stick scheduling consume the same returned profile. No input path may reimplement the pace formula. The menu AI demo walker has its own cadence and does not use this profile.

The formula does not write progression, telemetry, settings, account data, or remote state.

## Diagnostics and proof

Runtime diagnostics expose the version, base and effective speed, and (read straight from the player track, not from the profile) the completed-cycle/level/pace values. They do not expose account identifiers or historical cycle details.

Proof must show identical timing at every level and pace, monotonic timing across the slider, and show live keyboard/stick traversal with release and lifecycle cleanup.
