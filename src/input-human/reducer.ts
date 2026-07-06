import type {
  HumanInputAction,
  HumanInputActionKind,
  HumanInputSource
} from './actions.ts';

export interface HumanRunState {
  step: number;
  paused: boolean;
  attempt: number;
  thoughtsVisible: boolean;
  lastActionKind: HumanInputActionKind | null;
  lastActionSource: HumanInputSource | null;
  lastActionAtMs: number | null;
  movementCount: number;
}

export const createHumanRunState = (overrides: Partial<HumanRunState> = {}): HumanRunState => ({
  step: 0,
  paused: false,
  attempt: 1,
  thoughtsVisible: true,
  lastActionKind: null,
  lastActionSource: null,
  lastActionAtMs: null,
  movementCount: 0,
  ...overrides
});

export const applyHumanInputAction = (
  state: HumanRunState,
  action: HumanInputAction
): HumanRunState => {
  const nextState: HumanRunState = {
    ...state,
    step: state.step + 1,
    lastActionKind: action.kind,
    lastActionSource: action.source,
    lastActionAtMs: Number.isFinite(action.atMs) ? Math.max(0, Math.round(action.atMs ?? 0)) : state.lastActionAtMs
  };

  switch (action.kind) {
    case 'move_up':
    case 'move_up_right':
    case 'move_down':
    case 'move_down_right':
    case 'move_left':
    case 'move_down_left':
    case 'move_right':
    case 'move_up_left':
      return {
        ...nextState,
        movementCount: state.movementCount + 1
      };
    case 'pause':
      return {
        ...nextState,
        paused: !state.paused
      };
    case 'restart_attempt':
      return {
        ...nextState,
        paused: false,
        attempt: state.attempt + 1,
        movementCount: 0
      };
    case 'toggle_thoughts':
      return {
        ...nextState,
        thoughtsVisible: !state.thoughtsVisible
      };
    default:
      return nextState;
  }
};
