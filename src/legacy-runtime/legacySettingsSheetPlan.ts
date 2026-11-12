/**
 * One settings view model + pure layout plan for BOTH settings surfaces.
 *
 * Owner decision (Zac, 2026-11-06): the in-game Pause > Settings look is
 * canonical; the main-menu Settings sheet must have the same structure. This
 * module is that structure: one row vocabulary, one set of sizes, one layout
 * routine. The two contexts differ only in
 *   - the card title            ('Paused' | 'Settings'),
 *   - the context actions       (pause: Resume above, Quit to Menu below;
 *                                menu: Back to Menu above, Account section
 *                                with Reset progress and Sign out),
 *   - the exit                  (pause: the primary Resume row; menu: the
 *                                primary Back to Menu row in the same slot).
 *                                Neither sheet draws a Close pill, an X or a
 *                                back arrow: the primary top row IS the exit.
 *   - whether the Settings group is a collapsed disclosure (pause) or the
 *     always-open body (menu).
 * Everything inside the Settings group (How to play, Display heading, Board
 * Trail Fade, Trail Shine, Animated Background, Reduce Motion + its note) is the SAME row spec
 * with the SAME geometry, so the surfaces cannot drift apart again.
 *
 * Pure: no Phaser, no DOM, no storage, no network, no wiring. A later lane
 * paints this plan from MenuScene (replacing buildOptionsOverlay's body and
 * the row geometry in createFeatureControlRows / buildPauseOverlay). See
 * docs/ui/MAZER-SETTINGS-SHEET-SPEC-2026-11-06.md for the exact MenuScene
 * lines to replace.
 *
 * Sizes are design-token terms: hit targets come from
 * designTokens.touchTargetMinPx (44), gaps/padding from the spacingPx scale
 * (4 8 12 16 20 24 32 48 64), font sizes from legacy.fontSizePx
 * (body 14, label 16, small 13). No font in a plan row is ever below the
 * `body` token for labels; the plan wraps instead of shrinking.
 */
import {
  REDUCED_MOTION_SETTING_LABEL,
  REDUCED_MOTION_SETTING_NOTE,
  REDUCED_MOTION_SETTING_OFF_LABEL,
  REDUCED_MOTION_SETTING_ON_LABEL
} from '../render/reducedMotion';
import { designTokens } from '../theme/tokens';
import { LEGACY_ROTATE_PROMPT_LABEL } from './legacyOrientationFlip';
import { LEGACY_QUIT_CONFIRM_ARMED_LABEL } from './legacyQuitConfirm';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  LEGACY_UI_MIN_TOUCH_TARGET,
  resolveLegacyOverlayPanelLayout,
  type LegacyOverlayPanelLayout
} from './legacyUiStandards';

export type LegacySettingsContext = 'menu' | 'pause';

/** Setting keys the scene already persists (legacyOverlayToggleFields). */
export type LegacySettingsToggleKey =
  | 'toggleTrailFade'
  | 'toggleTrailPulse'
  | 'toggleAnimatedBackdrop'
  | 'toggleReducedMotion'
  | 'hapticsEnabled';

export type LegacySettingsRowId =
  | 'rotate-notice'
  | 'resume'
  | 'back-to-menu'
  | 'settings-disclosure'
  | 'how-to-play'
  | 'display-heading'
  | 'trail-fade'
  | 'trail-shine'
  | 'animated-background'
  | 'reduce-motion'
  | 'reduce-motion-note'
  | 'haptics'
  | 'account-heading'
  | 'reset-progress'
  | 'sign-out'
  | 'quit-to-menu'
  | 'preview-next'
  | 'preview-prev'
  | 'preview-jump-disclosure'
  | `preview-jump-${number}`;

export type LegacySettingsRowKind =
  | 'action'
  | 'disclosure'
  | 'nav'
  | 'heading'
  | 'note'
  | 'toggle';

export type LegacySettingsEmphasis = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'danger-outline';

