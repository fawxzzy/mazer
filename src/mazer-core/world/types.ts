export const WORLD_TURN_PHASES = [
  'player-movement',
  'enemy-movement',
  'projectile-movement',
  'pickups',
  'item-effects',
  'duration-expiry',
  'collisions'
] as const;

export type WorldTurnPhase = typeof WORLD_TURN_PHASES[number];

interface WorldTurnCommandBase {
  id: string;
  expectedTurn?: number;
  simulationPaused?: boolean;
}

export interface PlayerMoveTurnCommand extends WorldTurnCommandBase {
  kind: 'player-move';
  inputId: string;
}

export interface TimedModeTurnCommand extends WorldTurnCommandBase {
  kind: 'timed-mode-tick';
  tickId: string;
}

export type WorldTurnCommand = PlayerMoveTurnCommand | TimedModeTurnCommand;

export interface WorldTurnEventInput {
  type: string;
  entityId?: string | null;
  payload?: Readonly<Record<string, unknown>>;
}

export interface WorldTurnEvent extends WorldTurnEventInput {
  phase: WorldTurnPhase;
  sequence: number;
  turn: number;
}

export interface WorldTurnPhaseContext {
  command: Readonly<WorldTurnCommand>;
  phase: WorldTurnPhase;
  turn: number;
}

export interface WorldTurnPhaseResult {
  accepted?: boolean;
  events?: readonly WorldTurnEventInput[];
}

export type WorldTurnPhaseHandler = (
  context: Readonly<WorldTurnPhaseContext>
) => WorldTurnPhaseResult | void;

export type WorldTurnHandlers = Partial<Record<WorldTurnPhase, WorldTurnPhaseHandler>>;

export interface WorldTurnPhaseReceipt {
  phase: WorldTurnPhase;
  status: 'applied' | 'skipped' | 'rejected';
  eventCount: number;
}

export type WorldTurnRejectionReason =
  | 'duplicate-command'
  | 'expected-turn-mismatch'
  | 'invalid-command-id'
  | 'player-move-handler-missing'
  | 'player-move-rejected'
  | 'simulation-paused';

export interface WorldTurnReceipt {
  admitted: boolean;
  commandId: string;
  commandKind: WorldTurnCommand['kind'];
  events: readonly WorldTurnEvent[];
  nextTurn: number;
  phases: readonly WorldTurnPhaseReceipt[];
  reason: WorldTurnRejectionReason | null;
  turn: number | null;
}

export interface WorldTurnDiagnostics {
  acceptedTurnCount: number;
  lastCommandId: string | null;
  lastReceipt: WorldTurnReceipt | null;
  nextTurn: number;
  rejectedCommandCount: number;
}
