/**
 * Pure model for the main-menu header identity label: the canonical username
 * rendered to the RIGHT of the top-left profile icon (replacing the old
 * "Welcome" + username pair at the bottom of the main menu).
 *
 * No Phaser, no canvas, no DOM. Text measurement is injected so the layout
 * is deterministic and testable; the later MenuScene wiring packet passes a
 * real Phaser/canvas measure function. See
 * docs/ui/MAZER-LEADERBOARD-PAUSE-IDENTITY-REDESIGN-2026-11-05.md.
 */

/** Hide the label (icon only) when fewer than this many characters are visible. */
export const LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS = 6;
/** Horizontal gap between the profile icon's right edge and the label. */
export const LEGACY_HEADER_IDENTITY_ICON_GAP_PX = 8;
/** Minimum horizontal clearance between the label's right edge and the title's left edge. */
export const LEGACY_HEADER_IDENTITY_TITLE_GAP_PX = 8;
/** Minimum clearance kept to the right viewport edge (only binds if titleLeft is bogus). */
export const LEGACY_HEADER_IDENTITY_VIEWPORT_EDGE_PX = 8;
export const LEGACY_HEADER_IDENTITY_MIN_FONT_PX = 11;
export const LEGACY_HEADER_IDENTITY_PREFERRED_FONT_PX = 14;
export const LEGACY_HEADER_IDENTITY_MAX_FONT_PX = 16;
export const LEGACY_HEADER_IDENTITY_ELLIPSIS = '…';

/** Measures the rendered width in px of `text` (caller closes over font and size). */
export type LegacyUiTextMeasure = (text: string) => number;
/** Measures the rendered width in px of `text` at `fontPx`. */
export type LegacyUiSizedTextMeasure = (text: string, fontPx: number) => number;

/**
 * Deterministic fallback measure: a flat 0.62em per code point. It is only an
 * estimate (a real 'W' is wider, an 'i' narrower); production wiring should
 * inject the real renderer measure. Tests inject their own per-glyph table.
 */
export const estimateLegacyUiTextWidth: LegacyUiSizedTextMeasure = (text, fontPx) => (
  Array.from(text).length * fontPx * 0.62
);

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Display text for the identity label from the canonical username ONLY.
 * Trims, strips control characters, maps empty to null. Defense in depth:
 * a value shaped like an email address is refused (null) so an email can
 * never be shown here even if a caller wires the wrong field.
 */
export const resolveLegacyHeaderIdentityText = (
  canonicalUsername: string | null | undefined
): string | null => {
  if (typeof canonicalUsername !== 'string') {
    return null;
  }
  const cleaned = canonicalUsername.replace(CONTROL_CHARACTERS, '').trim();
  if (cleaned.length === 0 || EMAIL_SHAPE.test(cleaned)) {
    return null;
  }
  return cleaned;
};

/**
 * Truncates `text` with a trailing '…' so that measure(result) <= maxWidthPx.
 * Operates on code points (Array.from), so it never splits a surrogate pair.
 * (Grapheme clusters such as ZWJ sequences are not segmented; usernames are
 * constrained server-side and the cost of a split cluster is cosmetic.)
 * Returns the full text when it already fits and '' when not even the
 * ellipsis fits or the budget is unusable.
 */
export const ellipsizeLegacyUiText = (
  text: string,
  maxWidthPx: number,
  measure: LegacyUiTextMeasure
): string => {
  if (!Number.isFinite(maxWidthPx) || maxWidthPx <= 0 || text.length === 0) {
    return '';
  }
  if (measure(text) <= maxWidthPx) {
    return text;
  }
  const points = Array.from(text);
  for (let keep = points.length - 1; keep >= 0; keep -= 1) {
    const candidate = `${points.slice(0, keep).join('').trimEnd()}${LEGACY_HEADER_IDENTITY_ELLIPSIS}`;
    if (measure(candidate) <= maxWidthPx) {
      return candidate;
    }
  }
  return '';
};

/** Count of visible characters in an ellipsized string (ellipsis excluded). */
const countVisibleCharacters = (displayText: string): number => {
  const points = Array.from(displayText);
  return points[points.length - 1] === LEGACY_HEADER_IDENTITY_ELLIPSIS
    ? points.length - 1
    : points.length;
};

export type LegacyHeaderIdentityHiddenReason =
  | 'no-text'
  | 'invalid-geometry'
  | 'no-room'
  | 'too-few-visible-characters';

export interface LegacyHeaderIdentityLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  /** Right edge of the profile icon frame (resolveLegacyHeaderControlFrame().right). */
  profileFrameRight: number;
  /** Left edge of the inline title footprint. */
  titleLeft: number;
  /** Canonical username (will be passed through resolveLegacyHeaderIdentityText). */
  text: string | null | undefined;
  /** Preferred font size; clamped to [MIN, MAX] and never grown. */
  fontPx: number;
  /** Optional vertical center of the profile icon frame, echoed back as centerY. */
  profileFrameCenterY?: number;
  /** Injected measure; defaults to estimateLegacyUiTextWidth. */
  measure?: LegacyUiSizedTextMeasure;
}