/** What a tap on a row does. The scene maps these to its existing handlers. */
export type LegacySettingsCommand =
  | { type: 'RESUME_RUN' }
  | { type: 'RETURN_HOME' }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'TOGGLE_SETTINGS_GROUP' }
  | { type: 'OPEN_GUIDE' }
  | { type: 'BEGIN_RESET_PROGRESS' }
  | { type: 'SIGN_OUT' }
  // Level Preview (dev/QA route ?previewLevel=N) only; never emitted by the default sheet.
  | { type: 'PREVIEW_JUMP'; level: number }
  | { type: 'TOGGLE_PREVIEW_LEVELS' };

export interface LegacySettingsRowModel {
  id: LegacySettingsRowId;
  kind: LegacySettingsRowKind;
  label: string;
  emphasis: LegacySettingsEmphasis | null;
  /** Tap command for action/nav/disclosure rows. Null for heading/toggle. */
  command: LegacySettingsCommand | null;
  /** Persisted setting this row edits (toggle only). */
  settingKey: LegacySettingsToggleKey | null;
  /** Toggle state words, pinned to today's copy (never merged into the label). */
  onLabel: string | null;
  offLabel: string | null;
  /** Extra vertical gap above this row, in px (spacing-scale value). Null = default for the section. */
  gapBefore: number | null;
}

export interface LegacySettingsSectionModel {
  id: 'pause-notice' | 'pause-top' | 'menu-top' | 'settings' | 'account' | 'pause-bottom' | 'preview' | 'preview-jump';
  /** Disclosure label (collapsible) or heading text. Null = no header. */
  title: string | null;
  collapsible: boolean;
  collapsedByDefault: boolean;
  rows: readonly LegacySettingsRowModel[];
}

export interface LegacySettingsSheetModel {
  context: LegacySettingsContext;
  /** Overlay id the scene routes on (pause is pinned; options is the existing menu id). */
  overlayId: 'pause' | 'options';
  title: 'Paused' | 'Settings';
  sections: readonly LegacySettingsSectionModel[];
}

export interface LegacySettingsLevelPreviewOptions {
  /** The level currently being previewed. */
  level: number;
  /** Jump-list levels. */
  checkpoints: readonly number[];
  /** Smallest / largest valid level (previous / next are omitted at the ends). */
  minLevel: number;
  maxLevel: number;
}

export interface LegacySettingsModelOptions {
  /** Menu only: whether a signed-in account exists (Sign out is shown only then). */
  signedIn?: boolean;
  /** Pause only: adds the Level Preview section (dev/QA route). Absent = default sheet, unchanged. */
  levelPreview?: LegacySettingsLevelPreviewOptions;
  /**
   * Pause only: the Quit to Menu row is armed (a move was made and the first
   * press already happened), so it reads "Tap again to quit". Absent/false =
   * the default "Quit to Menu" row. See legacyQuitConfirm.ts.
   */
  quitConfirmArmed?: boolean;
  /**
   * Pause only: an orientation flip paused the run and the refit corridor is
   * too thin, so a non-interactive "Rotate back" notice leads the sheet
   * (legacyOrientationFlip.ts). Absent/false = default sheet, unchanged.
   */
  rotatePrompt?: boolean;
}

/* ------------------------------------------------------------------ */
/* Row vocabulary (shared by both contexts)                            */
/* ------------------------------------------------------------------ */

const row = (
  id: LegacySettingsRowId,
  kind: LegacySettingsRowKind,
  label: string,
  extra: Partial<Omit<LegacySettingsRowModel, 'id' | 'kind' | 'label'>> = {}
): LegacySettingsRowModel => Object.freeze({
  command: null,
  emphasis: null,
  gapBefore: null,
  offLabel: null,
  onLabel: null,
  settingKey: null,
  ...extra,
  id,
  kind,
  label
});

/**
 * The Settings group. IDENTICAL object list in both contexts. Labels and
 * state words are today's shipping copy (createFeatureControlRows).
 */
