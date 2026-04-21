import type {
  IntentAnchor,
  IntentCategory,
  IntentImportance,
  IntentKind,
  IntentSpeaker
} from '../intent/IntentEvent';

export interface PlaybookIntentReference {
  id: string;
  label: string;
  cue?: string;
}

export interface PlaybookIntentState {
  currentTileId: string;
  currentTileLabel: string;
  targetTileId: string | null;
  targetTileLabel: string | null;
  targetKind: 'frontier' | 'goal' | 'backtrack' | 'idle';
  goalVisible: boolean;
  frontierCount?: number;
  backtrackCount?: number;
  traversedConnectorId: string | null;
  traversedConnectorLabel: string | null;
}

export interface PlaybookIntentSummary {
  speaker: IntentSpeaker;
  kind: IntentKind;
  category: IntentCategory;
  importance: IntentImportance;
  summary: string;
  confidence: number;
  anchor?: IntentAnchor;
}

export interface PlaybookIntentSummaryInput {
  kind: IntentKind;
  state: PlaybookIntentState;
  cue?: string | null;
  landmark?: PlaybookIntentReference | null;
  aggressiveMode?: boolean;
}

const normalizeLabel = (value: string | null | undefined, fallback: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  return value.trim();
};

const normalizeCue = (value: string | null | undefined): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const resolveFrontierThought = (targetLabel: string): string => {
  const normalized = normalizeCue(targetLabel);
  if (normalized.includes('west') || normalized.includes('left')) {
    return 'Left looks better.';
  }
  if (normalized.includes('east') || normalized.includes('right')) {
    return 'Right looks better.';
  }
  if (normalized.includes('north') || normalized.includes('up')) {
    return 'Up looks better.';
  }
  if (normalized.includes('south') || normalized.includes('down')) {
    return 'Down looks better.';
  }

  return 'This side looks better.';
};

const buildRunnerAnchor = (
  state: PlaybookIntentState,
  fallbackKind: Extract<IntentAnchor['kind'], 'tile' | 'objective'> = 'tile'
): IntentAnchor => {
  if (state.traversedConnectorId) {
    return {
      kind: 'connector',
      connectorId: state.traversedConnectorId
    };
  }

  if (state.goalVisible && state.targetTileId) {
    return {
      kind: 'objective',
      tileId: state.targetTileId
    };
  }

  if (state.targetTileId) {
    return {
      kind: fallbackKind,
      tileId: state.targetTileId
    };
  }

  return {
    kind: 'tile',
    tileId: state.currentTileId
  };
};

export class PlaybookIntentTemplates {
  summarizeIntent(input: PlaybookIntentSummaryInput): PlaybookIntentSummary {
    const targetLabel = normalizeLabel(input.state.targetTileLabel, 'the next frontier');
    const aggressiveMode = input.aggressiveMode === true;

    switch (input.kind) {
      case 'goal-observed':
        return {
          speaker: 'Runner',
          kind: 'goal-observed',
          category: 'goal',
          importance: 'high',
          summary: 'I can see the exit.',
          confidence: 0.99,
          anchor: {
            kind: 'objective',
            tileId: input.state.targetTileId
          }
        };
      case 'enemy-seen':
        return {
          speaker: 'Warden',
          kind: 'enemy-seen',
          category: 'danger',
          importance: 'high',
          summary: 'That patrol is too close.',
          confidence: 0.86,
          anchor: {
            kind: 'tile',
            tileId: input.state.currentTileId
          }
        };
      case 'trap-inferred':
        return {
          speaker: 'TrapNet',
          kind: 'trap-inferred',
          category: 'danger',
          importance: 'high',
          summary: 'That timing looks bad.',
          confidence: 0.78,
          anchor: {
            kind: 'tile',
            tileId: input.state.currentTileId
          }
        };
      case 'item-spotted':
        return {
          speaker: 'Inventory',
          kind: 'item-spotted',
          category: 'item',
          importance: 'medium',
          summary: 'There might be something here.',
          confidence: 0.74,
          anchor: {
            kind: 'tile',
            tileId: input.state.currentTileId
          }
        };
      case 'puzzle-state-observed':
        return {
          speaker: 'Puzzle',
          kind: 'puzzle-state-observed',
          category: 'infer',
          importance: 'medium',
          summary: 'Wait. Not yet.',
          confidence: 0.72,
          anchor: {
            kind: 'tile',
            tileId: input.state.currentTileId
          }
        };
      case 'dead-end-confirmed':
        {
          return {
            speaker: 'Runner',
            kind: 'dead-end-confirmed',
            category: 'infer',
            importance: 'medium',
            summary: 'Dead end. Back up.',
            confidence: 0.89
          };
        }
      case 'landmark-spotted':
      {
        const landmarkCue = normalizeCue(input.landmark?.cue);
        const landmarkLabel = normalizeCue(input.landmark?.label);
        const summary = landmarkCue.includes('junction')
          ? 'This looks closer.'
          : landmarkCue.includes('gate')
            ? 'Wait. The gate will open.'
            : landmarkCue.includes('hazard')
              ? 'That timing looks bad.'
              : landmarkCue.includes('key') || landmarkCue.includes('item')
                ? 'There might be something here.'
                : landmarkCue.includes('pressure') || landmarkCue.includes('door')
                  ? 'That part does something.'
                  : landmarkLabel.includes('junction')
                    ? 'This looks closer.'
                    : landmarkLabel.includes('exit')
                      ? 'I can see the exit.'
                      : 'This spot looks useful.';
        return {
          speaker: 'Runner',
          kind: 'landmark-spotted',
          category: 'observe',
          importance: 'medium',
          summary,
          confidence: 0.68,
          anchor: {
            kind: 'landmark',
            landmarkId: input.landmark?.id
          }
        };
      }
      case 'replan-triggered':
        return {
          speaker: 'Runner',
          kind: 'replan-triggered',
          category: 'replan',
          importance: 'medium',
          summary: 'That path wasted time.',
          confidence: 0.79,
          anchor: aggressiveMode ? buildRunnerAnchor(input.state) : undefined
        };
      case 'route-commitment-changed': {
        const goalCommit = input.state.targetKind === 'goal';
        return {
          speaker: 'Runner',
          kind: 'route-commitment-changed',
          category: goalCommit ? 'goal' : 'replan',
          importance: goalCommit ? 'high' : 'medium',
          summary: goalCommit
            ? 'I am close. Keep going.'
            : 'I am closer this way.',
          confidence: goalCommit ? 0.91 : 0.73,
          anchor: aggressiveMode
            ? buildRunnerAnchor(input.state, goalCommit ? 'objective' : 'tile')
            : undefined
        };
      }
      case 'gate-aligned':
        return {
          speaker: 'Puzzle',
          kind: 'gate-aligned',
          category: 'observe',
          importance: 'medium',
          summary: 'Wait. The gate will open.',
          confidence: 0.83,
          anchor: {
            kind: 'connector',
            connectorId: input.state.traversedConnectorId
          }
        };
      case 'frontier-chosen':
        return {
          speaker: 'Runner',
          kind: 'frontier-chosen',
          category: 'observe',
          importance: 'low',
          summary: resolveFrontierThought(targetLabel),
          confidence: 0.61,
          anchor: aggressiveMode ? buildRunnerAnchor(input.state) : undefined
        };
    }
  }
}
