/**
 * Pure model for the Leaderboard username editor (MAZER-ACCT-011).
 *
 * Accounts created on the account host get a generated Mazer-###### handle
 * (mazer.mazer_ensure_profile) and the Account sheet no longer has an editor, so
 * the Leaderboard sheet carries a small one: an `Edit name` control on the pinned
 * You row (and on the `Choose a username` gate) opens an inline editor in the same
 * sheet. This module owns everything that is not Phaser or DOM:
 *
 *   - the state machine (closed -> editing -> saving -> closed | editing),
 *   - the draft rules (maxlength 15, trim on submit, never auto-capitalised),
 *   - the verdict on a draft, using LEGACY_USERNAME_PATTERN from legacyAuth.ts (the
 *     one validator, which mirrors the mazer_profiles check constraint; it is NOT
 *     reimplemented here),
 *   - the save orchestration with injected services (availability check, then
 *     saveLegacyAccountUsername), which returns an outcome whose failure kind maps
 *     onto the existing username toast (resolveLegacyUsernameSaveFailureMessage),
 *   - the view-model (labels, hint, invalid state, button states), and
 *   - the layout plan (keyboard-safe: the card sits at the top on a phone so the field and
 *     both buttons stay above the soft keyboard).
 *
 * Errors are never written into the sheet: a failed save is told through the shared
 * message toast with the four existing sentences, so no new player-facing sentence is
 * introduced here (labels and a short non-sentence hint only).
 */
import { LEGACY_USERNAME_PATTERN } from './legacyAuth';
import type { LegacyUsernameSaveFailureKind } from './legacyPlayerMessage';
import { LEGACY_SETTINGS_SIZES } from './legacySettingsSheetPlan';
import {
  LEGACY_UI_COMPACT_BREAKPOINT,
  resolveLegacyOverlayPanelLayout
} from './legacyUiStandards';

/** Longest username (mazer_profiles check constraint, mirrored by LEGACY_USERNAME_PATTERN). */
export const LEGACY_USERNAME_EDITOR_MAX_LENGTH = 15;

/** Labels and the short hint. None is a sentence; failures use the shared toast copy. */
export const LEGACY_USERNAME_EDITOR_COPY = Object.freeze({
  cancel: 'Cancel',
  editName: 'Edit name',
  fieldAriaLabel: 'Username',
  hint: '2 to 15 letters, numbers, . _ -',
  placeholder: 'Username',
  save: 'Save',
  saving: 'Saving',
  title: 'Edit name'
});

/**
 * Attributes for the native text input that sits over the painted field (the same shadow
 * input technique as the auth fields). Capitalisation, correction, spellcheck and
 * autofill are all off: a username is typed exactly as the player means it.
 */
export const LEGACY_USERNAME_EDITOR_INPUT_ATTRIBUTES = Object.freeze({
  autocapitalize: 'none',
  autocomplete: 'off',
  autocorrect: 'off',
  enterKeyHint: 'done',
  inputMode: 'text',
  maxLength: LEGACY_USERNAME_EDITOR_MAX_LENGTH,
  name: 'mazer-leaderboard-username',
  spellcheck: false,
  type: 'text'
} as const);

/** Extra attributes that keep password managers and form autofill away from the field. */
export const LEGACY_USERNAME_EDITOR_AUTOFILL_OPT_OUT = Object.freeze({
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
  'data-lpignore': 'true'
} as const);

/* ------------------------------------------------------------------ */
/* Draft rules and verdict                                             */
/* ------------------------------------------------------------------ */

/** The draft as the input holds it: at most 15 UTF-16 units, otherwise untouched (no case change). */
export const limitLegacyUsernameDraft = (raw: string): string => (
  raw.slice(0, LEGACY_USERNAME_EDITOR_MAX_LENGTH)
);

/** True when the trimmed draft is non-empty but breaks the shared username rule. */
export const isLegacyUsernameDraftInvalid = (draft: string): boolean => {
  const candidate = draft.trim();
  return candidate.length > 0 && !LEGACY_USERNAME_PATTERN.test(candidate);
};