export const LEGACY_SETTINGS_GROUP_ROWS: readonly LegacySettingsRowModel[] = Object.freeze([
  row('how-to-play', 'nav', 'How to play', { command: { type: 'OPEN_GUIDE' }, emphasis: 'secondary' }),
  row('display-heading', 'heading', 'Display'),
  row('trail-fade', 'toggle', 'Trail Fade', { offLabel: 'Off', onLabel: 'On', settingKey: 'toggleTrailFade' }),
  row('trail-shine', 'toggle', 'Trail Shine', { offLabel: 'Off', onLabel: 'On', settingKey: 'toggleTrailPulse' }),
  row('animated-background', 'toggle', 'Animated Background', {
    offLabel: 'Still',
    onLabel: 'Animated',
    settingKey: 'toggleAnimatedBackdrop'
  }),
  row('reduce-motion', 'toggle', REDUCED_MOTION_SETTING_LABEL, {
    offLabel: REDUCED_MOTION_SETTING_OFF_LABEL,
    onLabel: REDUCED_MOTION_SETTING_ON_LABEL,
    settingKey: 'toggleReducedMotion'
  }),
  row('reduce-motion-note', 'note', REDUCED_MOTION_SETTING_NOTE),
  // Vibration on phones that support it (not iOS Safari: no navigator.vibrate there, so the row changes nothing).
  row('haptics', 'toggle', 'Haptics', { offLabel: 'Off', onLabel: 'On', settingKey: 'hapticsEnabled' })
]);

/** Separation between Reset progress and Sign out (spacing token 24). */
export const LEGACY_SETTINGS_DANGER_SEPARATION = 24;

export const buildLegacySettingsSheetModel = (
  context: LegacySettingsContext,
  options: LegacySettingsModelOptions = {}
): LegacySettingsSheetModel => {
  if (context === 'pause') {
    const preview = options.levelPreview;
    const previewSections: LegacySettingsSectionModel[] = preview === undefined ? [] : [
      {
        collapsedByDefault: false,
        collapsible: false,
        id: 'preview',
        rows: [
          row('preview-next', 'action', `Next level (L${Math.min(preview.maxLevel, preview.level + 1)})`, {
            command: { type: 'PREVIEW_JUMP', level: Math.min(preview.maxLevel, preview.level + 1) },
            emphasis: 'secondary'
          }),
          ...(preview.level > preview.minLevel
            ? [row('preview-prev', 'action', `Previous level (L${preview.level - 1})`, {
              command: { type: 'PREVIEW_JUMP', level: preview.level - 1 },
              emphasis: 'secondary'
            })]
            : [])
        ],
        title: `Level preview L${preview.level}`
      },
      {
        collapsedByDefault: true,
        collapsible: true,
        id: 'preview-jump',
        rows: preview.checkpoints.map((level) => row(`preview-jump-${level}`, 'action', `Level ${level}`, {
          command: { type: 'PREVIEW_JUMP', level },
          emphasis: level === preview.level ? 'primary' : 'tertiary'
        })),
        title: 'Jump to level'
      }
    ];
    return {
      context,
      overlayId: 'pause',
      sections: [
        ...(options.rotatePrompt === true
          ? [{
            collapsedByDefault: false,
            collapsible: false,
            id: 'pause-notice' as const,
            rows: [row('rotate-notice', 'heading', LEGACY_ROTATE_PROMPT_LABEL)],
            title: null
          }]
          : []),
        {
          collapsedByDefault: false,
          collapsible: false,
          id: 'pause-top',
          rows: [row('resume', 'action', 'Resume', { command: { type: 'RESUME_RUN' }, emphasis: 'primary' })],
          title: null
        },
        ...previewSections,
        {
          collapsedByDefault: true,
          collapsible: true,
          id: 'settings',
          rows: LEGACY_SETTINGS_GROUP_ROWS,
          title: 'Settings'
        },
        {
          collapsedByDefault: false,
          collapsible: false,
          id: 'pause-bottom',
          rows: [options.quitConfirmArmed === true
            ? row('quit-to-menu', 'action', LEGACY_QUIT_CONFIRM_ARMED_LABEL, {
              command: { type: 'RETURN_HOME' },
              emphasis: 'danger-outline'
            })
            : row('quit-to-menu', 'action', 'Quit to Menu', {
              command: { type: 'RETURN_HOME' },
              emphasis: 'tertiary'
            })],
          title: null
        }
      ],
      title: 'Paused'
    };
  }

  const accountRows: LegacySettingsRowModel[] = [
    row('reset-progress', 'action', 'Reset progress', {
      command: { type: 'BEGIN_RESET_PROGRESS' },
      emphasis: 'danger-outline'
    })
  ];
  if (options.signedIn === true) {
    accountRows.push(row('sign-out', 'action', 'Sign out', {
      command: { type: 'SIGN_OUT' },
      emphasis: 'danger',
      gapBefore: LEGACY_SETTINGS_DANGER_SEPARATION
    }));
  }

  return {
    context,
    overlayId: 'options',
    sections: [
      {
        collapsedByDefault: false,
        collapsible: false,
        id: 'menu-top',
        rows: [row('back-to-menu', 'action', 'Back to Menu', {
          command: { type: 'CLOSE_OVERLAY' },
          emphasis: 'primary'
        })],
        title: null
      },
      {
        collapsedByDefault: false,
        collapsible: false,
        id: 'settings',
        rows: LEGACY_SETTINGS_GROUP_ROWS,
        title: null
      },
      {
        collapsedByDefault: false,
        collapsible: false,
        id: 'account',
        rows: accountRows,
        title: 'Account'
      }
    ],
    title: 'Settings'
  };
};

