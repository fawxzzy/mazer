/**
 * Time-driven maze intro / outro timeline.
 *
 * One pure function of ELAPSED MILLISECONDS decides everything the intro shows:
 * how many tiles are revealed, the level digit, the spawn laser, the spawn pop,
 * the goal pulse, the atomic wrap/bleed edge-path switch and when input unlocks. There are no
 * frame counters, batches or step intervals anywhere, so a slow frame can only
 * change how many intermediate states are SAMPLED, never how long the intro
 * lasts (an earlier implementation advanced one reveal batch per `update`, so
 * a 5 fps renderer stretched a 3 s intro past 30 s).
 *
 * Nominal timeline (full motion). Only the build length depends on the tile
 * count N: buildMs(N) = clamp(N / 70 tiles/s, 2000, 3200) ms. The maze builds
 * FIRST while the diamond ring orbits; the beams fire only AFTER the build is
 * complete, and the player appears where they land:
 *
 *   phase        start-end ms        what happens
 *   digit-in         0-200           level digit fades/scales in (skipped when the digit is
 *                                    already up from the preceding deconstruct)
 *   build         100-(100+B)        tilesVisible = max(1, ceil(N * t / B)), B = buildMs(N);
 *                                    LINEAR, grows out from the spawn tile; the digit fades
 *                                    out over the last 500 ms; ALL 8 diamonds are lit and the
 *                                    ring circulates one full lap clockwise along the viewport
 *                                    perimeter, exactly back on its rest stations at build end
 *   build end      100+B             wrap/bleed edge paths (docks + their border cells) appear
 *                                    atomically, the digit is gone, the orbit has parked
 *   laser     (100+B)-(500+B)        ALL 8 edge diamonds fire a beam inward from their REST
 *                                    stations to the spawn tile (stagger <= 60 ms, every beam
 *                                    lands by the end); a diamond brightens as its beam fires
 *   landing        500+B             beams converge: the player appears (spawnPop 0 -> 1 over
 *                                    350 ms), input unlocks, the goal marker pulses (250 ms);
 *                                    the ring lighting fades over 150 ms
 *   done        500+B+350            nothing left to animate
 *
 * Total time to input unlock = 100 + B + 400 = 500 + B (2.5-3.7 s): the same as before the
 * reorder, when the beams flew in the first 400 ms and the build started as they landed.
 *
 * Deconstruct (resolveIntroDeconstruct) is the mirror: the player fires a beam out to
 * ALL 8 diamonds (0-400; each diamond lights as its beam reaches it; the ring stays
 * parked while the beams fly, then circulates one full lap COUNTER-clockwise along the
 * perimeter from 400 to the end: it unwinds what the build wound), the edge paths vanish atomically
 * at 400, the tiles dissolve LINEARLY from 400 over removeMs(N) = clamp(N / 70
 * tiles/s, 1800, 3000) ms, then a 300 ms handoff beat. The lighting fades over the
 * last 150 ms.
 *
 * Reduced motion: a 250 ms crossfade (digit fades out while the finished board
 * fades in), no laser, no sparkles, no orbit, no ring lighting, input unlocks at 250 ms.
 *
 * No Phaser, DOM, randomness or wall-clock dependency.
 */

export type IntroPhase = 'digit-in' | 'reveal' | 'laser' | 'pop' | 'done' | 'crossfade';

export interface IntroOptions {
  readonly tileCount: number;
  readonly reducedMotion: boolean;
  /**
   * True when the level digit is already fully up because the preceding
   * deconstruct faded it in (normal maze-to-maze cycle). A cold start (first
   * entry into play, settings regeneration) fades it in itself.
   */
  readonly digitAlreadyVisible?: boolean;
}

