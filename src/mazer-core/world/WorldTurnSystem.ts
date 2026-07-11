import {
  WORLD_TURN_PHASES,
  type WorldTurnCommand,
  type WorldTurnDiagnostics,
  type WorldTurnEvent,
  type WorldTurnHandlers,
  type WorldTurnPhaseReceipt,
  type WorldTurnPhaseResult,
  type WorldTurnReceipt,
  type WorldTurnRejectionReason
} from './types';

const cloneReceipt = (receipt: WorldTurnReceipt): WorldTurnReceipt => structuredClone(receipt);

const normalizePhaseResult = (result: WorldTurnPhaseResult | void): WorldTurnPhaseResult => result ?? {};

export class WorldTurnSystem {
  readonly #processedCommandIds = new Set<string>();
  #nextTurn = 0;
  #acceptedTurnCount = 0;
  #rejectedCommandCount = 0;
  #lastReceipt: WorldTurnReceipt | null = null;

  constructor(private readonly handlers: WorldTurnHandlers) {}

  advance(command: WorldTurnCommand): WorldTurnReceipt {
    const commandId = command.id.trim();
    if (!commandId) {
      return this.#reject(command, 'invalid-command-id');
    }
    if (this.#processedCommandIds.has(commandId)) {
      return this.#reject(command, 'duplicate-command');
    }
    if (command.expectedTurn !== undefined && command.expectedTurn !== this.#nextTurn) {
      return this.#reject(command, 'expected-turn-mismatch');
    }
    if (command.simulationPaused === true) {
      return this.#reject(command, 'simulation-paused');
    }
    if (command.kind === 'player-move' && !this.handlers['player-movement']) {
      return this.#reject(command, 'player-move-handler-missing');
    }

    this.#processedCommandIds.add(commandId);
    const turn = this.#nextTurn;
    const events: WorldTurnEvent[] = [];
    const phases: WorldTurnPhaseReceipt[] = [];
    const stableCommand = structuredClone({ ...command, id: commandId });

    for (const phase of WORLD_TURN_PHASES) {
      const handler = this.handlers[phase];
      if (phase === 'player-movement' && command.kind === 'timed-mode-tick') {
        phases.push({ phase, status: 'skipped', eventCount: 0 });
        continue;
      }
      if (!handler) {
        phases.push({ phase, status: 'skipped', eventCount: 0 });
        continue;
      }

      const result = normalizePhaseResult(handler({ command: stableCommand, phase, turn }));
      if (phase === 'player-movement' && result.accepted !== true) {
        phases.push({ phase, status: 'rejected', eventCount: 0 });
        return this.#reject(command, 'player-move-rejected', phases);
      }

      const phaseEvents = (result.events ?? []).map((event, index) => ({
        ...structuredClone(event),
        phase,
        sequence: events.length + index,
        turn
      }));
      events.push(...phaseEvents);
      phases.push({ phase, status: 'applied', eventCount: phaseEvents.length });
    }

    this.#nextTurn += 1;
    this.#acceptedTurnCount += 1;
    const receipt: WorldTurnReceipt = {
      admitted: true,
      commandId,
      commandKind: command.kind,
      events,
      nextTurn: this.#nextTurn,
      phases,
      reason: null,
      turn
    };
    this.#lastReceipt = cloneReceipt(receipt);
    return cloneReceipt(receipt);
  }

  getDiagnostics(): WorldTurnDiagnostics {
    return {
      acceptedTurnCount: this.#acceptedTurnCount,
      lastCommandId: this.#lastReceipt?.commandId ?? null,
      lastReceipt: this.#lastReceipt ? cloneReceipt(this.#lastReceipt) : null,
      nextTurn: this.#nextTurn,
      rejectedCommandCount: this.#rejectedCommandCount
    };
  }

  #reject(
    command: WorldTurnCommand,
    reason: WorldTurnRejectionReason,
    phases: readonly WorldTurnPhaseReceipt[] = []
  ): WorldTurnReceipt {
    this.#rejectedCommandCount += 1;
    const receipt: WorldTurnReceipt = {
      admitted: false,
      commandId: command.id.trim(),
      commandKind: command.kind,
      events: [],
      nextTurn: this.#nextTurn,
      phases: phases.map((phase) => ({ ...phase })),
      reason,
      turn: null
    };
    this.#lastReceipt = cloneReceipt(receipt);
    return cloneReceipt(receipt);
  }
}
