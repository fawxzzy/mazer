import { describe, expect, test } from 'vitest';
import { resolveLegacyHeaderControlFrame } from '../../src/legacy-runtime/legacyHeaderControl';
import {
  LEGACY_HEADER_IDENTITY_ELLIPSIS,
  LEGACY_HEADER_IDENTITY_ICON_GAP_PX,
  LEGACY_HEADER_IDENTITY_MAX_FONT_PX,
  LEGACY_HEADER_IDENTITY_MIN_FONT_PX,
  LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS,
  LEGACY_HEADER_IDENTITY_PREFERRED_FONT_PX,
  LEGACY_HEADER_IDENTITY_TITLE_GAP_PX,
  ellipsizeLegacyUiText,
  resolveLegacyHeaderIdentityLayout,
  resolveLegacyHeaderIdentityText
} from '../../src/legacy-runtime/legacyHeaderIdentity';

// Deterministic per-glyph test measure (em units * fontPx). No canvas.
// Wide capitals and the ellipsis are charged a full em so worst cases are real.
const emWidth = (codePoint: string): number => {
  if (codePoint === 'W' || codePoint === 'M' || codePoint === LEGACY_HEADER_IDENTITY_ELLIPSIS) {
    return 1;
  }
  if ('ilj1I.'.includes(codePoint)) {
    return 0.3;
  }
  return 0.6;
};
const measureAt = (text: string, fontPx: number): number => (
  Array.from(text).reduce((sum, glyph) => sum + emWidth(glyph), 0) * fontPx
);

// ---------------------------------------------------------------------------
// TITLE-FOOTPRINT ASSUMPTION (DERIVED, NOT MEASURED).
// The investigation reports, at 390x844, a profile icon right edge of ~44 and
// an inline title left edge of ~85. The icon edge is reproduced below from the
// real resolveLegacyHeaderControlFrame (36px icon + 8px inset => 44). The
// title left edge is NOT measured here: we model the centered inline title as
// a constant 220px footprint, titleLeft = (viewportWidth - 220) / 2, which
// gives exactly 85 at 390 and is extrapolated to the other widths. Real
// footprints shrink when the header squeezes (headerIconScale); treat the
// per-width numbers below as an assumption-derived envelope, not a capture.
// ---------------------------------------------------------------------------
const ASSUMED_TITLE_FOOTPRINT_PX = 220;
const assumedTitleLeft = (viewportWidth: number): number => (viewportWidth - ASSUMED_TITLE_FOOTPRINT_PX) / 2;
const profileFrameRightAt = (viewportWidth: number, viewportHeight = 844): number => (
  resolveLegacyHeaderControlFrame({
    height: viewportHeight,
    hudHeight: 64,
    hudTop: 0,
    placement: 'leading',
    width: viewportWidth
  }).right
);

const hasLoneSurrogate = (value: string): boolean => (
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)
);

const layoutFor = (viewportWidth: number, text: string, fontPx = LEGACY_HEADER_IDENTITY_PREFERRED_FONT_PX, viewportHeight = 844) => (
  resolveLegacyHeaderIdentityLayout({
    fontPx,
    measure: measureAt,
    profileFrameRight: profileFrameRightAt(viewportWidth, viewportHeight),
    text,
    titleLeft: assumedTitleLeft(viewportWidth),
    viewportHeight,
    viewportWidth
  })
);

describe('legacy header identity: text resolution', () => {
  test('trims, maps empty to null, strips control characters', () => {
    expect(resolveLegacyHeaderIdentityText('  fawxzzy ')).toBe('fawxzzy');
    expect(resolveLegacyHeaderIdentityText('')).toBeNull();
    expect(resolveLegacyHeaderIdentityText('   \t ')).toBeNull();
    expect(resolveLegacyHeaderIdentityText(null)).toBeNull();
    expect(resolveLegacyHeaderIdentityText(undefined)).toBeNull();
    expect(resolveLegacyHeaderIdentityText('ab\ncd\u0000')).toBe('abcd');
  });

  test('never exposes an email-shaped value', () => {
    expect(resolveLegacyHeaderIdentityText('player@example.com')).toBeNull();
    expect(resolveLegacyHeaderIdentityText(' a.b+c@sub.example.org ')).toBeNull();
    expect(resolveLegacyHeaderIdentityText('maze_runner')).toBe('maze_runner');
  });
});