/* ------------------------------------------------------------------ */
/* Token-term sizes                                                    */
/* ------------------------------------------------------------------ */

const SPACING = designTokens.spacingPx; // [4, 8, 12, 16, 20, 24, 32, 48, 64]
const FONT = designTokens.legacy.fontSizePx;

export const LEGACY_SETTINGS_SIZES = Object.freeze({
  /** Action / disclosure / nav button height. >= touchTargetMinPx. */
  actionHeight: 48,
  /** Gap between consecutive rows inside a group (spacing token 8). */
  rowGap: SPACING[1] ?? 8,
  /** Gap between sections (spacing token 12). */
  sectionGap: SPACING[2] ?? 12,
  /** Toggle / nav row height. */
  rowHeight: 52,
  /** Non-interactive heading row. */
  headingHeight: 24,
  /** Non-interactive wrapped helper note under a toggle (13 px, up to 5 lines at the compact card width). */
  noteHeight: 88,
  noteLineHeight: 17,
  noteMaxLines: 5,
  /** Switch graphic (the whole row is the hit target). */
  switchHeight: 24,
  switchWidth: LEGACY_UI_MIN_TOUCH_TARGET,
  /** Inner row padding (spacing token 16). */
  rowPadding: SPACING[3] ?? 16,
  /** State text column ("On", "Animated") width. */
  stateWidth: 64,
  /** Gap between label / state / switch columns (spacing token 8). */
  columnGap: SPACING[1] ?? 8,
  /** Row label font (legacy.fontSizePx.label = 16), floor = body (14). */
  labelFontSize: FONT.label,
  labelMinFontSize: FONT.body,
  labelMaxLines: 2,
  labelLineHeight: 20,
  /** State word font (legacy.fontSizePx.small = 13). */
  stateFontSize: FONT.small,
  headingFontSize: FONT.small,
  /** Title: pause card literal today (24 compact, 34 regular); not a token. */
  titleFontSizeCompact: 24,
  titleFontSizeRegular: 34,
  titleHeightCompact: 40,
  titleHeightRegular: 46,
  titleGapCompact: 14,
  titleGapRegular: 16,
  cardPaddingCompact: 20,
  cardPaddingRegular: 24,
  /**
   * The scroll rail is drawn this far to the right of the body viewport, in the
   * card's own padding, so rows keep the full inner width while scrolling.
   * Must stay smaller than the compact card padding (20).
   */
  scrollRailOverhang: 14
});

export interface LegacySettingsRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface LegacySettingsRowParts {
  /** Left column; wraps up to labelMaxLines, never shrinks below labelMinFontSize. */
  label: LegacySettingsRect;
  /** Toggle only: state word column ("On"), its own element, never merged into the label. */
  state: LegacySettingsRect | null;
  /** Toggle only: switch graphic. */
  switchControl: LegacySettingsRect | null;
  /** Nav/disclosure only: trailing chevron slot. */
  chevron: LegacySettingsRect | null;
}

