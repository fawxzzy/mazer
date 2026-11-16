/**
 * Deterministic Hunter run (slice H5, pure core). Pure: no scene, no randomness,
 * no clock.
 *
 * A run is a level played one world tick at a time from an input log: one
 * action per tick (up, left, down, right or wait). Same graph, same hazards, same
 * log -> byte-identical trace and digest. This is the replay contract the H5
 * wiring, the bots and the receipts build on.
 *
 * One tick, from tick `t` to `t + 1` (graph contract tick semantics + A1..A4):
 *   1. player phase: the action's destination via `graph.moveTarget`. A wall
 *      bump or a gate that is closed at the arrival tick is a WAIT (A1). A gate
 *      that closes on the cell the player waits in ejects the player one cell back
 *      along the trail, with no contact and no invulnerability (A3);
 *   2. enemy phase: every active Hunter takes `stepJunctionGreedyEnemy` against
 *      the player's NEW cell (gates are walls for Hunters at the arrival tick);
 *      Sentries are read from the timeline;
 *   3. collisions: the graph-contract contact definition (occupancy after the
 *      enemy phase, or a head-on swap, also across a wrap), ignored while the
 *      invulnerability counter is above 0 (it decrements every tick);
 *   4. contact (A2): every contacted Hunter counts one contact (A4: the third burns
 *      it out), the player rewinds to the last junction on their own trail, the
 *      trail retracts to it, and the player gets N = 4 invulnerable ticks. Runtime
 *      safety: the rewind cell must have a joint witness to the goal from the new
 *      state (the A* `findWitnessRouteWithChasers`, bounded); otherwise the
 *      previous trail junction, finally the start;
 *   5. goal: arriving on the goal without a contact ends the run.
 *
 * The contact consequence here is the A2 rule as written. Slice H4 owns the
 * contact system for Sentries in play; when both are wired the H4 rewind and this
 * one must be the same function (pinned by a test at wiring time).
 */

import {
  type JunctionGreedyEnemySpec,
  type JunctionGreedyEnemyState
} from './chaserEngine';
import { findWitnessRouteWithChasers } from './chaserSolvability';
import {
  HAZARD_ACTION_ORDER,
  createHazardTimeline,
  type BuiltHazardTimeline,
  type HazardAction,
  type HazardCellId,
  type HazardGraph,
  type HazardMoveDirection,
  type HazardSpec
} from './graphContract';
import {
  createHunterState,
  hunterCell,
  registerHunterContact,
  stepHunter,
  type HunterState
} from './hunterEngine';
import { stableStringify } from './serialization';

export const HUNTER_RUN_CONTRACT = 'mazer-hunter-run-v1' as const;
export const HUNTER_INPUT_LOG_CONTRACT = 'mazer-hunter-input-log-v1' as const;

/** A2: invulnerable ticks after a rewind in play (the validator keeps checking at 2). */
export const PLAY_INVULNERABLE_TURNS = 4;
/** State cap of one runtime rewind safety search (A2). */
export const DEFAULT_REWIND_STATE_CAP = 50_000;

export interface HunterRunConfig {
  readonly graph: HazardGraph;
  /** Timeline hazards (Pulse Gates, Sentries). Blockers are not placed (A5) but are honoured if present. */
  readonly specs: readonly HazardSpec[];
  readonly hunters: readonly JunctionGreedyEnemySpec[];
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly invulnerableTurns?: number;
  readonly rewindStateCap?: number;
}

export interface HunterRunContext {
  readonly graph: HazardGraph;
  readonly timeline: BuiltHazardTimeline;
  readonly hunterSpecs: readonly JunctionGreedyEnemySpec[];
  readonly start: HazardCellId;
  readonly goal: HazardCellId;
  readonly invulnerableTurns: number;
  readonly rewindStateCap: number;
}

export const createHunterRunContext = (config: HunterRunConfig): HunterRunContext => {
  const { graph } = config;
  if (!graph.isWalkable(config.start) || !graph.isWalkable(config.goal)) {
    throw new RangeError('start and goal must be walkable');
  }
  const invulnerableTurns = config.invulnerableTurns ?? PLAY_INVULNERABLE_TURNS;
  if (!Number.isInteger(invulnerableTurns) || invulnerableTurns < 0) {
    throw new RangeError('invulnerableTurns must be a non-negative integer');
  }
  return {
    graph,
    timeline: createHazardTimeline(graph, config.specs),
    hunterSpecs: config.hunters.slice(),
    start: config.start,
    goal: config.goal,
    invulnerableTurns,
    rewindStateCap: config.rewindStateCap ?? DEFAULT_REWIND_STATE_CAP
  };
};

