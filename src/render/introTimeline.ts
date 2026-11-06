/**
 * Time-driven maze intro / outro timeline.
 *
 * One pure function of ELAPSED MILLISECONDS decides everything the intro shows:
 * how many tiles are revealed, the level digit, the spawn laser, the spawn pop,
 * the goal pulse, the atomic wrap/bleed edge-path switch and when input unlocks. There are no
 * frame counters, batches or step intervals anywhere, so a slow frame can only
 * change how many intermediate states are SAMPLED, never how long the intro
 * lasts (the previous implementation advanced one reveal batch per `update`, so
 * a 5 fps renderer stretched a 3 s intro past 30 s).
 *
 * Nominal timeline (full motion, any tile count). The beams come FIRST and the
 * maze appears as they land:
 *
 *   phase        start-end ms   what happens
 *   digit-in         0-200      level digit fades/scales in (skipped when the digit is
 *                               already up from the preceding deconstruct)
 *   laser          100-500      ALL 8 edge diamonds fire a beam inward to the spawn tile
 *                               (stagger <= 60 ms, every beam lands by 500); the digit
 *                               starts fading out at 700
 *   pop            500-850      6-sparkle poof where the beams converge
 *   reveal        500-1200      tilesVisible = max(1, ceil(N * easeOutCubic((t - 500) / 700)))
 *                               grows out from the spawn tile; duration does not depend on N
 *   unlock           1200      reveal complete: wrap/bleed edge paths (docks + their border
 *                               cells) appear atomically, the digit is gone, input unlocks
 *   goal pulse    1200-1450     goal marker pulse
 *   done             1450      nothing left to animate
 *
 * Deconstruct (resolveIntroDeconstruct) is the mirror, <= 900 ms: the player fires a
 * beam out to ALL 8 diamonds (0-400), the edge paths vanish atomically at 400, the
 * tiles dissolve 400-600, then a 300 ms handoff beat.
 *
 * Reduced motion: a 250 ms crossfade (digit fades out while the finished board
 * fades in), no laser, no sparkles, input unlocks at 250 ms.
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
  /** 0..1 travel of the single spawn laser (0 before / in reduced motion, 1 once landed). */
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
  readonly inputUnlocked: boolean;
  readonly done: boolean;
}

export const INTRO_DIGIT_IN_MS = 200;
export const INTRO_LASER_START_MS = 100;
export const INTRO_LASER_MS = 400;
export const INTRO_LASER_END_MS = INTRO_LASER_START_MS + INTRO_LASER_MS;
/** Beams stagger by at most this much across the 8 diamonds (every beam still lands by the laser end). */
export const INTRO_BEAM_STAGGER_MS = 60;
/** The maze appears as the beams land. */
export const INTRO_REVEAL_START_MS = INTRO_LASER_END_MS;
export const INTRO_REVEAL_END_MS = 1200;
export const INTRO_DIGIT_OUT_START_MS = 700;
/**
 * Wrap/bleed edge paths (the dock strips AND the border cells that own them)
 * are ONE atomic group: absent before this instant, fully present from it.
 * There is deliberately no partial length / half-grown state.
 */
export const INTRO_EDGE_PATHS_ON_MS = INTRO_REVEAL_END_MS;
export const INTRO_POP_MS = 350;
/** Input unlocks once the beams have landed AND the maze has finished appearing. */
export const INTRO_INPUT_UNLOCK_MS = INTRO_REVEAL_END_MS;
export const INTRO_GOAL_PULSE_MS = 250;
export const INTRO_DONE_MS = INTRO_INPUT_UNLOCK_MS + INTRO_GOAL_PULSE_MS;
export const INTRO_REDUCED_MOTION_MS = 250;
export const INTRO_DIGIT_MIN_SCALE = 0.72;
/** Taps/keys inside this window after the intro began are ignored (the Start press itself). */
export const INTRO_SKIP_GRACE_MS = 200;

/** Maze-to-maze deconstruct (mirror of the intro), measured from the arm instant. */
export const OUTRO_PLAYER_REMOVE_MS = 150;
export const OUTRO_TRAIL_FADE_MS = 250;
/** The edge-path group disappears all at once at this instant of the deconstruct. */
export const OUTRO_LASER_MS = 400;
export const OUTRO_EDGE_PATHS_OFF_MS = OUTRO_LASER_MS;
export const OUTRO_TILES_START_MS = OUTRO_EDGE_PATHS_OFF_MS;
export const OUTRO_TILES_END_MS = 600;
export const OUTRO_DIGIT_IN_MS = 300;
export const OUTRO_HANDOFF_MS = 300;
/** Tiles gone + handoff beat: the whole deconstruct is at most this long. */
export const OUTRO_TOTAL_MS = OUTRO_TILES_END_MS + OUTRO_HANDOFF_MS;
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
export const resolveIntroDurationMs = (reducedMotion: boolean): number => (
  reducedMotion ? INTRO_REDUCED_MOTION_MS : INTRO_DONE_MS
);