export interface LegacySettingsPlanItem {
  model: LegacySettingsRowModel;
  /** Row rect in card-body content space (scroll offset 0). */
  rect: LegacySettingsRect;
  interactive: boolean;
  parts: LegacySettingsRowParts;
  labelFontSize: number;
  labelMaxLines: number;
  stateFontSize: number;
}

export interface LegacySettingsSheetPlan {
  model: LegacySettingsSheetModel;
  compact: boolean;
  panel: LegacyOverlayPanelLayout;
  card: LegacySettingsRect;
  cardPadding: number;
  title: { centerX: number; centerY: number; fontSize: number; text: string };
  /** Visible, scrollable body window inside the card (screen space). */
  bodyViewport: LegacySettingsRect;
  /** Viewport handed to the scroll-rail metrics: the body window widened so the rail sits in the card padding. */
  scrollRailViewport: LegacySettingsRect;
  /** Items in body-content space: screen y = bodyViewport.top + item.rect.top - scrollOffset. */
  items: readonly LegacySettingsPlanItem[];
  contentHeight: number;
  scrollable: boolean;
  maxScrollOffset: number;
  /** Natural (unclipped) card height. */
  naturalCardHeight: number;
  availableHeight: number;
  /** Whether the Settings group rows are currently laid out. */
  settingsExpanded: boolean;
  /** Whether the Level Preview jump list is currently laid out. */
  previewLevelsExpanded: boolean;
}

export interface LegacySettingsPlanInput {
  context: LegacySettingsContext;
  height: number;
  width: number;
  safeArea?: { bottom?: number; top?: number };
  /** Menu only. */
  signedIn?: boolean;
  /** Pause only: whether the Settings disclosure is open. Menu is always open. */
  settingsExpanded?: boolean;
  /** Pause only: Level Preview section (dev/QA route). Absent = default sheet. */
  levelPreview?: LegacySettingsLevelPreviewOptions;
  /** Pause + levelPreview only: whether the Jump to level disclosure is open. */
  previewLevelsExpanded?: boolean;
  /** Pause only: the Quit to Menu row is armed and reads "Tap again to quit". */
  quitConfirmArmed?: boolean;
  /** Pause only: lead with the "Rotate back" notice (orientation flip + thin corridor). */
  rotatePrompt?: boolean;
}

const rectOf = (left: number, top: number, width: number, height: number): LegacySettingsRect => ({
  height,
  left,
  top,
  width
});

const rowHeightOf = (model: LegacySettingsRowModel): number => {
  switch (model.kind) {
    case 'action':
    case 'disclosure':
      return LEGACY_SETTINGS_SIZES.actionHeight;
    case 'nav':
    case 'toggle':
      return LEGACY_SETTINGS_SIZES.rowHeight;
    case 'heading':
      return LEGACY_SETTINGS_SIZES.headingHeight;
    case 'note':
      return LEGACY_SETTINGS_SIZES.noteHeight;
    default:
      return model.kind satisfies never;
  }
};

const isInteractiveKind = (kind: LegacySettingsRowKind): boolean => kind !== 'heading' && kind !== 'note';

/** Inner part layout of one row, relative to the row's own rect (left/top are ROW-LOCAL). */
const resolveRowParts = (model: LegacySettingsRowModel, width: number, height: number): LegacySettingsRowParts => {
  const s = LEGACY_SETTINGS_SIZES;
  const pad = s.rowPadding;
  const none: LegacySettingsRowParts = { chevron: null, label: rectOf(0, 0, width, height), state: null, switchControl: null };

  switch (model.kind) {
    case 'toggle': {
      const switchLeft = width - pad - s.switchWidth;
      const stateLeft = switchLeft - s.columnGap - s.stateWidth;
      const labelWidth = Math.max(1, stateLeft - s.columnGap - pad);
      return {
        chevron: null,
        label: rectOf(pad, 0, labelWidth, height),
        state: rectOf(stateLeft, 0, s.stateWidth, height),
        switchControl: rectOf(switchLeft, Math.round((height - s.switchHeight) / 2), s.switchWidth, s.switchHeight)
      };
    }
    case 'nav':
    case 'disclosure': {
      const chevronSize = 24;
      const chevronLeft = width - pad - chevronSize;
      return {
        chevron: rectOf(chevronLeft, Math.round((height - chevronSize) / 2), chevronSize, chevronSize),
        label: rectOf(pad, 0, Math.max(1, chevronLeft - s.columnGap - pad), height),
        state: null,
        switchControl: null
      };
    }
    case 'action':
    case 'heading':
    case 'note':
      return { ...none, label: rectOf(pad, 0, Math.max(1, width - (pad * 2)), height) };
    default:
      return model.kind satisfies never;
  }
};

