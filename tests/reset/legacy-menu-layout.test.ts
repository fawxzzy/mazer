import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

describe('legacy menu layout', () => {
  test('keeps the board centered with low outside buttons on desktop', () => {
    const layout = resolveLegacyMenuLayout(1920, 1080, 50, 49);

    const boardCenter = layout.boardLeft + (layout.boardSize / 2);

    expect(Math.abs(boardCenter - (layout.width / 2))).toBeLessThanOrEqual(2);
    expect(layout.centerButtonY).toBeLessThan(layout.buttonY);
    expect(layout.centerButtonWidth).toBeGreaterThan(layout.buttonWidth);
    expect(layout.buttonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonY - (layout.buttonHeight / 2)).toBeGreaterThanOrEqual(layout.boardTop + layout.boardSize + 2);
    expect(layout.buttonY).toBeLessThan(Math.round(layout.height * 0.9));
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(48);
    expect(layout.buttonHeight).toBeLessThanOrEqual(72);
    expect(layout.leftButtonX).toBeLessThan(layout.boardLeft);
    expect(layout.rightButtonX).toBeGreaterThan(layout.boardLeft + layout.boardSize);
    expect(layout.buttonWidth).toBeLessThanOrEqual(224);
  });

  test('keeps the portrait board dominant with separated buttons near the board edge', () => {
    const layout = resolveLegacyMenuLayout(430, 932, 50, 49);

    expect(layout.boardSize).toBeLessThan(layout.width);
    expect(layout.centerButtonY).toBeLessThan(layout.buttonY);
    expect(layout.centerButtonWidth).toBeGreaterThanOrEqual(layout.buttonWidth);
    expect(layout.centerButtonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonY).toBeLessThan(layout.height);
    expect(layout.buttonWidth).toBeLessThanOrEqual(144);
    expect(layout.buttonHeight).toBeLessThanOrEqual(64);
    expect(layout.leftButtonX + (layout.buttonWidth / 2)).toBeLessThan(layout.centerButtonX - 8);
    expect(layout.rightButtonX - (layout.buttonWidth / 2)).toBeGreaterThan(layout.centerButtonX + 8);
  });
});