describe('legacy header identity: ellipsizeLegacyUiText', () => {
  const perCodePoint = (text: string): number => Array.from(text).length * 10;

  test('returns the text unchanged when it fits', () => {
    expect(ellipsizeLegacyUiText('abc', 30, perCodePoint)).toBe('abc');
  });

  test('truncates with the single-character ellipsis and respects the budget', () => {
    const result = ellipsizeLegacyUiText('abcdefghij', 55, perCodePoint);
    expect(result).toBe('abcd…');
    expect(perCodePoint(result)).toBeLessThanOrEqual(55);
    expect(LEGACY_HEADER_IDENTITY_ELLIPSIS).toBe('…');
  });

  test('returns an empty string when not even the ellipsis fits or the budget is unusable', () => {
    expect(ellipsizeLegacyUiText('abcdef', 5, perCodePoint)).toBe('');
    expect(ellipsizeLegacyUiText('abcdef', 0, perCodePoint)).toBe('');
    expect(ellipsizeLegacyUiText('abcdef', -3, perCodePoint)).toBe('');
    expect(ellipsizeLegacyUiText('abcdef', Number.NaN, perCodePoint)).toBe('');
    expect(ellipsizeLegacyUiText('', 100, perCodePoint)).toBe('');
  });

  test('never splits inside a surrogate pair, for every width budget', () => {
    // Each emoji is two UTF-16 units; a naive slice would split it.
    const text = 'a\u{1F600}b\u{1F680}c\u{1F4A5}d\u{1F525}e';
    const utf16Measure = (value: string): number => value.length * 7;
    for (let budget = 0; budget <= utf16Measure(text) + 14; budget += 1) {
      const result = ellipsizeLegacyUiText(text, budget, utf16Measure);
      expect(hasLoneSurrogate(result)).toBe(false);
      if (result.length > 0) {
        expect(utf16Measure(result)).toBeLessThanOrEqual(budget);
      }
    }
    expect(ellipsizeLegacyUiText('\u{1F600}\u{1F600}\u{1F600}', 3 * 7 + 7, utf16Measure)).toBe('\u{1F600}…');
  });

  test('is deterministic', () => {
    const first = ellipsizeLegacyUiText('maze_runner_extra', 80, perCodePoint);
    const second = ellipsizeLegacyUiText('maze_runner_extra', 80, perCodePoint);
    expect(first).toBe(second);
  });
});

describe('legacy header identity: constants', () => {
  test('exports the documented thresholds', () => {
    expect(LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS).toBe(6);
    expect(LEGACY_HEADER_IDENTITY_MIN_FONT_PX).toBe(11);
    expect(LEGACY_HEADER_IDENTITY_ICON_GAP_PX).toBe(8);
    expect(LEGACY_HEADER_IDENTITY_TITLE_GAP_PX).toBeGreaterThan(0);
    expect(LEGACY_HEADER_IDENTITY_MAX_FONT_PX).toBeGreaterThanOrEqual(LEGACY_HEADER_IDENTITY_PREFERRED_FONT_PX);
  });
});

