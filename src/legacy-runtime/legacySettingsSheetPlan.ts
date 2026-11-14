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
 * Everything inside the Settings group (How to play, Display heading, Reduce
 * Motion, Haptics) is the SAME row spec with the SAME geometry, so the surfaces
 * cannot drift apart again.
 *
 * DESCRIPTION RULE (MAZER-UI-026): every SETTING row (each row of the Settings
 * group and of the Account section) is {label, control, description}. The
 * description is a short, plain-words, muted line under the row's control that
 * says what the row does and what happens on/off. It is a REQUIRED field of
 * `LegacySettingsSettingRowModel`, so a setting row cannot be added without one
 * (the type, `settingRow()` and the plan test all enforce it). Chrome rows (the
 * exits Resume / Back to Menu / Quit to Menu, disclosures, headings, the rotate
 * notice, the Level Preview jump rows) are not settings and carry none.
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
  | 'toggleReducedMotion'
  | 'hapticsEnabled';

export type LegacySettingsRowId =
  | 'rotate-notice'
  | 'resume'
  | 'back-to-menu'
  | 'settings-disclosure'
  | 'how-to-play'
  | 'reduce-motion'
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

interface LegacySettingsRowBase {
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

/** A row that edits or opens a setting: REQUIRES a plain-words description (see DESCRIPTION RULE above). */
export interface LegacySettingsSettingRowModel extends LegacySettingsRowBase {
  role: 'setting';
  /** Short muted line under the control: what the row does, what on/off means. Never empty. */
  description: string;
}

/** Sheet chrome (exits, disclosures, headings, notices, preview jumps): not a setting, no description. */
export interface LegacySettingsChromeRowModel extends LegacySettingsRowBase {
  role: 'chrome';
  description: null;
}

export type LegacySettingsRowModel = LegacySettingsSettingRowModel | LegacySettingsChromeRowModel;

interface LegacySettingsSectionBase {
  /** Disclosure label (collapsible) or heading text. Null = no header. */
  title: string | null;
  collapsible: boolean;
  collapsedByDefault: boolean;
}

/** The Settings group and the Account section can only hold setting rows, so only described rows. */
export interface LegacySettingsSettingSectionModel extends LegacySettingsSectionBase {
  id: 'settings' | 'account';
  rows: readonly LegacySettingsSettingRowModel[];
}

export interface LegacySettingsChromeSectionModel extends LegacySettingsSectionBase {
  id: 'pause-notice' | 'pause-top' | 'menu-top' | 'pause-bottom' | 'preview' | 'preview-jump';
  rows: readonly LegacySettingsChromeRowModel[];
}

export type LegacySettingsSectionModel = LegacySettingsSettingSectionModel | LegacySettingsChromeSectionModel;

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

type LegacySettingsRowExtra = Partial<Omit<LegacySettingsRowBase, 'id' | 'kind' | 'label'>>;

/** Sheet chrome row (no description). Settings use `settingRow`. */
const row = (
  id: LegacySettingsRowId,
  kind: LegacySettingsRowKind,
  label: string,
  extra: LegacySettingsRowExtra = {}
): LegacySettingsChromeRowModel => Object.freeze({
  command: null,
  emphasis: null,
  gapBefore: null,
  offLabel: null,
  onLabel: null,
  settingKey: null,
  ...extra,
  description: null,
  id,
  kind,
  label,
  role: 'chrome' as const
});

/**
 * Longest description, in characters. New descriptions aim for about 60 (two lines at the compact card width);
 * Reduce Motion keeps its long, owner-approved rule text (about 150 chars, five lines at the narrowest card), the
 * longest any row may be.
 */
export const LEGACY_SETTINGS_DESCRIPTION_MAX_CHARS = 160;

/** The only way to make a setting row: the description is a required argument. */
const settingRow = (
  id: LegacySettingsRowId,
  kind: LegacySettingsRowKind,
  label: string,
  description: string,
  extra: LegacySettingsRowExtra = {}
): LegacySettingsSettingRowModel => Object.freeze({
  command: null,
  emphasis: null,
  gapBefore: null,
  offLabel: null,
  onLabel: null,
  settingKey: null,
  ...extra,
  description,
  id,
  kind,
  label,
  role: 'setting' as const
});

/**
 * Plain-words descriptions (what it does, what on/off means). Reduce Motion's own copy lives next to the rule it
 * describes (REDUCED_MOTION_SETTING_NOTE). Pinned by tests: non-empty, <= LEGACY_SETTINGS_DESCRIPTION_MAX_CHARS.
 */
export const LEGACY_SETTINGS_DESCRIPTIONS = Object.freeze({
  haptics: 'Buzzes on steps, wall bumps and wins. Silent with Reduce Motion, and on iPhone.',
  howToPlay: 'Controls, the goal, and what each icon means.',
  resetProgress: 'Sets your level back to 1. Asks you to confirm first.',
  signOut: 'Signs this device out. Your progress stays on your account.'
});

/**
 * The Settings group. IDENTICAL object list in both contexts. Labels and
 * state words are today's shipping copy (createFeatureControlRows).
 */
export const LEGACY_SETTINGS_GROUP_ROWS: readonly LegacySettingsSettingRowModel[] = Object.freeze([
  settingRow('how-to-play', 'nav', 'How to play', LEGACY_SETTINGS_DESCRIPTIONS.howToPlay, {
    command: { type: 'OPEN_GUIDE' },
    emphasis: 'secondary'
  }),
  settingRow('reduce-motion', 'toggle', REDUCED_MOTION_SETTING_LABEL, REDUCED_MOTION_SETTING_NOTE, {
    offLabel: REDUCED_MOTION_SETTING_OFF_LABEL,
    onLabel: REDUCED_MOTION_SETTING_ON_LABEL,
    settingKey: 'toggleReducedMotion'
  }),
  // Vibration on phones that support it (not iOS Safari: no navigator.vibrate there, so the row changes nothing).
  settingRow('haptics', 'toggle', 'Haptics', LEGACY_SETTINGS_DESCRIPTIONS.haptics, {
    offLabel: 'Off',
    onLabel: 'On',
    settingKey: 'hapticsEnabled'
  })
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

  const accountRows: LegacySettingsSettingRowModel[] = [
    settingRow('reset-progress', 'action', 'Reset progress', LEGACY_SETTINGS_DESCRIPTIONS.resetProgress, {
      command: { type: 'BEGIN_RESET_PROGRESS' },
      emphasis: 'danger-outline'
    })
  ];
  if (options.signedIn === true) {
    accountRows.push(settingRow('sign-out', 'action', 'Sign out', LEGACY_SETTINGS_DESCRIPTIONS.signOut, {
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
  /**
   * The muted description under a setting row's control (13 px, the style the Reduce Motion note always had).
   * Non-interactive text that sits OUTSIDE the control, so the control's hit target is unchanged. Its height is
   * lines x descriptionLineHeight, with the line count estimated from descriptionCharWidth (a deliberately wide
   * average glyph, so the reserved block is never shorter than the wrapped text).
   */
  descriptionFontSize: FONT.small,
  descriptionLineHeight: 17,
  descriptionMaxLines: 5,
  descriptionCharWidth: 6.5,
  /** Gap between a control and its description, and between the description and whatever follows (spacing token 4). */
  descriptionGap: SPACING[0] ?? 4,
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

export interface LegacySettingsPlanDescription {
  text: string;
  /** Estimated wrapped line count (1..descriptionMaxLines). */
  lines: number;
  fontSize: number;
  maxLines: number;
  /** Text block rect in card-body content space (scroll offset 0), directly under the control. */
  rect: LegacySettingsRect;
}

export interface LegacySettingsPlanItem {
  model: LegacySettingsRowModel;
  /** CONTROL rect in card-body content space (scroll offset 0); this is the hit target. */
  rect: LegacySettingsRect;
  /** The description block under the control, or null for chrome rows. */
  description: LegacySettingsPlanDescription | null;
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
    default:
      return model.kind satisfies never;
  }
};

const isInteractiveKind = (kind: LegacySettingsRowKind): boolean => kind !== 'heading';

/**
 * Greedy word-wrap line count for a description at a given text width, using the wide average glyph width so the
 * plan reserves at least as much height as the painter's real wrapping needs. Pure and deterministic.
 */
export const estimateLegacySettingsDescriptionLines = (text: string, textWidth: number): number => {
  const budget = Math.max(1, Math.floor(textWidth / LEGACY_SETTINGS_SIZES.descriptionCharWidth));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter((w) => w.length > 0)) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= budget || used === 0) {
      used = need;
    } else {
      lines += 1;
      used = word.length;
    }
  }
  return lines;
};

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
      let description: LegacySettingsPlanDescription | null = null;
      if (rowModel.description !== null) {
        // Text starts at the control's left edge and wraps 16 px short of its right edge (the painter's text padding).
        const lines = Math.min(
          s.descriptionMaxLines,
          estimateLegacySettingsDescriptionLines(rowModel.description, Math.max(1, rowWidth - 16))
        );
        const blockTop = cursor + s.descriptionGap;
        const blockHeight = lines * s.descriptionLineHeight;
        description = {
          fontSize: s.descriptionFontSize,
          lines,
          maxLines: s.descriptionMaxLines,
          rect: rectOf(0, blockTop, rowWidth, blockHeight),
          text: rowModel.description
        };
        // The block plus one more token gap below it belong to this row, so the next row never crowds it.
        cursor = blockTop + blockHeight + s.descriptionGap;
      }
      return {
        description,
        interactive: isInteractiveKind(rowModel.kind),
        labelFontSize: s.labelFontSize,
        labelMaxLines: rowModel.kind === 'heading' ? 1 : s.labelMaxLines,
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

/** Screen-space rect of an item's description block for a given scroll offset, or null when the row has none. */
export const resolveLegacySettingsDescriptionScreenRect = (
  plan: LegacySettingsSheetPlan,
  item: LegacySettingsPlanItem,
  scrollOffset = 0
): LegacySettingsRect | null => {
  if (item.description === null) {
    return null;
  }
  const offset = Math.min(plan.maxScrollOffset, Math.max(0, scrollOffset));
  return rectOf(
    plan.bodyViewport.left + item.description.rect.left,
    plan.bodyViewport.top + item.description.rect.top - offset,
    item.description.rect.width,
    item.description.rect.height
  );
};

/** Whether an item (control AND its description) is fully inside the body viewport at a scroll offset (drawable and tappable). */
export const isLegacySettingsItemFullyVisible = (
  plan: LegacySettingsSheetPlan,
  item: LegacySettingsPlanItem,
  scrollOffset = 0
): boolean => {
  const rect = resolveLegacySettingsItemScreenRect(plan, item, scrollOffset);
  const bottom = item.description === null
    ? rect.top + rect.height
    : resolveLegacySettingsDescriptionScreenRect(plan, item, scrollOffset)!.top + item.description.rect.height;
  return rect.top >= plan.bodyViewport.top
    && bottom <= plan.bodyViewport.top + plan.bodyViewport.height;
};

/** Viewports every plan must hold at (the audit set). */
export const LEGACY_SETTINGS_PLAN_VIEWPORTS: ReadonlyArray<{ height: number; width: number }> = Object.freeze([
  { height: 568, width: 320 },
  { height: 844, width: 390 },
  { height: 720, width: 1280 }
]);