/**
 * Flattened row list for a model. Pause: Resume, Settings disclosure (and,
 * when expanded, the group rows), Quit to Menu. Menu: Back to Menu (same slot
 * and size as Resume), the group rows (always open), then the Account heading
 * and its rows.
 */
const flattenRows = (
  model: LegacySettingsSheetModel,
  settingsExpanded: boolean,
  previewLevelsExpanded: boolean
): Array<{ gapBefore: number; row: LegacySettingsRowModel }> => {
  const s = LEGACY_SETTINGS_SIZES;
  const out: Array<{ gapBefore: number; row: LegacySettingsRowModel }> = [];
  const push = (r: LegacySettingsRowModel, defaultGap: number): void => {
    out.push({ gapBefore: out.length === 0 ? 0 : (r.gapBefore ?? defaultGap), row: r });
  };

  for (const section of model.sections) {
    const sectionGap = s.sectionGap;
    if (section.collapsible && section.title !== null) {
      const isPreviewJump = section.id === 'preview-jump';
      push(row(isPreviewJump ? 'preview-jump-disclosure' : 'settings-disclosure', 'disclosure', section.title, {
        command: isPreviewJump ? { type: 'TOGGLE_PREVIEW_LEVELS' } : { type: 'TOGGLE_SETTINGS_GROUP' },
        emphasis: 'secondary'
      }), sectionGap);
      if (!(isPreviewJump ? previewLevelsExpanded : settingsExpanded)) {
        continue;
      }
      section.rows.forEach((r, index) => push(r, index === 0 ? sectionGap : s.rowGap));
      continue;
    }
    if (section.title !== null) {
      push(row('account-heading', 'heading', section.title), sectionGap + s.rowGap);
    }
    section.rows.forEach((r, index) => {
      // First row of an un-headed section follows the previous section; after a heading it is a normal row gap.
      const afterHeading = index === 0 && section.title !== null;
      push(r, index === 0 && !afterHeading ? sectionGap : s.rowGap);
    });
  }
  return out;
};