export interface IntroState {
  readonly phase: IntroPhase;
  /** Number of BFS-ordered tiles revealed so far (0..tileCount). */
  readonly tilesVisible: number;
  readonly digitAlpha: number;
  readonly digitScale: number;
  /** 0..1 travel of the spawn beams (0 before the build completes / in reduced motion, 1 once landed). */
  readonly laserProgress: number;
  /** 0..1 progress of the landing poof (0 until the laser lands). */
  readonly spawnPop: number;
  /** 0..1..0 bump on the goal marker while the poof plays. */
  readonly goalPulse: number;
  /**
   * Atomic edge-path visibility: strictly 0 or 1 (never a fraction). Docks,
   * dock-owning border cells and notch fills all key off this one value.
   */
  readonly bleedProgress: 0 | 1;
  /** Reduced motion only: 0..1 board fade-in (always 1 otherwise). */
  readonly boardAlpha: number;
  /** Diamond-ring orbit phase in radians (+ = clockwise; whole laps: exactly 0 at rest, before the build starts and from the build end on). */
  readonly ringSpinRad: number;
  /** Ring-wide lighting envelope 0..1: 1 from the intro start through the build and the beam flight, fading to 0 after the landing. */
  readonly ringEnergy: number;
  readonly inputUnlocked: boolean;
  readonly done: boolean;
}

export const INTRO_DIGIT_IN_MS = 200;
/** @deprecated Pre-reorder laser start; see INTRO_REVEAL_START_MS. The beams now leave at resolveIntroLaserStartMs(N). */
export const INTRO_LASER_START_MS = 100;
/** Beam flight time (build end -> landing). */
export const INTRO_LASER_MS = 400;
/** @deprecated Pre-reorder laser end; see INTRO_REVEAL_START_MS. */
export const INTRO_LASER_END_MS = INTRO_LASER_START_MS + INTRO_LASER_MS;
/** Beams stagger by at most this much across the 8 diamonds (every beam still lands by the laser end). */
export const INTRO_BEAM_STAGGER_MS = 60;
/**
 * @deprecated Pre-reorder timeline (beams first, maze appears as they land). The Wave 1B design tokens
 * (motion.durationMs.reveal = INTRO_REVEAL_END_MS - INTRO_REVEAL_START_MS) still cite these constants and
 * that wave owns tokens.ts/tokens.css/the evidence contract, so they keep their old values. The timeline
 * no longer reads INTRO_LASER_START_MS / INTRO_LASER_END_MS / INTRO_REVEAL_START_MS: the build starts at
 * INTRO_BUILD_START_MS and the beams leave at resolveIntroLaserStartMs(N) (the build end).
 */
export const INTRO_REVEAL_START_MS = INTRO_LASER_END_MS;
/** The maze starts building this long after the intro clock starts (the digit is already fading in). */
export const INTRO_BUILD_START_MS = 100;
/**
 * @deprecated Retired fixed-duration beat (the pre-pacing model revealed ANY tile
 * count in 700 ms and unlocked at 1200 ms). The timeline no longer reads these:
 * the reveal is resolveIntroRevealMs(N). They are kept ONLY because the Wave 1B
 * design tokens (motion.introBeatMs / motion.durationMs.reveal, tokens.ts +
 * tokens.css + the evidence contract) still cite them and that wave owns those
 * files; a follow-up Wave 1B change retires the tokens and these two constants
 * together.
 */
export const INTRO_REVEAL_END_MS = 1200;
/** @deprecated See INTRO_REVEAL_END_MS. */
export const INTRO_INPUT_UNLOCK_MS = INTRO_REVEAL_END_MS;
/** Tiles revealed per second; the reveal length is N / rate clamped to [MIN, MAX]. */
export const INTRO_REVEAL_TILES_PER_S = 70;
export const INTRO_REVEAL_MIN_MS = 2000;
export const INTRO_REVEAL_MAX_MS = 3200;
/** The level digit fades out over the last INTRO_DIGIT_OUT_MS of the reveal. */
export const INTRO_DIGIT_OUT_MS = 500;
export const INTRO_POP_MS = 350;
export const INTRO_GOAL_PULSE_MS = 250;
export const INTRO_REDUCED_MOTION_MS = 250;
export const INTRO_DIGIT_MIN_SCALE = 0.72;
/** Taps/keys inside this window after the intro began are ignored (the Start press itself). */
export const INTRO_SKIP_GRACE_MS = 200;
/** The ring lighting fades out over this long once the reveal ends (arrival) / near the outro end. */
export const RING_ENERGY_FADE_MS = 150;
/**
 * Whole laps the diamond ring circulates along the viewport perimeter over the
 * intro (clockwise, +) and over the outro (counter-clockwise, -): a whole
 * number of laps is exactly the fixed rest layout.
 */