export interface HunterRunState {
  readonly contract: typeof HUNTER_RUN_CONTRACT;
  /** World tick (actions applied so far). */
  readonly tick: number;
  readonly cell: HazardCellId;
  /** Direction of the player's last accepted step (null before the first). */
  readonly heading: HazardMoveDirection | null;
  /** Contact-free ticks remaining. */
  readonly invulnerable: number;
  /** The player's own trail: accepted cells, oldest first, `trail[0] === start`; ends at `cell`. */
  readonly trail: readonly HazardCellId[];
  readonly hunters: readonly HunterState[];
  /** Contacts in this level (Hunters and Sentries; one per tick at most). */
  readonly contacts: number;
  readonly burnouts: number;
  readonly reachedGoal: boolean;
}

export const createHunterRunState = (context: HunterRunContext): HunterRunState => ({
  contract: HUNTER_RUN_CONTRACT,
  tick: 0,
  cell: context.start,
  heading: null,
  invulnerable: 0,
  trail: [context.start],
  hunters: context.hunterSpecs.map((spec, index) => createHunterState(spec, index, context.graph)),
  contacts: 0,
  burnouts: 0,
  reachedGoal: context.start === context.goal
});

export type HunterRewindKind = 'junction' | 'earlier-junction' | 'start';

export type HunterRunEvent =
  | {
    readonly type: 'contact';
    /** Tick produced by the action (t + 1). */
    readonly tick: number;
    readonly cell: HazardCellId;
    /** Hunter indices in contact this tick. */
    readonly hunters: readonly number[];
    /** True when a Sentry made contact. */
    readonly sentry: boolean;
    /** Null in probe mode (no rewind is resolved). */
    readonly rewindCell: HazardCellId | null;
    readonly rewindKind: HunterRewindKind | null;
  }
  | { readonly type: 'burnout'; readonly tick: number; readonly hunter: number }
  | { readonly type: 'eject'; readonly tick: number; readonly from: HazardCellId; readonly to: HazardCellId }
  | { readonly type: 'goal'; readonly tick: number };

export interface HunterStepResult {
  readonly state: HunterRunState;
  readonly events: readonly HunterRunEvent[];
}

export interface StepHunterRunOptions {
  /**
   * Probe mode for planners: a contact is reported but not resolved (no rewind,
   * no contact count, no burnout, no safety search). The returned state is the
   * pre-contact state and must not be continued as a real run.
   */
  readonly probe?: boolean;
}

/** Last junction strictly behind the trail end, scanning from `before - 1` down; -1 when none. */
const previousTrailJunction = (graph: HazardGraph, trail: readonly HazardCellId[], before: number): number => {
  for (let index = before - 1; index >= 0; index -= 1) {
    if (graph.isJunction(trail[index]!)) {
      return index;
    }
  }
  return -1;
};

/** A2 rewind with the runtime safety check. Returns the trail index to rewind to. */
const resolveRewindIndex = (
  context: HunterRunContext,
  trail: readonly HazardCellId[],
  tick: number,
  heading: HazardMoveDirection | null,
  hunters: readonly HunterState[]
): { readonly index: number; readonly kind: HunterRewindKind } => {
  const active: JunctionGreedyEnemyState[] = hunters.filter((hunter) => !hunter.burnedOut).map((hunter) => hunter.engine);
  let index = previousTrailJunction(context.graph, trail, trail.length - 1);
  let kind: HunterRewindKind = 'junction';
  while (index > 0) {
    const result = findWitnessRouteWithChasers(context.graph, context.timeline, active, {
      start: trail[index]!,
      goal: context.goal,
      startTick: tick,
      invulnerableTurns: context.invulnerableTurns,
      startHeading: heading,
      stateCap: context.rewindStateCap
    });
    if (result.status === 'solvable') {
      return { index, kind };
    }
    index = previousTrailJunction(context.graph, trail, index);
    kind = 'earlier-junction';
  }
  return { index: 0, kind: 'start' };
};

const contactAt = (
  cell: HazardCellId,
  dest: HazardCellId,
  before: HazardCellId,
  after: HazardCellId
): boolean => after >= 0 && (after === dest || (dest !== cell && before === dest && after === cell));

