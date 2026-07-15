import { WorldTurnSystem } from './WorldTurnSystem';
import type {
  WorldTurnHandlers,
  WorldTurnHostCommand,
  WorldTurnHostDiagnostics,
  WorldTurnHostOptions,
  WorldTurnHostState,
  WorldTurnReceipt
} from './types';

export class WorldTurnHost {
  readonly #system: WorldTurnSystem;
  #state: WorldTurnHostState;

  constructor(handlers: WorldTurnHandlers, options: WorldTurnHostOptions = {}) {
    this.#state = options.initialState ?? 'running';
    this.#system = new WorldTurnSystem(handlers, {
      timedModeEnabled: options.timedModeEnabled
    });
  }

  advance(command: WorldTurnHostCommand): WorldTurnReceipt {
    return this.#system.advance({
      ...command,
      simulationPaused: this.#state !== 'running'
    });
  }

  getDiagnostics(): WorldTurnHostDiagnostics {
    return {
      ...this.#system.getDiagnostics(),
      state: this.#state
    };
  }

  setState(state: WorldTurnHostState): void {
    this.#state = state;
  }
}