export interface LegacyHeaderIdentityLayout {
  visible: boolean;
  hiddenReason: LegacyHeaderIdentityHiddenReason | null;
  left: number;
  /** Width budget for the label: titleLeft - gap - left (floored at 0). */
  maxWidth: number;
  /** Right edge of the measured label (left + measured width); 0-width when hidden. */
  right: number;
  displayText: string;
  fontPx: number;
  /** Vertical alignment hint: vertically center the label on the profile icon. */
  centerYAlignment: 'profile-frame-center';
  /** Phaser-style origin for the label: left-anchored, vertically centered. */
  origin: { x: 0; y: 0.5 };
  centerY: number | null;
}

const hidden = (
  reason: LegacyHeaderIdentityHiddenReason,
  left: number,
  maxWidth: number,
  fontPx: number,
  centerY: number | null
): LegacyHeaderIdentityLayout => ({
  centerY,
  centerYAlignment: 'profile-frame-center',
  displayText: '',
  fontPx,
  hiddenReason: reason,
  left,
  maxWidth,
  origin: { x: 0, y: 0.5 },
  right: left,
  visible: false
});

/**
 * Places the identity label to the right of the profile icon.
 *
 * Rules:
 *  - left = profileFrameRight + ICON_GAP
 *  - available = titleLeft - TITLE_GAP - left (also capped by the viewport edge)
 *  - shrink the font (preferred -> MIN) until the whole name fits; if it still
 *    does not fit at MIN, ellipsize at MIN
 *  - hide the label (icon only) when fewer than
 *    min(LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS, name length) characters are
 *    visible at MIN. A short name that fits whole is always shown.
 * Invariant: when visible, right <= titleLeft - TITLE_GAP.
 */
export const resolveLegacyHeaderIdentityLayout = (
  input: LegacyHeaderIdentityLayoutInput
): LegacyHeaderIdentityLayout => {
  const centerY = typeof input.profileFrameCenterY === 'number' && Number.isFinite(input.profileFrameCenterY)
    ? input.profileFrameCenterY
    : null;
  const requestedFont = Number.isFinite(input.fontPx) ? Math.round(input.fontPx) : LEGACY_HEADER_IDENTITY_PREFERRED_FONT_PX;
  const startFont = Math.max(
    LEGACY_HEADER_IDENTITY_MIN_FONT_PX,
    Math.min(LEGACY_HEADER_IDENTITY_MAX_FONT_PX, requestedFont)
  );
  const left = Number.isFinite(input.profileFrameRight)
    ? input.profileFrameRight + LEGACY_HEADER_IDENTITY_ICON_GAP_PX
    : 0;

  if (
    !Number.isFinite(input.viewportWidth)
    || !Number.isFinite(input.viewportHeight)
    || !Number.isFinite(input.profileFrameRight)
    || !Number.isFinite(input.titleLeft)
    || input.viewportWidth <= 0
    || input.viewportHeight <= 0
  ) {
    return hidden('invalid-geometry', left, 0, startFont, centerY);
  }

  const text = resolveLegacyHeaderIdentityText(input.text);
  const available = input.titleLeft - LEGACY_HEADER_IDENTITY_TITLE_GAP_PX - left;
  const viewportRoom = input.viewportWidth - LEGACY_HEADER_IDENTITY_VIEWPORT_EDGE_PX - left;
  const maxWidth = Math.max(0, Math.min(available, viewportRoom));

  if (text === null) {
    return hidden('no-text', left, maxWidth, startFont, centerY);
  }
  if (maxWidth <= 0) {
    return hidden('no-room', left, maxWidth, LEGACY_HEADER_IDENTITY_MIN_FONT_PX, centerY);
  }

  const measure = input.measure ?? estimateLegacyUiTextWidth;
  const finish = (displayText: string, fontPx: number): LegacyHeaderIdentityLayout => ({
    centerY,
    centerYAlignment: 'profile-frame-center',
    displayText,
    fontPx,
    hiddenReason: null,
    left,
    maxWidth,
    origin: { x: 0, y: 0.5 },
    right: left + measure(displayText, fontPx),
    visible: true
  });

  for (let fontPx = startFont; fontPx >= LEGACY_HEADER_IDENTITY_MIN_FONT_PX; fontPx -= 1) {
    if (measure(text, fontPx) <= maxWidth) {
      return finish(text, fontPx);
    }
  }

  const minFont = LEGACY_HEADER_IDENTITY_MIN_FONT_PX;
  const ellipsized = ellipsizeLegacyUiText(text, maxWidth, (value) => measure(value, minFont));
  const required = Math.min(LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS, Array.from(text).length);
  if (ellipsized.length === 0 || countVisibleCharacters(ellipsized) < required) {
    return hidden(
      ellipsized.length === 0 ? 'no-room' : 'too-few-visible-characters',
      left,
      maxWidth,
      minFont,
      centerY
    );
  }
  return finish(ellipsized, minFont);
};