/** Applies one action. Pure: the input state is never mutated. */
export const stepHunterRun = (
  context: HunterRunContext,
  state: HunterRunState,
  action: HazardAction,
  options: StepHunterRunOptions = {}
): HunterStepResult => {
  if (!HAZARD_ACTION_ORDER.includes(action)) {
    throw new RangeError(`unknown action ${String(action)}`);
  }
  if (state.reachedGoal) {
    return { state, events: [] };
  }
  const { graph, timeline } = context;
  const tick = state.tick;
  const arrival = tick + 1;
  const events: HunterRunEvent[] = [];

  // 1. Player phase.
  let dest = action === 'wait' ? state.cell : graph.moveTarget(state.cell, action);
  if (dest < 0 || (dest !== state.cell && timeline.blockedAt(dest, arrival))) {
    dest = state.cell;
  }
  let heading = state.heading;
  let trail = state.trail;
  let origin = state.cell;
  if (dest !== state.cell) {
    heading = action as HazardMoveDirection;
    trail = [...trail, dest];
  } else if (timeline.blockedAt(state.cell, arrival)) {
    // A3: the gate closes on the player; eject one cell back along the trail.
    const back = trail.length >= 2 ? trail[trail.length - 2]! : state.cell;
    if (back !== state.cell && !timeline.blockedAt(back, arrival)) {
      events.push({ type: 'eject', tick: arrival, from: state.cell, to: back });
      dest = back;
      trail = trail.slice(0, -1);
      origin = back;
    }
  }

  // 2. Enemy phase.
  const blocked = (cell: HazardCellId, turn: number): boolean => timeline.blockedAt(cell, turn);
  const huntersBefore = state.hunters;
  let hunters = huntersBefore.map((hunter) => stepHunter(graph, hunter, { cell: dest, heading }, tick, { blocked }));

  // 3. Collisions. `origin` is the cell the player left (after an eject, the eject cell: no swap through a gate).
  let invulnerable = state.invulnerable;
  const contacted: number[] = [];
  let sentry = false;
  if (invulnerable > 0) {
    invulnerable -= 1;
  } else {
    hunters.forEach((hunter, index) => {
      if (contactAt(origin, dest, hunterCell(huntersBefore[index]!), hunterCell(hunter))) {
        contacted.push(index);
      }
    });
    const sentriesBefore = timeline.enemyCellsAt(tick);
    const sentriesAfter = timeline.enemyCellsAt(arrival);
    sentry = sentriesAfter.some((after, index) => contactAt(origin, dest, sentriesBefore[index]!, after));
  }

  if (contacted.length > 0 || sentry) {
    if (options.probe === true) {
      events.push({ type: 'contact', tick: arrival, cell: dest, hunters: contacted, sentry, rewindCell: null, rewindKind: null });
      return {
        state: { ...state, tick: arrival, cell: dest, heading, trail, hunters, invulnerable },
        events
      };
    }
    let burnouts = state.burnouts;
    hunters = hunters.map((hunter, index) => {
      if (!contacted.includes(index)) {
        return hunter;
      }
      const next = registerHunterContact(hunter, arrival);
      if (next.burnedOut) {
        burnouts += 1;
        events.push({ type: 'burnout', tick: arrival, hunter: index });
      }
      return next;
    });
    const rewind = resolveRewindIndex(context, trail, arrival, heading, hunters);
    const rewindCell = trail[rewind.index]!;
    events.unshift({
      type: 'contact', tick: arrival, cell: dest, hunters: contacted, sentry, rewindCell, rewindKind: rewind.kind
    });
    return {
      state: {
        ...state,
        tick: arrival,
        cell: rewindCell,
        heading,
        invulnerable: context.invulnerableTurns,
        trail: trail.slice(0, rewind.index + 1),
        hunters,
        contacts: state.contacts + 1,
        burnouts
      },
      events
    };
  }

  const reachedGoal = dest === context.goal;
  if (reachedGoal) {
    events.push({ type: 'goal', tick: arrival });
  }
  return {
    state: { ...state, tick: arrival, cell: dest, heading, invulnerable, trail, hunters, reachedGoal },
    events
  };
};

// ---------------------------------------------------------------------------
// Input logs and replay
// ---------------------------------------------------------------------------

export interface HunterInputLog {
  readonly contract: typeof HUNTER_INPUT_LOG_CONTRACT;
  /** One action per world tick from tick 0. */
  readonly actions: readonly HazardAction[];
}