describe('legacy header identity: layout rules', () => {
  test('left = profile right + 8; available = titleLeft - gap - left', () => {
    const layout = resolveLegacyHeaderIdentityLayout({
      fontPx: 14,
      measure: measureAt,
      profileFrameRight: 44,
      text: 'Zac',
      titleLeft: 200,
      viewportHeight: 844,
      viewportWidth: 390
    });
    expect(layout.left).toBe(44 + LEGACY_HEADER_IDENTITY_ICON_GAP_PX);
    expect(layout.maxWidth).toBe(200 - LEGACY_HEADER_IDENTITY_TITLE_GAP_PX - 52);
    expect(layout.visible).toBe(true);
    expect(layout.displayText).toBe('Zac');
    expect(layout.fontPx).toBe(14);
    expect(layout.centerYAlignment).toBe('profile-frame-center');
    expect(layout.origin).toEqual({ x: 0, y: 0.5 });
  });

  test('echoes the profile frame center as the vertical anchor', () => {
    const layout = resolveLegacyHeaderIdentityLayout({
      fontPx: 14, measure: measureAt, profileFrameCenterY: 32, profileFrameRight: 44,
      text: 'Zac', titleLeft: 200, viewportHeight: 844, viewportWidth: 390
    });
    expect(layout.centerY).toBe(32);
  });

  test('shrinks the font before ellipsizing, down to the minimum', () => {
    // 'maze_runner' = 11 glyphs: 3 narrow-ish; budget chosen so 14px fails but 12px fits.
    const text = 'maze_runner';
    const widthAt = (px: number): number => measureAt(text, px);
    const budget = Math.floor(widthAt(12)) + 1; // fits at 12, not at 13+
    const layout = resolveLegacyHeaderIdentityLayout({
      fontPx: 14,
      measure: measureAt,
      profileFrameRight: 44,
      text,
      titleLeft: 52 + LEGACY_HEADER_IDENTITY_TITLE_GAP_PX + budget,
      viewportHeight: 844,
      viewportWidth: 600
    });
    expect(layout.displayText).toBe(text);
    expect(layout.fontPx).toBeLessThan(14);
    expect(layout.fontPx).toBeGreaterThanOrEqual(LEGACY_HEADER_IDENTITY_MIN_FONT_PX);
  });

  test('ellipsizes at the minimum font and keeps at least 6 visible characters', () => {
    const text = 'Alexandrina_Wolf';
    const layout = resolveLegacyHeaderIdentityLayout({
      fontPx: 14,
      measure: measureAt,
      profileFrameRight: 44,
      text,
      titleLeft: 52 + LEGACY_HEADER_IDENTITY_TITLE_GAP_PX + 90,
      viewportHeight: 844,
      viewportWidth: 600
    });
    expect(layout.visible).toBe(true);
    expect(layout.fontPx).toBe(LEGACY_HEADER_IDENTITY_MIN_FONT_PX);
    expect(layout.displayText.endsWith(LEGACY_HEADER_IDENTITY_ELLIPSIS)).toBe(true);
    expect(Array.from(layout.displayText).length - 1).toBeGreaterThanOrEqual(LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS);
    expect(layout.right).toBeLessThanOrEqual(layout.left + layout.maxWidth);
  });

  test('hides the label (icon only) when fewer than 6 characters would be visible', () => {
    const text = 'Alexandrina_Wolf';
    const layout = resolveLegacyHeaderIdentityLayout({
      fontPx: 14,
      measure: measureAt,
      profileFrameRight: 44,
      text,
      titleLeft: 52 + LEGACY_HEADER_IDENTITY_TITLE_GAP_PX + 40,
      viewportHeight: 844,
      viewportWidth: 600
    });
    expect(layout.visible).toBe(false);
    expect(layout.displayText).toBe('');
    expect(layout.hiddenReason).toBe('too-few-visible-characters');
  });

  test('a short name that fits whole is shown even though it has fewer than 6 characters', () => {
    const layout = layoutFor(430, 'Zac');
    expect(layout.visible).toBe(true);
    expect(layout.displayText).toBe('Zac');
  });

  test('a short name that cannot fit whole is hidden, not shown as "Z…"', () => {
    const layout = resolveLegacyHeaderIdentityLayout({
      fontPx: 14,
      measure: measureAt,
      profileFrameRight: 44,
      text: 'Zacharia',
      titleLeft: 52 + LEGACY_HEADER_IDENTITY_TITLE_GAP_PX + 30,
      viewportHeight: 844,
      viewportWidth: 600
    });
    expect(layout.visible).toBe(false);
  });

  test('hides for empty text, no room, and invalid geometry', () => {
    expect(layoutFor(390, '   ').hiddenReason).toBe('no-text');
    expect(resolveLegacyHeaderIdentityLayout({
      fontPx: 14, measure: measureAt, profileFrameRight: 44, text: 'Zac',
      titleLeft: 50, viewportHeight: 844, viewportWidth: 390
    }).hiddenReason).toBe('no-room');
    expect(resolveLegacyHeaderIdentityLayout({
      fontPx: 14, measure: measureAt, profileFrameRight: Number.NaN, text: 'Zac',
      titleLeft: 200, viewportHeight: 844, viewportWidth: 390
    }).hiddenReason).toBe('invalid-geometry');
    expect(resolveLegacyHeaderIdentityLayout({
      fontPx: 14, measure: measureAt, profileFrameRight: 44, text: 'Zac',
      titleLeft: 200, viewportHeight: 0, viewportWidth: 390
    }).hiddenReason).toBe('invalid-geometry');
  });

  test('clamps the requested font into [min, max] and never grows past it', () => {
    expect(layoutFor(1280, 'Zac', 40, 720).fontPx).toBe(LEGACY_HEADER_IDENTITY_MAX_FONT_PX);
    expect(layoutFor(1280, 'Zac', 3, 720).fontPx).toBe(LEGACY_HEADER_IDENTITY_MIN_FONT_PX);
  });

  test('works with the built-in estimate measure when none is injected', () => {
    const layout = resolveLegacyHeaderIdentityLayout({
      fontPx: 14, profileFrameRight: 44, text: 'Zac', titleLeft: 300, viewportHeight: 844, viewportWidth: 390
    });
    expect(layout.visible).toBe(true);
    expect(layout.displayText).toBe('Zac');
  });
});

