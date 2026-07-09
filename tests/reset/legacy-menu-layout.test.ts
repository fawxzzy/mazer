import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

describe('legacy menu layout', () => {
  test('keeps the board centered with low outside buttons on desktop', () => {
    const layout = resolveLegacyMenuLayout(1920, 1080, 50, 49);

    const boardCenter = layout.boardLeft + (layout.boardSize / 2);

    expect(Math.abs(boardCenter - (layout.width / 2))).toBeLessThanOrEqual(2);
    expect(layout.leftButtonY).toBe(layout.buttonY);
    expect(layout.rightButtonY).toBe(layout.buttonY);
    expect(layout.centerButtonY).toBe(layout.buttonY);
    expect(layout.buttonLayout).toBe('row');
    expect(layout.buttonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonY - (layout.buttonHeight / 2)).toBeGreaterThanOrEqual(layout.boardTop + layout.boardSize + 38);
    expect(layout.buttonY + (layout.buttonHeight / 2)).toBeLessThan(layout.footerY);
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(58);
    expect(layout.buttonHeight).toBeLessThanOrEqual(78);
    expect(layout.boardSize).toBeGreaterThanOrEqual(833);
    expect(layout.boardSize).toBeLessThanOrEqual(882);
    expect(layout.leftButtonX).toBeGreaterThan(layout.boardLeft);
    expect(layout.rightButtonX).toBeLessThan(layout.boardLeft + layout.boardSize);
    expect(layout.leftButtonX).toBeLessThan(layout.centerButtonX);
    expect(layout.rightButtonX).toBeGreaterThan(layout.centerButtonX);
    expect(layout.rightButtonX - layout.leftButtonX).toBeGreaterThanOrEqual(layout.buttonWidth + 18);
    expect(layout.rightButtonX - layout.leftButtonX).toBeLessThanOrEqual(layout.buttonWidth + 34);
    expect(layout.leftButtonY - (layout.boardTop + layout.boardSize)).toBeGreaterThanOrEqual(74);
    expect(layout.leftButtonY - (layout.boardTop + layout.boardSize)).toBeLessThanOrEqual(92);
    expect(layout.buttonWidth).toBeGreaterThanOrEqual(220);
    expect(layout.buttonWidth).toBeLessThanOrEqual(238);
    expect(layout.titleY).toBeGreaterThan(layout.boardTop + Math.round(layout.boardSize * 0.205));
    expect(layout.titleY).toBeLessThan(layout.boardTop + Math.round(layout.boardSize * 0.225));
  });

  test('keeps the portrait board dominant with separated buttons near the board edge', () => {
    const layout = resolveLegacyMenuLayout(430, 932, 50, 49);

    expect(layout.boardSize).toBeLessThan(layout.width);
    expect(layout.leftButtonY).toBe(layout.buttonY);
    expect(layout.rightButtonY).toBe(layout.buttonY);
    expect(layout.centerButtonY).toBe(layout.buttonY);
    expect(layout.buttonLayout).toBe('row');
    expect(layout.leftButtonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.leftButtonY - (layout.boardTop + layout.boardSize)).toBeGreaterThanOrEqual(62);
    expect(layout.leftButtonY - (layout.boardTop + layout.boardSize)).toBeLessThanOrEqual(88);
    expect(layout.leftButtonY - (layout.buttonHeight / 2)).toBeGreaterThanOrEqual(layout.boardTop + layout.boardSize + 40);
    expect(layout.buttonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonY - layout.leftButtonY).toBe(0);
    expect(layout.buttonY).toBeLessThan(layout.height);
    expect(layout.buttonWidth).toBeLessThanOrEqual(144);
    expect(layout.buttonHeight).toBeLessThanOrEqual(62);
    expect(layout.leftButtonX).toBeLessThan(layout.centerButtonX);
    expect(layout.rightButtonX).toBeGreaterThan(layout.centerButtonX);
    expect(layout.rightButtonX - layout.leftButtonX).toBeGreaterThanOrEqual(layout.buttonWidth + 14);
    expect(layout.rightButtonX - layout.leftButtonX).toBeLessThanOrEqual(layout.buttonWidth + 22);
    expect(layout.titleY).toBeLessThan(layout.boardTop);
    expect(layout.boardTop - layout.titleY).toBeGreaterThanOrEqual(42);
    expect(layout.titleY).toBeGreaterThanOrEqual(34);
  });

  test('keeps normal phone-width menu buttons horizontal instead of using the side-panel stack', () => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 740 },
      { width: 390, height: 844 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu');

      expect(layout.buttonLayout).toBe('row');
      expect(layout.leftButtonY).toBe(layout.rightButtonY);
      expect(layout.leftButtonY).toBe(layout.buttonY);
      expect(layout.leftButtonX).toBeLessThan(layout.centerButtonX);
      expect(layout.rightButtonX).toBeGreaterThan(layout.centerButtonX);
      expect(layout.leftButtonX - (layout.buttonWidth / 2)).toBeGreaterThanOrEqual(8);
      expect(layout.rightButtonX + (layout.buttonWidth / 2)).toBeLessThanOrEqual(layout.width - 8);
      expect(layout.boardLeft).toBeGreaterThanOrEqual(8);
      expect(layout.boardLeft + layout.boardSize).toBeLessThanOrEqual(layout.width - 8);
      expect(layout.titleY).toBeLessThan(layout.boardTop);
      expect(layout.leftButtonY + (layout.buttonHeight / 2)).toBeLessThan(layout.footerY);
    }
  });

  test('stacks the two front-door buttons and fits the board in ultra-narrow side panels', () => {
    const layout = resolveLegacyMenuLayout(172, 407, 50, 49);

    expect(layout.buttonLayout).toBe('stack');
    expect(layout.boardLeft).toBeGreaterThanOrEqual(0);
    expect(layout.boardLeft + layout.boardSize).toBeLessThanOrEqual(layout.width);
    expect(layout.tileSize).toBeGreaterThanOrEqual(3);
    expect(layout.tileSize).toBeGreaterThan(3);
    expect(layout.boardSize).toBeGreaterThan(160);
    expect(layout.leftButtonX).toBe(layout.centerButtonX);
    expect(layout.rightButtonX).toBe(layout.centerButtonX);
    expect(layout.leftButtonY + layout.buttonHeight).toBeLessThan(layout.rightButtonY);
    expect(layout.rightButtonY + (layout.buttonHeight / 2)).toBeLessThan(layout.footerY);
    expect(layout.buttonWidth).toBeLessThanOrEqual(layout.width - 36);
    expect(layout.centerButtonWidth).toBeLessThanOrEqual(layout.width - 20);
  });

  test('keeps active-play controls clear of the board in ultra-narrow side panels without changing menu button math', () => {
    const menuLayout = resolveLegacyMenuLayout(172, 407, 50, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(172, 407, 50, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true
    });

    expect(playLayout.buttonLayout).toBe('stack');
    expect(playLayout.boardLeft).toBe(menuLayout.boardLeft);
    expect(playLayout.boardSize).toBe(menuLayout.boardSize);
    expect(playLayout.tileSize).toBe(menuLayout.tileSize);
    expect(playLayout.boardTop).toBeGreaterThanOrEqual(menuLayout.boardTop);
    expect(playLayout.boardTop).toBeGreaterThanOrEqual(48);
    expect(playLayout.boardTop + playLayout.boardSize + 12).toBeLessThanOrEqual(touchLayout.frame.top);
    expect(touchLayout.frame.right).toBeLessThanOrEqual(playLayout.width);
    expect(touchLayout.frame.bottom).toBeLessThanOrEqual(playLayout.height);
    expect(menuLayout.leftButtonY + menuLayout.buttonHeight).toBeLessThan(menuLayout.rightButtonY);
  });

  test('keeps the compact phone control deck below the active-play board', () => {
    const playLayout = resolveLegacyMenuLayout(360, 740, 50, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true
    });

    expect(playLayout.boardTop + playLayout.boardSize + 24).toBeLessThanOrEqual(touchLayout.frame.top);
    expect(touchLayout.controls.pause.width).toBeGreaterThan(touchLayout.controls.move_up.width);
    expect(touchLayout.controls.restart_attempt.top).toBe(touchLayout.controls.pause.top);
    expect(touchLayout.controls.toggle_thoughts.width).toBe(0);
  });

  test('gives desktop active play a larger board than the front-door composition', () => {
    const menuLayout = resolveLegacyMenuLayout(1920, 1080, 50, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(1920, 1080, 50, 49, 'play');

    expect(playLayout.boardSize).toBeGreaterThan(menuLayout.boardSize);
    expect(Math.abs((playLayout.boardLeft + (playLayout.boardSize / 2)) - (playLayout.width / 2))).toBeLessThanOrEqual(2);
    expect(playLayout.boardTop).toBeGreaterThanOrEqual(56);
    expect(playLayout.boardTop + playLayout.boardSize).toBeLessThanOrEqual(playLayout.height - 12);
  });

  test('keeps compact landscape active-play controls out of the board gutters', () => {
    const playLayout = resolveLegacyMenuLayout(1280, 690, 50, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true,
      avoidRect: {
        left: playLayout.boardLeft,
        top: playLayout.boardTop,
        width: playLayout.boardSize,
        height: playLayout.boardSize
      }
    });

    expect(touchLayout.frames).toHaveLength(2);
    expect(touchLayout.frames?.[0].right).toBeLessThanOrEqual(playLayout.boardLeft - 18);
    expect(touchLayout.frames?.[1].left).toBeGreaterThanOrEqual(playLayout.boardLeft + playLayout.boardSize + 18);
    expect(touchLayout.controls.move_right.right).toBeLessThanOrEqual(playLayout.boardLeft - 8);
    expect(touchLayout.controls.pause.left).toBeGreaterThanOrEqual(playLayout.boardLeft + playLayout.boardSize + 8);
    expect(touchLayout.controls.restart_attempt.left).toBe(touchLayout.controls.pause.left);
    expect(touchLayout.controls.toggle_thoughts.width).toBe(0);
  });
});