export const RING_ORBIT_LAPS = 1;

/** Maze-to-maze deconstruct (mirror of the intro), measured from the arm instant. */
export const OUTRO_PLAYER_REMOVE_MS = 150;
export const OUTRO_TRAIL_FADE_MS = 250;
/** The edge-path group disappears all at once at this instant of the deconstruct. */
export const OUTRO_LASER_MS = 400;
export const OUTRO_EDGE_PATHS_OFF_MS = OUTRO_LASER_MS;
export const OUTRO_TILES_START_MS = OUTRO_EDGE_PATHS_OFF_MS;
export const OUTRO_REMOVE_MIN_MS = 1800;
export const OUTRO_REMOVE_MAX_MS = 3000;
export const OUTRO_DIGIT_IN_MS = 300;
export const OUTRO_HANDOFF_MS = 300;
export const OUTRO_REDUCED_MOTION_MS = 150;

const clamp01 = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
);

const smoothstep = (value: number): number => {
  const x = clamp01(value);
  return x * x * (3 - (2 * x));
};

const smootherstep = (value: number): number => smoothstep(smoothstep(value));

export const easeOutCubic = (value: number): number => {
  const x = clamp01(value);
  return 1 - ((1 - x) ** 3);
};

const normalizeCount = (value: number): number => (
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
);

const normalizeElapsed = (elapsedMs: number): number => (
  Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
);

const resolveTileDurationMs = (tileCount: number, minMs: number, maxMs: number): number => (
  Math.max(minMs, Math.min(maxMs, (normalizeCount(tileCount) / INTRO_REVEAL_TILES_PER_S) * 1000))
);

/** Build reveal length: clamp(N / 70 tiles/s, 2000, 3200) ms. */
export const resolveIntroRevealMs = (tileCount: number): number => (
  resolveTileDurationMs(tileCount, INTRO_REVEAL_MIN_MS, INTRO_REVEAL_MAX_MS)
);

/** Instant the BUILD completes (the last tile is shown); the ring parks, the digit is gone, the beams fire. */
export const resolveIntroRevealEndMs = (tileCount: number): number => (
  INTRO_BUILD_START_MS + resolveIntroRevealMs(tileCount)
);

/** The 8 beams leave their diamonds only once the build is complete. */
export const resolveIntroLaserStartMs = (tileCount: number): number => resolveIntroRevealEndMs(tileCount);

/** Instant the beams land on the spawn tile: the player appears and input unlocks. */
export const resolveIntroLaserEndMs = (tileCount: number): number => (
  resolveIntroLaserStartMs(tileCount) + INTRO_LASER_MS
);

/** Wrap/bleed edge paths (docks + their border cells) switch on atomically at the build end. */
export const resolveIntroEdgePathsOnMs = (tileCount: number): number => resolveIntroRevealEndMs(tileCount);

export const resolveIntroDoneMs = (tileCount: number): number => (
  resolveIntroLaserEndMs(tileCount) + Math.max(INTRO_POP_MS, INTRO_GOAL_PULSE_MS)
);

/** Deconstruct tile-removal length: clamp(N / 70 tiles/s, 1800, 3000) ms. */
export const resolveOutroRemoveMs = (tileCount: number): number => (
  resolveTileDurationMs(tileCount, OUTRO_REMOVE_MIN_MS, OUTRO_REMOVE_MAX_MS)
);