describe('legacy header identity: phone widths under the DERIVED title-footprint assumption', () => {
  const widths = [320, 360, 390, 430];

  test('the assumption reproduces the 390x844 figures (icon right edge 52 = 16px edge inset + 36px glyph box, title ~85)', () => {
    expect(profileFrameRightAt(390)).toBe(52);
    expect(assumedTitleLeft(390)).toBe(85);
  });

  test.each(widths)('15-character worst case "WWWWWWWWWWWWWWW" never overlaps the title at %ipx', (width) => {
    const layout = layoutFor(width, 'WWWWWWWWWWWWWWW');
    const titleLeft = assumedTitleLeft(width);
    if (layout.visible) {
      expect(layout.right).toBeLessThanOrEqual(titleLeft - LEGACY_HEADER_IDENTITY_TITLE_GAP_PX);
      expect(Array.from(layout.displayText).length - 1).toBeGreaterThanOrEqual(LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS);
    } else {
      expect(layout.displayText).toBe('');
    }
    // With a 1em-wide glyph and only ~25-60px of room, the worst case must be icon-only on phones.
    expect(layout.visible).toBe(false);
  });

  test.each(widths)('short names stay inside the budget at %ipx', (width) => {
    const titleLeft = assumedTitleLeft(width);
    for (const name of ['Zac', 'Ava', 'maze_runner', 'fawxzzy']) {
      const layout = layoutFor(width, name);
      if (layout.visible) {
        expect(layout.right).toBeLessThanOrEqual(titleLeft - LEGACY_HEADER_IDENTITY_TITLE_GAP_PX);
        expect(layout.left).toBe(profileFrameRightAt(width) + LEGACY_HEADER_IDENTITY_ICON_GAP_PX);
      }
    }
  });

  // Under this 220px ASSUMED footprint the 16px header edge inset leaves ~17px at 390, so even a
  // 3-char name collapses to icon-only here; the REAL footprint (164px) leaves ~46px, which
  // legacy-header-identity-placement.test.ts pins.
  test('records what fits at 390 under the assumed footprint (nothing: the room is only ~17px)', () => {
    const layout390 = layoutFor(390, 'Zac');
    expect(layout390.maxWidth).toBe(85 - LEGACY_HEADER_IDENTITY_TITLE_GAP_PX - (profileFrameRightAt(390) + LEGACY_HEADER_IDENTITY_ICON_GAP_PX));
    expect(layout390.visible).toBe(false);
    expect(layoutFor(390, 'fawxzzy').visible).toBe(false);
    expect(layoutFor(390, 'maze_runner').visible).toBe(false);
  });

  test('desktop (1280x720) has room for a full 15-character name at the preferred font', () => {
    const layout = layoutFor(1280, 'WWWWWWWWWWWWWWW', 14, 720);
    expect(layout.visible).toBe(true);
    expect(layout.displayText).toBe('WWWWWWWWWWWWWWW');
  });
});