export const buildLegacySettingsSheetPlan = (input: LegacySettingsPlanInput): LegacySettingsSheetPlan => {
  const s = LEGACY_SETTINGS_SIZES;
  const model = buildLegacySettingsSheetModel(input.context, {
    levelPreview: input.context === 'pause' ? input.levelPreview : undefined,
    quitConfirmArmed: input.context === 'pause' ? input.quitConfirmArmed : undefined,
    rotatePrompt: input.context === 'pause' ? input.rotatePrompt : undefined,
    signedIn: input.signedIn
  });
  const panel = resolveLegacyOverlayPanelLayout(input.width, input.height, input.safeArea ?? {});
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
  const settingsExpanded = input.context === 'menu' ? true : input.settingsExpanded === true;

  const cardPadding = compact ? s.cardPaddingCompact : s.cardPaddingRegular;
  const titleHeight = compact ? s.titleHeightCompact : s.titleHeightRegular;
  const titleGap = compact ? s.titleGapCompact : s.titleGapRegular;
  const cardWidth = Math.min(compact ? 360 : 400, Math.max(1, panel.width - (compact ? 16 : 48)));
  const innerWidth = Math.max(1, cardWidth - (cardPadding * 2));

  const previewLevelsExpanded = input.context === 'pause'
    && input.levelPreview !== undefined
    && input.previewLevelsExpanded === true;
  const flat = flattenRows(model, settingsExpanded, previewLevelsExpanded);
  const layoutItems = (rowWidth: number): { contentHeight: number; items: LegacySettingsPlanItem[] } => {
    let cursor = 0;
    const laidOut = flat.map(({ gapBefore, row: rowModel }): LegacySettingsPlanItem => {
      const height = rowHeightOf(rowModel);
      cursor += gapBefore;
      const rect = rectOf(0, cursor, rowWidth, height);
      cursor += height;
      return {
        interactive: isInteractiveKind(rowModel.kind),
        labelFontSize: s.labelFontSize,
        labelMaxLines: rowModel.kind === 'heading' ? 1 : rowModel.kind === 'note' ? s.noteMaxLines : s.labelMaxLines,
        model: rowModel,
        parts: resolveRowParts(rowModel, rowWidth, height),
        rect,
        stateFontSize: s.stateFontSize
      };
    });
    return { contentHeight: cursor, items: laidOut };
  };
  const layout = layoutItems(innerWidth);
  const contentHeight = layout.contentHeight;

  // No header reserve: there is no Close pill above the card any more, so the card
  // gets the whole panel height and is centred in it (the panel already carries the
  // 8/16 px viewport inset plus the safe area).
  const availableHeight = Math.max(1, panel.height);
  const chrome = (cardPadding * 2) + titleHeight + titleGap;
  const naturalCardHeight = chrome + contentHeight;
  const cardHeight = Math.min(naturalCardHeight, availableHeight);
  const cardTop = Math.round(panel.top + ((availableHeight - cardHeight) / 2));
  const cardLeft = Math.round(panel.centerX - (cardWidth / 2));

  const bodyTop = cardTop + cardPadding + titleHeight + titleGap;
  const bodyHeight = Math.max(0, cardHeight - chrome);
  const scrollable = contentHeight > bodyHeight;
  const items = layout.items;

  return {
    availableHeight,
    bodyViewport: rectOf(cardLeft + cardPadding, bodyTop, innerWidth, bodyHeight),
    scrollRailViewport: rectOf(cardLeft + cardPadding, bodyTop, innerWidth + s.scrollRailOverhang, bodyHeight),
    card: rectOf(cardLeft, cardTop, cardWidth, cardHeight),
    cardPadding,
    compact,
    contentHeight,
    items,
    maxScrollOffset: Math.max(0, contentHeight - bodyHeight),
    model,
    naturalCardHeight,
    panel,
    scrollable,
    previewLevelsExpanded,
    settingsExpanded,
    title: {
      centerX: panel.centerX,
      centerY: cardTop + cardPadding + Math.round(titleHeight / 2),
      fontSize: compact ? s.titleFontSizeCompact : s.titleFontSizeRegular,
      text: model.title
    }
  };
};

/** Screen-space rect of an item for a given scroll offset (clamped by the caller). */
export const resolveLegacySettingsItemScreenRect = (
  plan: LegacySettingsSheetPlan,
  item: LegacySettingsPlanItem,
  scrollOffset = 0
): LegacySettingsRect => {
  const offset = Math.min(plan.maxScrollOffset, Math.max(0, scrollOffset));
  return rectOf(
    plan.bodyViewport.left + item.rect.left,
    plan.bodyViewport.top + item.rect.top - offset,
    item.rect.width,
    item.rect.height
  );
};

/** Whether an item is fully inside the body viewport at a scroll offset (drawable and tappable). */
export const isLegacySettingsItemFullyVisible = (
  plan: LegacySettingsSheetPlan,
  item: LegacySettingsPlanItem,
  scrollOffset = 0
): boolean => {
  const rect = resolveLegacySettingsItemScreenRect(plan, item, scrollOffset);
  return rect.top >= plan.bodyViewport.top
    && rect.top + rect.height <= plan.bodyViewport.top + plan.bodyViewport.height;
};

/** Viewports every plan must hold at (the audit set). */
export const LEGACY_SETTINGS_PLAN_VIEWPORTS: ReadonlyArray<{ height: number; width: number }> = Object.freeze([
  { height: 568, width: 320 },
  { height: 844, width: 390 },
  { height: 720, width: 1280 }
]);