/** Instant the last tile is gone (handoff beat starts here). */
export const resolveOutroTilesEndMs = (tileCount: number): number => (
  OUTRO_TILES_START_MS + resolveOutroRemoveMs(tileCount)
);

/** Tiles gone + handoff beat: the whole deconstruct is this long for N tiles. */
export const resolveOutroTotalMs = (tileCount: number): number => (
  resolveOutroTilesEndMs(tileCount) + OUTRO_HANDOFF_MS
);

/**
 * Border cells that own a wrap/bleed dock are shown by the atomic edge-path
 * switch, never by the gradual tile reveal/dissolve: a cell is hidden exactly
 * while the edge-path group is hidden, so no lone square can outlive (or
 * precede) its dock strips.
 */
export const isEdgePathCellShown = (edgePathsVisible: boolean, isEdgePathCell: boolean): boolean => (
  edgePathsVisible || !isEdgePathCell
);

/** Whole-intro duration for the given motion preference. */
export const resolveIntroDurationMs = (reducedMotion: boolean, tileCount: number): number => (
  reducedMotion ? INTRO_REDUCED_MOTION_MS : resolveIntroDoneMs(tileCount)
);

/** Instant at which input unlocks (the beam landing, i.e. build end + beam flight, in full motion). */
export const resolveIntroInputUnlockMs = (reducedMotion: boolean, tileCount: number): number => (
  reducedMotion ? INTRO_REDUCED_MOTION_MS : resolveIntroLaserEndMs(tileCount)
);

/**
 * Skip: the elapsed value that puts the intro in its final state. Never moves
 * time backwards, so skipping an already-finished intro is a no-op.
 */
export const skipIntroElapsedMs = (
  elapsedMs: number,
  { reducedMotion, tileCount }: { readonly reducedMotion: boolean; readonly tileCount: number }
): number => Math.max(normalizeElapsed(elapsedMs), resolveIntroDurationMs(reducedMotion, tileCount));

/**
 * Ring orbit phase in radians over [startMs, endMs] (the timeline field is still
 * called ringSpinRad): direction * 2*pi*laps*smoothstep. 2*pi = one full lap
 * of the perimeter (resolveOrbitingEdgeStations). Exactly 0 before the window
 * and exactly 0 (a whole number of laps = the rest layout) once it has ended.
 */
export const resolveRingOrbitRad = (
  elapsedMs: number,
  startMs: number,
  endMs: number,
  direction: 1 | -1
): number => {
  const progress = (elapsedMs - startMs) / (endMs - startMs);
  // smoothstep, not smootherstep: zero speed at both ends, but the mid-window peak is 1.5x the average
  // speed (smootherstep would be 2.25x here), which reads as travel instead of a lurch on a long edge.
  return progress <= 0 || progress >= 1 ? 0 : direction * Math.PI * 2 * RING_ORBIT_LAPS * smoothstep(progress);
};

/** 1 until `fadeStartMs`, then falls linearly to exactly 0 over RING_ENERGY_FADE_MS. */
export const resolveRingEnergyEnvelope = (elapsedMs: number, fadeStartMs: number): number => (
  1 - clamp01((elapsedMs - fadeStartMs) / RING_ENERGY_FADE_MS)
);

/**
 * The single spawn laser as a pure function of time since the beam left its
 * station. Shared by the intro and by the scene's spawn-burst clock so menu and
 * play can never disagree about it.
 */
export const resolveSpawnLaser = (sinceLaserStartMs: number): {
  readonly laserProgress: number;
  readonly spawnPop: number;
  readonly markerRevealed: boolean;
} => {
  const elapsed = Number.isFinite(sinceLaserStartMs) ? sinceLaserStartMs : 0;
  return {
    laserProgress: smoothstep(elapsed / INTRO_LASER_MS),
    spawnPop: clamp01((elapsed - INTRO_LASER_MS) / INTRO_POP_MS),
    markerRevealed: elapsed >= INTRO_LASER_MS
  };
};