export type LegacyUsernameEditorVerdict =
  | { kind: 'invalid' }
  | { kind: 'unchanged' }
  | { candidate: string; caseOnlyRename: boolean; kind: 'ready' };

/**
 * What Save does with a draft. Whitespace is trimmed first. An empty or rule-breaking
 * draft is `invalid`; the exact current name is `unchanged` (close, no request).
 * A case-only rename of the player's own name ("bob" -> "Bob") is `ready` with
 * `caseOnlyRename`: mazer_is_username_available matches the caller's own row
 * case-insensitively and would report it taken, so the availability gate is skipped
 * for that one case (the unique index stays the collision authority at save time).
 */
export const resolveLegacyUsernameEditorVerdict = (
  draft: string,
  savedValue: string
): LegacyUsernameEditorVerdict => {
  const candidate = draft.trim();
  if (!LEGACY_USERNAME_PATTERN.test(candidate)) {
    return { kind: 'invalid' };
  }
  if (candidate === savedValue.trim()) {
    return { kind: 'unchanged' };
  }
  return {
    candidate,
    caseOnlyRename: candidate.toLowerCase() === savedValue.trim().toLowerCase(),
    kind: 'ready'
  };
};

/* ------------------------------------------------------------------ */
/* State machine                                                       */
/* ------------------------------------------------------------------ */

export type LegacyUsernameEditorPhase = 'closed' | 'editing' | 'saving';

export interface LegacyUsernameEditorState {
  draft: string;
  phase: LegacyUsernameEditorPhase;
  /** The player's saved username when the editor opened ('' when none). */
  savedValue: string;
}

export const CLOSED_LEGACY_USERNAME_EDITOR_STATE: LegacyUsernameEditorState = Object.freeze({
  draft: '',
  phase: 'closed',
  savedValue: ''
});

export const openLegacyUsernameEditor = (savedValue: string): LegacyUsernameEditorState => ({
  draft: limitLegacyUsernameDraft(savedValue),
  phase: 'editing',
  savedValue
});

export const changeLegacyUsernameEditorDraft = (
  state: LegacyUsernameEditorState,
  raw: string
): LegacyUsernameEditorState => (
  state.phase === 'editing' ? { ...state, draft: limitLegacyUsernameDraft(raw) } : state
);

/** Cancel (Escape, Back, Cancel, a tap outside) always closes: a request already in flight is simply ignored by the UI. */
export const cancelLegacyUsernameEditor = (): LegacyUsernameEditorState => CLOSED_LEGACY_USERNAME_EDITOR_STATE;

export type LegacyUsernameEditorSubmit =
  | { kind: 'ignored'; state: LegacyUsernameEditorState }
  | { kind: 'invalid'; state: LegacyUsernameEditorState }
  | { kind: 'unchanged'; state: LegacyUsernameEditorState }
  | { candidate: string; caseOnlyRename: boolean; kind: 'save'; state: LegacyUsernameEditorState };

/** Save pressed (button or Enter). Only one request at a time. */
export const submitLegacyUsernameEditor = (state: LegacyUsernameEditorState): LegacyUsernameEditorSubmit => {
  if (state.phase !== 'editing') {
    return { kind: 'ignored', state };
  }
  const verdict = resolveLegacyUsernameEditorVerdict(state.draft, state.savedValue);
  switch (verdict.kind) {
    case 'invalid':
      return { kind: 'invalid', state };
    case 'unchanged':
      return { kind: 'unchanged', state: CLOSED_LEGACY_USERNAME_EDITOR_STATE };
    case 'ready':
      return {
        candidate: verdict.candidate,
        caseOnlyRename: verdict.caseOnlyRename,
        kind: 'save',
        state: { ...state, draft: verdict.candidate, phase: 'saving' }
      };
  }
};

export type LegacyUsernameEditorOutcome =
  | { kind: 'saved'; username: string }
  | { failure: LegacyUsernameSaveFailureKind; kind: 'failed'; technicalDetail: string | null };

