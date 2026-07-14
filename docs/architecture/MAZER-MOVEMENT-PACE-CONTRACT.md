# Mazer Movement Pace Contract

## Status

`legacy-movement-pace-v1` is the active timing formula for held keyboard, touch-arrow, and stick movement. It converts the persisted Move Speed preference into one effective movement profile before any input adapter schedules repeats or turn delays.

## Authority

- The persisted Move Speed value is the player's base preference. It is never rewritten by progression.
- New players use the existing base timing exactly. Level and pace adjustments are admitted only after at least one completed player cycle supplies progression evidence.
- Player level contributes a bounded `0.00..0.10` adjustment. Established pace contributes `-0.05..0.05`.
- A preference envelope shrinks the adjustment near the ends of the slider and preserves explicit `0%` and `100%` selections as hard overrides.
- The resulting effective speed is deterministic and clamped to `0..1`; it is the single source for initial hold delay, repeat interval, and turn delay.

## Runtime ownership

`MenuScene.resolveLegacyPlayMovementSpeedProfile()` supplies the player track's completed cycles, level, and pace score to `resolveLegacyMovementSpeedProfile(...)`. Keyboard repeat gating and touch/stick scheduling consume the same returned profile. No input path may reimplement the pace formula.

The formula reads progression state but does not write progression, telemetry, settings, account data, or remote state. A completed cycle may change the next effective profile through the already-authoritative player track; it cannot mutate the persisted slider.

## Diagnostics and proof

Runtime diagnostics expose the version, base and effective speed, whether progression context applied, and the bounded completed-cycle/level/pace inputs. They do not expose account identifiers or historical cycle details.

Proof must keep the prior no-context timing snapshots, demonstrate bounded faster and slower established profiles, preserve slider endpoints, and show live keyboard/stick traversal with release and lifecycle cleanup.