const resolveReducedMotionIntro = (elapsedMs: number, tileCount: number): IntroState => {
  const progress = clamp01(elapsedMs / INTRO_REDUCED_MOTION_MS);
  const finished = elapsedMs >= INTRO_REDUCED_MOTION_MS;
  return {
    phase: finished ? 'done' : 'crossfade',
    tilesVisible: elapsedMs > 0 ? tileCount : 0,
    digitAlpha: 1 - progress,
    digitScale: 1,
    laserProgress: 0,
    spawnPop: 0,
    goalPulse: 0,
    bleedProgress: elapsedMs > 0 ? 1 : 0,
    boardAlpha: progress,
    ringSpinRad: 0,
    ringEnergy: 0,
    inputUnlocked: finished,
    done: finished
  };
};

export const resolveIntro = (elapsedMs: number, options: IntroOptions): IntroState => {
  const elapsed = normalizeElapsed(elapsedMs);
  const tileCount = normalizeCount(options.tileCount);
  if (options.reducedMotion) {
    return resolveReducedMotionIntro(elapsed, tileCount);
  }

  const revealMs = resolveIntroRevealMs(tileCount);
  const revealEndMs = resolveIntroRevealEndMs(tileCount);
  const laserStartMs = resolveIntroLaserStartMs(tileCount);
  const laserEndMs = resolveIntroLaserEndMs(tileCount);
  const doneMs = resolveIntroDoneMs(tileCount);

  // The first BFS tile (the spawn tile) appears when the build starts and the maze grows out
  // from it. Linear in time; complete exactly at the build end, BEFORE any beam fires.
  const tilesVisible = elapsed < INTRO_BUILD_START_MS
    ? 0
    : elapsed >= revealEndMs
      ? tileCount
      : Math.min(tileCount, Math.max(1, Math.ceil((tileCount * (elapsed - INTRO_BUILD_START_MS)) / revealMs)));

  const digitIn = options.digitAlreadyVisible === true ? 1 : smootherstep(elapsed / INTRO_DIGIT_IN_MS);
  const digitOutStartMs = revealEndMs - INTRO_DIGIT_OUT_MS;
  const digitOut = 1 - smootherstep((elapsed - digitOutStartMs) / INTRO_DIGIT_OUT_MS);
  const digitAlpha = elapsed >= revealEndMs ? 0 : Math.min(digitIn, digitOut);

  const laser = resolveSpawnLaser(elapsed - laserStartMs);
  const laserActive = elapsed >= laserStartMs;
  const popProgress = laserActive ? laser.spawnPop : 0;
  const goalPulseProgress = clamp01((elapsed - laserEndMs) / INTRO_GOAL_PULSE_MS);

  const phase: IntroPhase = elapsed < INTRO_BUILD_START_MS
    ? 'digit-in'
    : elapsed < revealEndMs
      ? 'reveal'
      : elapsed < laserEndMs
        ? 'laser'
        : elapsed < doneMs
          ? 'pop'
          : 'done';

  return {
    phase,
    tilesVisible,
    digitAlpha,
    digitScale: INTRO_DIGIT_MIN_SCALE + ((1 - INTRO_DIGIT_MIN_SCALE) * digitAlpha),
    laserProgress: laserActive ? laser.laserProgress : 0,
    spawnPop: popProgress,
    goalPulse: goalPulseProgress > 0 && goalPulseProgress < 1 ? Math.sin(goalPulseProgress * Math.PI) : 0,
    bleedProgress: elapsed >= revealEndMs ? 1 : 0,
    boardAlpha: 1,
    // One clockwise lap over the whole build: exactly 0 (rest stations) when the beams fire.
    ringSpinRad: resolveRingOrbitRad(elapsed, INTRO_BUILD_START_MS, revealEndMs, 1),
    ringEnergy: resolveRingEnergyEnvelope(elapsed, laserEndMs),
    inputUnlocked: elapsed >= laserEndMs,
    done: elapsed >= doneMs
  };
};

