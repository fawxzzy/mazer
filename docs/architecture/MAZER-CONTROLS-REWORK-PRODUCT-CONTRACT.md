# Mazer Controls Rework Product Contract (MAZER-CTRL-003)

Status: OPTION B CHOSEN (owner, 2026-11-19). Built in the CTRL-003 lane: the floating anchor is now the default stick (see section 5). The audit and options below are kept as written for the record; their numbers are from the commit named in the labels line, not today's.

Original status: DRAFT for the owner. Docs and a standalone options page only. It changes no gameplay input code, enables nothing and signs nothing. The owner un-parked MAZER-CTRL-003 on 2026-11-19 ("i want controls rework to be started"). The card's own order applies: audit, written proposal the owner chooses between, only then a build.

Labels: **Fact** = read in source on origin/main `e2273d0d`. **Estimate** = computed from source numbers, not measured on a device. **Decision** = what this contract proposes. **UNKNOWN** = needs a real phone.

## 1. Audit: how touch play works today

Fact (function and constant names from `src/scenes/MenuScene.ts`, `src/input-human/touch.ts`, `src/legacy-runtime/legacyMovementSpeed.ts` on that commit):

| Area | What the code does | Number |
|---|---|---|
| Input shape | Every touch in play starts a floating stick centred where the finger landed (`handleLegacyPlayTouchControl`); only the pause cog is exempt. Direction comes from the angle of finger minus anchor (`resolveStickPullVector`). | no angular bucket, continuous projection |
| Dead zone | `deadzoneRadius = max(12, 12% of the outer ring)`; outer ring = `clamp(24% of the short side, 92..160)`. | 12 px at 390x844 |
| Full pull | `STICK_MAX_PULL_REACH_RATIO = 0.6`: full pull at 33 px from the anchor at 390 wide. Pull distance only moves the drawn knob; it does not change speed. | 33 px, speed unaffected |
| Anchor | Fixed at touch-down for the whole drag. Dragging past the ring is allowed (`allowBeyondOuter`). A reversal needs the finger to travel back through the anchor. | open PR #656 adds a follower (default off) |
| First step | After the pull leaves the dead zone the first step is scheduled `LEGACY_PLAY_STICK_RETARGET_STEP_MS = 32` ms later; a direction change reschedules within 32 + 16 ms. | about 32 ms (2 frames) |
| Step speed | `legacy-movement-pace-v2` (FLOW-014): keyboard and held arrows repeat every 139 ms at the default Move Speed (332 ms hold-start). The stick is capped lower: `min(profile, 113 ms)` repeat, 157 ms initial and turn. | stick 113 ms vs keyboard 139 ms |
| Turns | One queued turn, latest wins (`legacyDirectionalIntent`, v3). A weak secondary lean cannot peel the player off a legal lane at a T; it is used only to take one tile around a wall. | queue depth 1 |
| Release | Pointer up clears the intent and the repeat timer at once. | stop within the current tick |
| Tap | A tap stays inside the dead zone, so it makes no pull and no step. (Older docs say "short taps are one step"; that was the pre-stick swipe path.) | 0 steps |
| Haptics (CTRL-001) | One 6 ms pulse per accepted step, 8 ms on a wall bump (throttled), goal pattern; off on iOS (no vibrate call); also off under reduced motion. | not device-checked |
| Settings | `controlMode` (Stick or Arrows) is persisted and shown, but no code path assigns `playTouchArrowPointerId` a pointer; touch play always uses the floating stick. | needs a browser check to confirm |

### Felt problems (each with its evidence)

1. **The stick runs faster than keyboard and ignores the Move Speed slider at the slow end.** 113 ms vs 139 ms at the default is 8.8 vs 7.2 steps per second (+23%). Below about 45% Move Speed the profile repeat is longer than 113 ms, so the cap wins and the slider does nothing for touch. FLOW-014 said "constant speed"; touch is constant but a different constant. Estimate, not felt on a device.
2. **Fixed anchor makes reversals long.** After a long drag in one direction the thumb must come back across the anchor to reverse. Drift of 100 px means about 100 px of return travel, about 0.6 inch on a phone. PR #656 targets this.
3. **No speed control inside a corridor.** A gate (HAZ pulse gate) needs a precise stop; the only speed is one constant. Pull distance is computed and thrown away. The memory note `mazer_analog_drag_toggle_speed_idea` asks for exactly this (double the max drag, speed from distance).
4. **A pull straight at a wall that has no opening yet stops the player.** The queue holds the turn only while a weak secondary lean keeps the old lane. A thumb that goes cleanly perpendicular makes the player stand still, then turn when the first opening appears: it reads as lag, not as a queued turn. Estimate from `legacyDirectionalIntent` queue rules; needs a phone.
5. **Near-diagonal pulls can flip axis** (no hysteresis by design). A drift of a few degrees at 45 degrees swaps the primary direction. UNKNOWN how often a real thumb does this.
6. **No exact single step.** With a tap doing nothing, the only way to move one tile is a short drag that may take two.
7. **Touch target facts that are fine:** the pause cog is clamped to 44 px minimum (`TOUCH_PAUSE_MIN_SIZE`); the stick needs no target because it can start anywhere on the board.