/** A finished save: success closes the editor; a failure returns to editing with the draft kept. */
export const finishLegacyUsernameEditor = (
  state: LegacyUsernameEditorState,
  outcome: LegacyUsernameEditorOutcome
): LegacyUsernameEditorState => {
  if (state.phase !== 'saving') {
    return state;
  }
  return outcome.kind === 'saved'
    ? CLOSED_LEGACY_USERNAME_EDITOR_STATE
    : { ...state, phase: 'editing' };
};

/* ------------------------------------------------------------------ */
/* Save orchestration (services injected: testable without a network)   */
/* ------------------------------------------------------------------ */

export interface LegacyUsernameEditorServices {
  checkAvailable(candidate: string): Promise<{ available: boolean | null; error: string | null }>;
  save(
    userId: string,
    username: string
  ): Promise<{ error: string | null; failure: LegacyUsernameSaveFailureKind | null; ok: boolean }>;
}

/**
 * Availability check, then the hardened save. Failure kinds are the ones the message
 * module already knows (taken / try-again / invalid / failed); the provider text goes
 * into `technicalDetail` and never reaches the player.
 */
export const submitLegacyUsernameEdit = async (
  input: { candidate: string; caseOnlyRename: boolean; userId: string },
  services: LegacyUsernameEditorServices
): Promise<LegacyUsernameEditorOutcome> => {
  try {
    if (!input.caseOnlyRename) {
      const availability = await services.checkAvailable(input.candidate);
      if (availability.error) {
        return { failure: 'try-again', kind: 'failed', technicalDetail: availability.error };
      }
      if (availability.available === false) {
        return { failure: 'taken', kind: 'failed', technicalDetail: null };
      }
    }
    const saved = await services.save(input.userId, input.candidate);
    if (!saved.ok) {
      return { failure: saved.failure ?? 'failed', kind: 'failed', technicalDetail: saved.error };
    }
    return { kind: 'saved', username: input.candidate };
  } catch (error) {
    // A thrown request is a connection problem, told as the shared `try again` sentence.
    return {
      failure: 'try-again',
      kind: 'failed',
      technicalDetail: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Local services for the QA diagnostics identity (?runtimeDiagnostics=1&authFixture=authenticated),
 * which has no profile row behind it: every name is free except `taken`, and a save always lands.
 * The scene uses these only for that fixture user id, so a real account never reaches them.
 */
export const createLegacyUsernameEditorFixtureServices = (): LegacyUsernameEditorServices => ({
  checkAvailable: async (candidate) => ({ available: candidate.toLowerCase() !== 'taken', error: null }),
  save: async () => ({ error: null, failure: null, ok: true })
});

/* ------------------------------------------------------------------ */
/* View-model                                                          */
/* ------------------------------------------------------------------ */

export interface LegacyUsernameEditorViewModel {
  busy: boolean;
  cancel: { label: string };
  fieldInvalid: boolean;
  fieldValue: string;
  hint: string;
  hintTone: 'error' | 'muted';
  placeholder: string;
  save: { enabled: boolean; label: string };
  title: string;
}

export const buildLegacyUsernameEditorViewModel = (state: LegacyUsernameEditorState): LegacyUsernameEditorViewModel => {
  const copy = LEGACY_USERNAME_EDITOR_COPY;
  const busy = state.phase === 'saving';
  const fieldInvalid = isLegacyUsernameDraftInvalid(state.draft);
  return {
    busy,
    cancel: { label: copy.cancel },
    fieldInvalid,
    fieldValue: state.draft,
    hint: copy.hint,
    hintTone: fieldInvalid ? 'error' : 'muted',
    placeholder: copy.placeholder,
    // Save stays pressable while editing so an invalid draft is answered by the toast
    // (the sheet's own convention: an inert button explains nothing).
    save: { enabled: !busy, label: busy ? copy.saving : copy.save },
    title: copy.title
  };
};

/* ------------------------------------------------------------------ */
/* Layout plan                                                         */
/* ------------------------------------------------------------------ */

export interface LegacyUsernameEditorRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export const LEGACY_USERNAME_EDITOR_SIZES = Object.freeze({
  /** Field and both buttons: >= the 44 px floor. */
  controlHeight: LEGACY_SETTINGS_SIZES.actionHeight,
  hintHeight: 18,
  hintGap: 8,
  sectionGap: LEGACY_SETTINGS_SIZES.sectionGap,
  buttonGap: LEGACY_SETTINGS_SIZES.rowGap,
  /** Field text inset. */
  fieldPadX: 14,
  fieldFontSize: 17,
  hintFontSize: 13
});

export interface LegacyUsernameEditorPlan {
  card: LegacyUsernameEditorRect;
  cancel: LegacyUsernameEditorRect;
  compact: boolean;
  field: LegacyUsernameEditorRect;
  hint: { centerY: number; left: number; maxWidth: number };
  save: LegacyUsernameEditorRect;
  title: { centerX: number; centerY: number; text: string };
  /** Bottom of the lowest control (Save / Cancel): what must stay above the soft keyboard. */
  controlsBottom: number;
}

const rectOf = (left: number, top: number, width: number, height: number): LegacyUsernameEditorRect => ({
  height,
  left,
  top,
  width
});

/**
 * The editor card in the Settings-sheet language (same card width, padding, title slot).
 * On a phone the card is TOP-aligned in the panel, not centred: field, hint and both buttons
 * end about 200 px from the top, so the soft keyboard (which fills the lower half or more
 * of the screen) never covers them, even at 320x568. On a wide viewport it is centred.
 * The width/height come from the scene layout, which already follows the visual viewport
 * (readMazerViewportGeometry) when the keyboard resizes it.
 */
export const buildLegacyUsernameEditorPlan = (
  view: LegacyUsernameEditorViewModel,
  width: number,
  height: number,
  safeArea: { bottom?: number; top?: number } = {}
): LegacyUsernameEditorPlan => {
  const s = LEGACY_SETTINGS_SIZES;
  const z = LEGACY_USERNAME_EDITOR_SIZES;
  const panel = resolveLegacyOverlayPanelLayout(width, height, safeArea);
  const compact = panel.width < LEGACY_UI_COMPACT_BREAKPOINT;
  const cardPadding = compact ? s.cardPaddingCompact : s.cardPaddingRegular;
  const titleHeight = compact ? s.titleHeightCompact : s.titleHeightRegular;
  const titleGap = compact ? s.titleGapCompact : s.titleGapRegular;
  const cardWidth = Math.min(compact ? 360 : 400, Math.max(1, panel.width - (compact ? 16 : 48)));
  const innerWidth = Math.max(1, cardWidth - (cardPadding * 2));
  const usableHeight = Math.max(1, panel.height);

  const cardHeight = Math.min(
    usableHeight,
    (cardPadding * 2) + titleHeight + titleGap
      + z.controlHeight + z.hintGap + z.hintHeight
      + z.sectionGap + z.controlHeight
  );
  const cardTop = compact
    ? panel.top
    : Math.round(panel.top + ((usableHeight - cardHeight) / 2));
  const cardLeft = Math.round(panel.centerX - (cardWidth / 2));
  const innerLeft = cardLeft + cardPadding;

  const fieldTop = cardTop + cardPadding + titleHeight + titleGap;
  const hintTop = fieldTop + z.controlHeight + z.hintGap;
  const buttonsTop = hintTop + z.hintHeight + z.sectionGap;
  const buttonWidth = Math.floor((innerWidth - z.buttonGap) / 2);

  return {
    cancel: rectOf(innerLeft, buttonsTop, buttonWidth, z.controlHeight),
    card: rectOf(cardLeft, cardTop, cardWidth, cardHeight),
    compact,
    controlsBottom: buttonsTop + z.controlHeight,
    field: rectOf(innerLeft, fieldTop, innerWidth, z.controlHeight),
    hint: { centerY: hintTop + Math.round(z.hintHeight / 2), left: innerLeft + 2, maxWidth: innerWidth - 4 },
    save: rectOf(innerLeft + buttonWidth + z.buttonGap, buttonsTop, innerWidth - buttonWidth - z.buttonGap, z.controlHeight),
    title: {
      centerX: panel.centerX,
      centerY: cardTop + cardPadding + Math.round(titleHeight / 2),
      text: view.title
    }
  };
};