export interface OutroState {
  /** Tiles still on screen (tileCount down to 0). */
  readonly tilesVisible: number;
  readonly playerAlpha: number;
  readonly trailAlpha: number;
  /** Level digit fading IN during the deconstruct so it is up for the next intro. */
  readonly digitAlpha: number;
  readonly digitScale: number;
  /** Atomic edge-path visibility: strictly 1 then 0 (never a fraction). */
  readonly bleedProgress: 0 | 1;
  /** 0..1 travel of the beams from the player OUT to all 8 diamonds (0 in reduced motion). */
  readonly laserProgress: number;
  /** Diamond-ring orbit phase in radians (- = counter-clockwise; whole laps: exactly 0 at rest, before 400 ms and after the outro). */
  readonly ringSpinRad: number;
  /** Ring-wide lighting envelope 0..1: 1 until the last 150 ms of the outro, then 0. */
  readonly ringEnergy: number;
  /** True once the tiles are gone (the handoff beat starts here). */
  readonly tilesGone: boolean;
  /** True once the whole deconstruct including the handoff beat has run. */
  readonly done: boolean;
}

/** Deconstruct = the intro run backwards: beams out, edge paths off, tiles dissolve linearly. */
export const resolveIntroDeconstruct = (elapsedMs: number, options: IntroOptions): OutroState => {
  const elapsed = normalizeElapsed(elapsedMs);
  const tileCount = normalizeCount(options.tileCount);
  if (options.reducedMotion) {
    const finished = elapsed >= OUTRO_REDUCED_MOTION_MS;
    return {
      tilesVisible: elapsed > 0 ? 0 : tileCount,
      playerAlpha: elapsed > 0 ? 0 : 1,
      trailAlpha: elapsed > 0 ? 0 : 1,
      digitAlpha: 1,
      digitScale: 1,
      bleedProgress: elapsed > 0 ? 0 : 1,
      laserProgress: 0,
      ringSpinRad: 0,
      ringEnergy: 0,
      tilesGone: elapsed > 0,
      done: finished
    };
  }

  const removeMs = resolveOutroRemoveMs(tileCount);
  const tilesEndMs = OUTRO_TILES_START_MS + removeMs;
  const totalMs = tilesEndMs + OUTRO_HANDOFF_MS;
  const tileProgress = clamp01((elapsed - OUTRO_TILES_START_MS) / removeMs);
  const tilesVisible = tileProgress >= 1
    ? 0
    : Math.min(tileCount, Math.ceil(tileCount * (1 - tileProgress)));
  const digitAlpha = smootherstep(elapsed / OUTRO_DIGIT_IN_MS);

  return {
    tilesVisible,
    playerAlpha: 1 - clamp01(elapsed / OUTRO_PLAYER_REMOVE_MS),
    trailAlpha: 1 - clamp01((elapsed - OUTRO_PLAYER_REMOVE_MS) / OUTRO_TRAIL_FADE_MS),
    digitAlpha,
    digitScale: INTRO_DIGIT_MIN_SCALE + ((1 - INTRO_DIGIT_MIN_SCALE) * digitAlpha),
    bleedProgress: elapsed < OUTRO_EDGE_PATHS_OFF_MS ? 1 : 0,
    laserProgress: smoothstep(elapsed / OUTRO_LASER_MS),
    ringSpinRad: resolveRingOrbitRad(elapsed, OUTRO_TILES_START_MS, totalMs, -1),
    ringEnergy: resolveRingEnergyEnvelope(elapsed, totalMs - RING_ENERGY_FADE_MS),
    tilesGone: elapsed >= tilesEndMs,
    done: elapsed >= totalMs
  };
};