/** Instant at which input unlocks (== the spawn laser landing in full motion). */
export const resolveIntroInputUnlockMs = (reducedMotion: boolean): number => (
  reducedMotion ? INTRO_REDUCED_MOTION_MS : INTRO_INPUT_UNLOCK_MS
);

/**
 * Skip: the elapsed value that puts the intro in its final state. Never moves
 * time backwards, so skipping an already-finished intro is a no-op.
 */
export const skipIntroElapsedMs = (
  elapsedMs: number,
  { reducedMotion }: { readonly reducedMotion: boolean }
): number => Math.max(normalizeElapsed(elapsedMs), resolveIntroDurationMs(reducedMotion));

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

  const revealProgress = (elapsed - INTRO_REVEAL_START_MS) / (INTRO_REVEAL_END_MS - INTRO_REVEAL_START_MS);
  // The spawn tile (first BFS tile) appears the instant the beams land, so
  // the reveal visibly grows out of where they converge.
  const tilesVisible = elapsed < INTRO_REVEAL_START_MS
    ? 0
    : Math.min(tileCount, Math.max(1, Math.ceil(tileCount * easeOutCubic(revealProgress))));

  const digitIn = options.digitAlreadyVisible === true ? 1 : smootherstep(elapsed / INTRO_DIGIT_IN_MS);
  const digitOut = 1 - smootherstep((elapsed - INTRO_DIGIT_OUT_START_MS) / (INTRO_INPUT_UNLOCK_MS - INTRO_DIGIT_OUT_START_MS));
  const digitAlpha = elapsed >= INTRO_INPUT_UNLOCK_MS ? 0 : Math.min(digitIn, digitOut);

  const laser = resolveSpawnLaser(elapsed - INTRO_LASER_START_MS);
  const laserActive = elapsed >= INTRO_LASER_START_MS;
  const popProgress = laserActive ? laser.spawnPop : 0;
  const goalPulseProgress = clamp01((elapsed - INTRO_INPUT_UNLOCK_MS) / INTRO_GOAL_PULSE_MS);

  const phase: IntroPhase = elapsed < INTRO_LASER_START_MS
    ? 'digit-in'
    : elapsed < INTRO_LASER_END_MS
      ? 'laser'
      : elapsed < INTRO_INPUT_UNLOCK_MS
        ? 'reveal'
        : elapsed < INTRO_DONE_MS
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
    bleedProgress: elapsed >= INTRO_EDGE_PATHS_ON_MS ? 1 : 0,
    boardAlpha: 1,
    inputUnlocked: elapsed >= INTRO_INPUT_UNLOCK_MS,
    done: elapsed >= INTRO_DONE_MS
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
  /** True once the tiles are gone (the handoff beat starts here). */
  readonly tilesGone: boolean;
  /** True once the whole deconstruct including the handoff beat has run. */
  readonly done: boolean;
}

/** Deconstruct = the intro run backwards, capped at OUTRO_TOTAL_MS (<= 900 ms). */
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
      tilesGone: elapsed > 0,
      done: finished
    };
  }

  const tileProgress = clamp01((elapsed - OUTRO_TILES_START_MS) / (OUTRO_TILES_END_MS - OUTRO_TILES_START_MS));
  const tilesVisible = tileProgress >= 1
    ? 0
    : Math.min(tileCount, Math.ceil(tileCount * easeOutCubic(1 - tileProgress)));
  const digitAlpha = smootherstep(elapsed / OUTRO_DIGIT_IN_MS);

  return {
    tilesVisible,
    playerAlpha: 1 - clamp01(elapsed / OUTRO_PLAYER_REMOVE_MS),
    trailAlpha: 1 - clamp01((elapsed - OUTRO_PLAYER_REMOVE_MS) / OUTRO_TRAIL_FADE_MS),
    digitAlpha,
    digitScale: INTRO_DIGIT_MIN_SCALE + ((1 - INTRO_DIGIT_MIN_SCALE) * digitAlpha),
    bleedProgress: elapsed < OUTRO_EDGE_PATHS_OFF_MS ? 1 : 0,
    laserProgress: smoothstep(elapsed / OUTRO_LASER_MS),
    tilesGone: elapsed >= OUTRO_TILES_END_MS,
    done: elapsed >= OUTRO_TOTAL_MS
  };
};
