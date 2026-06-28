import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

describe('legacy menu layout', () => {
  test('keeps the board centered with low outside buttons on desktop', () => {
    const layout = resolveLegacyMenuLayout(1920, 1080, 50, 49);

    const boardCenter = layout.boardLeft + (layout.boardSize / 2);

    expect(Math.abs(boardCenter - (layout.width / 2))).toBeLessThanOrEqual(2);
    expect(layout.buttonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonY).toBeLessThan(Math.round(layout.height * 0.88));
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(80);
    expect(layout.leftButtonX).toBeLessThan(layout.boardLeft);
    expect(layout.rightButtonX).toBeGreaterThan(layout.boardLeft + layout.boardSize);
  });

  test('keeps the portrait board dominant without pushing buttons off-screen', () => {
    const layout = resolveLegacyMenuLayout(430, 932, 50, 49);

    expect(layout.boardSize).toBeLessThan(layout.width);
    expect(layout.buttonY).toBeLessThan(layout.height);
    expect(layout.buttonWidth).toBeGreaterThanOrEqual(150);
  });
});