Keyboard on desktop (1280x720): held repeat 139 ms, hold-start 332 ms, repeats merged or dropped by `keyboard.ts` policy. No problem has been reported there.

## 2. What controls must do on a phone (Decisions)

1. **Latency:** first step within 50 ms of the pull leaving the dead zone; a direction change within 50 ms; release stops before the next step (today: met by estimate, keep it).
2. **Turn forgiveness:** a turn requested up to a configurable number of tiles before the opening must be taken at the first opening; a clean perpendicular pull must never freeze the player while a legal run direction exists. Hazard contract requirement stays: queued turn taken at the next junction.
3. **Anchor:** reversing must cost no more than about 0.4 inch of thumb travel. Anchor behaviour is a Settings choice with the current behaviour as the default until the owner picks otherwise.
4. **Speed:** one default speed per input family, and the same speed for keyboard and touch at the same Move Speed setting (fixes problem 1). Any analog speed is opt-in and bounded by the FLOW-014 default as its fast end unless the owner chooses faster.
5. **Precision:** one exact single-tile step must be available (tap or short flick), and stopping on a gate tile must be possible without release-timing luck.
6. **Accessibility:** colour never carries meaning alone; reduced motion keeps silencing haptic pulses and anchor orbit (MOTION-004 rule: colour keeps shifting); no input may require two fingers or a held second finger; Arrows (or another large fixed target mode) must remain reachable for players who cannot drag; every fixed control is at least 44x44 CSS px (the stick has none).
7. **Frozen, untouched:** board size and zoom, tile style B Chip, dark neon look, hazards behind `?lab=hazards`. The hazard contract line "d-pad covers the board, swipe-to-run cannot stop at a gate, tap-to-path removes the skill" stays; Option E below is a tap-step addition, not tap-to-path.

## 3. Options the owner chooses between

Live options page: `docs/ops/MAZER-CONTROLS-OPTIONS-2026-11-19.html` (single file, playable by touch or mouse on a 13x17 test maze, tunable numbers, a Copy my pick button). It reproduces the live numbers in A.

- **A Current feel (baseline).** Fixed anchor, 12 px dead zone, 113 ms per step.
- **B Floating anchor.** A with the PR #656 idea: anchor follows past a leash.
- **C Analog speed.** Distance sets the step time (default 230 ms near the dead zone to 85 ms far out, full speed at 66 px).
- **D Turn forgiveness.** A plus run-on to the next opening (default up to 8 tiles) and an axis switch margin (default 25%).
- **E Tap to step.** A plus a quick tap moves exactly one tile toward the tapped side.

The options are not exclusive in the build: B, C, D, E change different things and could be combined. The owner picks per option and the numbers; the options page prints the pick as JSON.

## 4. Build rules after the pick

- No gameplay input build starts before the owner picks. Then: new behaviour in new `src/legacy-runtime/*` modules with unit tests; `MenuScene.ts` (Wave 5C hot file) gets minimal wiring only.
- Whatever ships updates the in-app Guide copy and Settings (a card criterion; `tests/reset/legacy-guide-content-drift.test.ts` enforces drift).
- Measure at 390x844 and 1280x720 headless first, then a real-phone pass is owed by the owner: **no phone check has happened for any control number in this document.**
- Not covered here: gamepad, accounts, server changes, deploy.

## 5. Chosen: option B (owner, 2026-11-19)

- **Decision.** The floating anchor (PR #656 controller, `src/legacy-runtime/legacyFloatingAnchor.ts`) is the default stick. Settings > Floating anchor stays, so a player can switch back to the fixed anchor; it is still device-local and still not synced. Only a stored `off` gives the fixed anchor; an absent key now means on.
- **Numbers.** Leash 90 CSS px on a phone (the options page B default; 90/160 = 0.5625 in, scaled to the canvas), catch-up 140 ms (unchanged). Dead zone, first step, turn delay and step time are the live ones (`legacy-movement-pace-v2` + PR #661), not the options page's 113 ms. **UNKNOWN:** the owner's own tuned numbers from the options page "Copy my pick" were not supplied; defaults were used.
- **Speed bug fixed in the same lane.** Turning and going round corners stepped early: a change of the stick's direction pair re-armed the next step 32 ms out (keyboard: a turn press stepped 50 ms after the press), so a turn tile came as soon as 32 ms after the last step instead of one repeat interval (deterministic sim: every turn 83 ms against 122 ms). `src/legacy-runtime/legacyHeldStepCadence.ts` now keeps every fresh step at least one repeat interval after the last accepted step; from rest the quick first answer is unchanged. Pinned by `tests/legacy-runtime/legacyHeldStepCadence.test.ts` (turn gaps equal straight gaps within one frame, with and without thumb wobble).
- **Not done here.** Problem 1 (stick 122 ms vs keyboard 151 ms at the default Move Speed) is unchanged; C, D and E are not built. No real phone has felt the 90 px leash or the speed fix.