describe('legacy header identity: invariants', () => {
  const names = ['Zac', 'Ava_', 'fawxzzy', 'maze_runner', 'WWWWWWWWWWWWWWW', 'Alexandrina_Wolf', 'a\u{1F600}b\u{1F680}cdefgh'];

  test('visible labels never cross titleLeft - gap, never go below 6 visible chars unless whole, and are never lone-surrogate', () => {
    for (const viewportWidth of [320, 360, 390, 430, 768, 1280]) {
      const profileRight = profileFrameRightAt(viewportWidth);
      for (let titleLeft = 0; titleLeft <= 420; titleLeft += 5) {
        for (const name of names) {
          const layout = resolveLegacyHeaderIdentityLayout({
            fontPx: 14,
            measure: measureAt,
            profileFrameRight: profileRight,
            text: name,
            titleLeft,
            viewportHeight: 844,
            viewportWidth
          });
          if (!layout.visible) {
            expect(layout.displayText).toBe('');
            continue;
          }
          expect(layout.right).toBeLessThanOrEqual(titleLeft - LEGACY_HEADER_IDENTITY_TITLE_GAP_PX + 1e-9);
          expect(layout.left).toBe(profileRight + LEGACY_HEADER_IDENTITY_ICON_GAP_PX);
          expect(hasLoneSurrogate(layout.displayText)).toBe(false);
          expect(layout.fontPx).toBeGreaterThanOrEqual(LEGACY_HEADER_IDENTITY_MIN_FONT_PX);
          expect(layout.fontPx).toBeLessThanOrEqual(LEGACY_HEADER_IDENTITY_MAX_FONT_PX);
          const wholeLength = Array.from(name).length;
          const visibleChars = layout.displayText.endsWith(LEGACY_HEADER_IDENTITY_ELLIPSIS)
            ? Array.from(layout.displayText).length - 1
            : Array.from(layout.displayText).length;
          expect(visibleChars).toBeGreaterThanOrEqual(Math.min(LEGACY_HEADER_IDENTITY_MIN_VISIBLE_CHARS, wholeLength));
        }
      }
    }
  });

  test('minVisibleChars lowers the visible-character floor (320 px short form) without changing the default', () => {
    // 41 px of room at 11 px / 0.62em (6.82 px per glyph): 5 glyphs + ellipsis do not fit 6 visible chars.
    const input = {
      profileFrameRight: 42,
      text: 'maze_runner',
      titleLeft: 99,
      viewportHeight: 568,
      viewportWidth: 320,
      fontPx: 14
    };
    const strict = resolveLegacyHeaderIdentityLayout(input);
    expect(strict.visible).toBe(false);
    expect(strict.hiddenReason).toBe('too-few-visible-characters');
    const shortForm = resolveLegacyHeaderIdentityLayout({ ...input, minVisibleChars: 4 });
    expect(shortForm.visible).toBe(true);
    expect(shortForm.displayText.endsWith(LEGACY_HEADER_IDENTITY_ELLIPSIS)).toBe(true);
    expect(shortForm.right).toBeLessThanOrEqual(99 - LEGACY_HEADER_IDENTITY_TITLE_GAP_PX + 1e-9);
  });

  test('is deterministic for identical input', () => {
    const run = () => JSON.stringify(layoutFor(390, 'maze_runner'));
    expect(run()).toBe(run());
    const runWide = () => JSON.stringify(layoutFor(1280, 'Alexandrina_Wolf', 14, 720));
    expect(runWide()).toBe(runWide());
  });
});