const ACTION_CODES: Readonly<Record<HazardAction, string>> = { up: 'U', left: 'L', down: 'D', right: 'R', wait: 'W' };
const CODE_ACTIONS: Readonly<Record<string, HazardAction>> = { U: 'up', L: 'left', D: 'down', R: 'right', W: 'wait' };

/** Compact text form: one letter per tick (U L D R W). */
export const encodeHunterInputLog = (log: HunterInputLog): string => log.actions.map((action) => ACTION_CODES[action]).join('');

export const decodeHunterInputLog = (text: string): HunterInputLog => ({
  contract: HUNTER_INPUT_LOG_CONTRACT,
  actions: Array.from(text, (code, index) => {
    const action = CODE_ACTIONS[code];
    if (action === undefined) {
      throw new RangeError(`invalid input log code ${JSON.stringify(code)} at ${index}`);
    }
    return action;
  })
});

export interface HunterRunFrame {
  readonly tick: number;
  readonly cell: HazardCellId;
  readonly invulnerable: number;
  /** Per Hunter: its cell (-1 = not spawned or burned out). */
  readonly hunterCells: readonly HazardCellId[];
}

export interface HunterRunResult {
  readonly contract: typeof HUNTER_RUN_CONTRACT;
  readonly reachedGoal: boolean;
  /** Ticks used (the goal tick when reached, else the log length or the stop tick). */
  readonly ticks: number;
  readonly contacts: number;
  /** Contacts per Hunter index. */
  readonly hunterContacts: readonly number[];
  readonly burnouts: number;
  /** Cleared with no contact (the "CLEAN" mark). */
  readonly clean: boolean;
  readonly events: readonly HunterRunEvent[];
  /** Frame after every applied action, starting with tick 0. */
  readonly frames: readonly HunterRunFrame[];
  /** FNV-1a of the canonical (events, frames) record. */
  readonly digest: string;
}

const frameOf = (state: HunterRunState): HunterRunFrame => ({
  tick: state.tick,
  cell: state.cell,
  invulnerable: state.invulnerable,
  hunterCells: state.hunters.map(hunterCell)
});

const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const finish = (final: HunterRunState, events: readonly HunterRunEvent[], frames: readonly HunterRunFrame[]): HunterRunResult => ({
  contract: HUNTER_RUN_CONTRACT,
  reachedGoal: final.reachedGoal,
  ticks: final.tick,
  contacts: final.contacts,
  hunterContacts: final.hunters.map((hunter) => hunter.contacts),
  burnouts: final.burnouts,
  clean: final.reachedGoal && final.contacts === 0,
  events,
  frames,
  digest: fnv1a(stableStringify({ events, frames }))
});

/** Replays an input log from tick 0. Actions after the goal are ignored. */
export const replayHunterRun = (context: HunterRunContext, log: HunterInputLog): HunterRunResult => {
  let state = createHunterRunState(context);
  const events: HunterRunEvent[] = [];
  const frames: HunterRunFrame[] = [frameOf(state)];
  for (const action of log.actions) {
    if (state.reachedGoal) {
      break;
    }
    const step = stepHunterRun(context, state, action);
    state = step.state;
    events.push(...step.events);
    frames.push(frameOf(state));
  }
  return finish(state, events, frames);
};

/** A controller that picks the next action from the live state (bots, tests). */
export type HunterRunPolicy = (state: HunterRunState, context: HunterRunContext) => HazardAction;

/**
 * Plays a level live with `policy`, recording the input log as it goes. The run
 * stops at the goal or after `maxTicks`. `replayHunterRun(context, log)` must
 * reproduce `result` exactly (the replay-determinism contract).
 */
export const playHunterRun = (
  context: HunterRunContext,
  policy: HunterRunPolicy,
  maxTicks: number
): { readonly result: HunterRunResult; readonly log: HunterInputLog } => {
  let state = createHunterRunState(context);
  const actions: HazardAction[] = [];
  const events: HunterRunEvent[] = [];
  const frames: HunterRunFrame[] = [frameOf(state)];
  while (!state.reachedGoal && state.tick < maxTicks) {
    const action = policy(state, context);
    actions.push(action);
    const step = stepHunterRun(context, state, action);
    state = step.state;
    events.push(...step.events);
    frames.push(frameOf(state));
  }
  return { result: finish(state, events, frames), log: { contract: HUNTER_INPUT_LOG_CONTRACT, actions } };
};
