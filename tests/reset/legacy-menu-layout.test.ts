import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human';
import {
  resolveLegacyAuthenticatedMenuButtonStack,
  resolveLegacyMenuLayout
} from '../../src/legacy-runtime/legacyMenuLayout';
import {
  resolveLegacyMenuPathTitleLayout,
  resolveLegacyMenuPathTitleOrbitGeometry,
  resolveLegacyMenuTitlePresentation
} from '../../src/legacy-runtime/legacyMenuTitle';

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
    expect(layout.buttonY - (layout.buttonHeight / 2)).toBeGreaterThanOrEqual(layout.boardTop + layout.boardSize + 54);
    expect(layout.buttonY + (layout.buttonHeight / 2)).toBeLessThan(layout.footerY);
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(58);
    expect(layout.buttonHeight).toBeLessThanOrEqual(78);
    expect(layout.boardSize).toBeGreaterThanOrEqual(600);
    expect(layout.boardSize).toBeLessThanOrEqual(790);
    expect(layout.leftButtonX).toBeGreaterThan(layout.boardLeft);
    expect(layout.rightButtonX).toBeLessThan(layout.boardLeft + layout.boardSize);
    expect(layout.leftButtonX).toBeLessThan(layout.centerButtonX);
    expect(layout.rightButtonX).toBeGreaterThan(layout.centerButtonX);
    expect(layout.rightButtonX - layout.leftButtonX).toBeGreaterThanOrEqual(layout.buttonWidth + 18);
    expect(layout.rightButtonX - layout.leftButtonX).toBeLessThanOrEqual(layout.buttonWidth + 34);
    expect(layout.leftButtonY - (layout.boardTop + layout.boardSize)).toBeGreaterThanOrEqual(116);
    expect(layout.leftButtonY - (layout.boardTop + layout.boardSize)).toBeLessThanOrEqual(140);
    expect(layout.buttonWidth).toBeGreaterThanOrEqual(220);
    expect(layout.buttonWidth).toBeLessThanOrEqual(238);
    expect(layout.lanes.title?.bottom).toBeLessThanOrEqual(layout.lanes.maze.top);
    expect(layout.titleY).toBeLessThan(layout.boardTop);
  });

  test('keeps the portrait board dominant with separated buttons in the lower action lane', () => {
    const layout = resolveLegacyMenuLayout(430, 932, 50, 49);

    expect(layout.boardSize).toBeLessThan(layout.width);
    expect(layout.leftButtonY).toBe(layout.buttonY);
    expect(layout.rightButtonY).toBe(layout.buttonY);
    expect(layout.centerButtonY).toBe(layout.buttonY);
    expect(layout.buttonLayout).toBe('row');
    expect(layout.leftButtonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.leftButtonY - (layout.boardTop + layout.boardSize)).toBeGreaterThanOrEqual(120);
    expect(layout.leftButtonY - (layout.buttonHeight / 2)).toBeGreaterThanOrEqual(layout.boardTop + layout.boardSize + 84);
    expect(layout.buttonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonY - layout.leftButtonY).toBe(0);
    expect(layout.buttonY + (layout.buttonHeight / 2)).toBeLessThan(layout.footerY);
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

  test('centers the portrait title diamond on the board top notch while clearing the border', () => {
    const layout = resolveLegacyMenuLayout(405, 958, 50, 49, 'menu');
    const presentation = resolveLegacyMenuTitlePresentation(
      layout.boardSize,
      layout.tileSize,
      true,
      layout.width,
      'procedural'
    );
    const titleLayout = resolveLegacyMenuPathTitleLayout(layout.titleX, layout.titleY, presentation.fontSize);
    const orbitGeometry = resolveLegacyMenuPathTitleOrbitGeometry(
      titleLayout.left,
      titleLayout.top,
      titleLayout.width,
      titleLayout.height,
      titleLayout.cellSize
    );
    const orbitClearance = Math.max(9, Math.round(titleLayout.cellSize * 1.5));
    const borderTop = layout.boardTop - 2;

    expect(Math.abs(orbitGeometry.centerX - (layout.boardLeft + (layout.boardSize / 2)))).toBeLessThanOrEqual(0.5);
    expect(orbitGeometry.crownBottom + orbitClearance).toBeLessThanOrEqual(borderTop + 1);
    expect(orbitGeometry.crownBottom).toBeGreaterThanOrEqual(layout.boardTop - 32);
    expect(titleLayout.width).toBeGreaterThanOrEqual(300);
    expect(titleLayout.width).toBeLessThanOrEqual(layout.width - 48);
  });

  test('uses the cleaner 110-percent-style tile cadence on normal portrait phones', () => {
    const menuLayout = resolveLegacyMenuLayout(405, 958, 50, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(405, 958, 50, 49, 'play');

    expect(menuLayout.tileSize).toBe(7);
    expect(playLayout.tileSize).toBe(7);
    expect(menuLayout.boardSize).toBe(357);
    expect(playLayout.boardSize).toBe(357);
    expect(menuLayout.boardLeft).toBeGreaterThanOrEqual(24);
    expect(playLayout.boardLeft).toBe(menuLayout.boardLeft);
    expect(menuLayout.buttonLayout).toBe('row');
    expect(playLayout.buttonLayout).toBe('row');
  });

  test('lets phone menu mazes reach the screen edge when progression scale permits fewer cells', () => {
    const layout = resolveLegacyMenuLayout(405, 958, 50, 46, 'menu');

    expect(layout.tileSize).toBe(8);
    expect(layout.boardSize).toBe(382);
    expect(layout.boardLeft).toBeGreaterThanOrEqual(8);
    expect(layout.boardLeft + layout.boardSize).toBeLessThanOrEqual(layout.width - 8);
    expect(layout.titleY).toBeLessThan(layout.boardTop);
    expect(layout.buttonLayout).toBe('row');
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
      expect(layout.leftButtonY - (layout.boardTop + layout.boardSize)).toBeGreaterThanOrEqual(96);
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

  test('reserves a positive 360x720 rank-to-action lane gap', () => {
    const layout = resolveLegacyMenuLayout(360, 720, 50, 49, 'menu');

    expect(layout.lanes.rank?.bottom).toBeLessThan(layout.lanes.actions?.top ?? Number.NEGATIVE_INFINITY);
    expect(layout.lanes.actions?.top).toBeLessThanOrEqual(
      layout.buttonY - (layout.buttonHeight / 2)
    );
  });

  test('keeps authenticated start and options side-by-side on portrait phones', () => {
    for (const viewport of [
      { width: 405, height: 958 },
      { width: 430, height: 932 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu');
      const authenticated = resolveLegacyAuthenticatedMenuButtonStack(layout);

      expect(authenticated.buttonLayout).toBe('row');
      expect(authenticated.startButtonY).toBe(layout.buttonY);
      expect(authenticated.optionsButtonY).toBe(layout.buttonY);
      expect(authenticated.optionsButtonHeight).toBe(layout.buttonHeight);
      expect(authenticated.startButtonX).toBe(layout.leftButtonX);
      expect(authenticated.optionsButtonX).toBe(layout.rightButtonX);
      expect(authenticated.startButtonX).toBeLessThan(layout.centerButtonX);
      expect(authenticated.optionsButtonX).toBeGreaterThan(layout.centerButtonX);
      expect(authenticated.startButtonY - (layout.boardTop + layout.boardSize)).toBeGreaterThanOrEqual(96);
      expect(authenticated.startButtonY + (layout.buttonHeight / 2)).toBeLessThan(layout.footerY);
    }
  });

  test('keeps authenticated start and options buttons padded as one centered stack on desktop', () => {
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu');
      const stack = resolveLegacyAuthenticatedMenuButtonStack(layout);
      const startBottom = stack.startButtonY + (layout.buttonHeight / 2);
      const optionsTop = stack.optionsButtonY - (stack.optionsButtonHeight / 2);
      const stackTop = stack.startButtonY - (layout.buttonHeight / 2);
      const stackBottom = stack.optionsButtonY + (stack.optionsButtonHeight / 2);
      const availableHeight = layout.footerY - (layout.boardTop + layout.boardSize);
      const expectedCenter = availableHeight >= stack.authenticatedStackHeight + 18
        ? layout.centerButtonY
        : (layout.boardTop + layout.boardSize) + (availableHeight / 2);

      expect(stack.buttonLayout).toBe('stack');
      expect(stack.startButtonX).toBe(layout.centerButtonX);
      expect(stack.optionsButtonX).toBe(layout.centerButtonX);
      expect(Math.round(optionsTop - startBottom)).toBeGreaterThanOrEqual(10);
      expect(Math.round(optionsTop - startBottom)).toBeLessThanOrEqual(14);
      expect(Math.abs(((stackTop + stackBottom) / 2) - expectedCenter)).toBeLessThanOrEqual(1);
      expect(stackTop).toBeGreaterThan(layout.boardTop + layout.boardSize);
      if (viewport.width >= 1000) {
        expect(stackTop - (layout.boardTop + layout.boardSize)).toBeGreaterThanOrEqual(40);
      }
      expect(stackBottom).toBeLessThan(layout.footerY);
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
    expect(playLayout.boardLeft).toBeGreaterThanOrEqual(0);
    expect(playLayout.boardLeft + playLayout.boardSize).toBeLessThanOrEqual(playLayout.width);
    expect(playLayout.lanes.hud?.bottom).toBeLessThanOrEqual(playLayout.lanes.maze.top);
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
    expect(touchLayout.controls.restart_attempt.width).toBe(0);
    expect(touchLayout.controls.toggle_thoughts.width).toBe(0);
  });

  test('reserves a top mobile HUD lane for played-game badge and pause without overlapping the maze', () => {
    const playLayout = resolveLegacyMenuLayout(405, 958, 50, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true,
      controlMode: 'stick',
      avoidRect: {
        left: playLayout.boardLeft,
        top: playLayout.boardTop,
        width: playLayout.boardSize,
        height: playLayout.boardSize
      }
    });

    expect(playLayout.boardTop).toBeGreaterThanOrEqual(62);
    expect(playLayout.boardTop).toBe((playLayout.lanes.hud?.bottom ?? 0) + 8);
    expect(touchLayout.controls.pause.top).toBeLessThan(16);
    expect(touchLayout.controls.pause.right).toBeGreaterThanOrEqual(playLayout.width - 14);
    expect(touchLayout.controls.pause.left).toBeGreaterThan(playLayout.width * 0.7);
    expect(touchLayout.controls.pause.bottom + 12).toBeLessThanOrEqual(playLayout.boardTop);
    expect(playLayout.boardTop + playLayout.boardSize + 24).toBeLessThanOrEqual(touchLayout.frame.top);
  });

  test('gives desktop active play a larger board than the front-door composition', () => {
    const menuLayout = resolveLegacyMenuLayout(1920, 1080, 50, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(1920, 1080, 50, 49, 'play');

    expect(playLayout.boardSize).toBeGreaterThan(menuLayout.boardSize);
    expect(Math.abs((playLayout.boardLeft + (playLayout.boardSize / 2)) - (playLayout.width / 2))).toBeLessThanOrEqual(2);
    expect(playLayout.boardTop).toBeGreaterThanOrEqual(56);
    expect(playLayout.boardTop + playLayout.boardSize).toBeLessThanOrEqual(playLayout.height - 12);
  });

  test('keeps menu lanes ordered and non-overlapping across resize round trips', () => {
    const viewports = [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 }
    ];

    for (const viewport of viewports) {
      const first = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu');
      resolveLegacyMenuLayout(viewport.height, viewport.width, 50, 49, 'menu');
      const restored = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu');

      expect(restored).toEqual(first);
      expect(first.lanes.title?.bottom).toBeLessThanOrEqual(first.lanes.maze.top);
      expect(first.lanes.maze.bottom).toBeLessThanOrEqual(first.lanes.rank?.top ?? 0);
      expect(first.lanes.rank?.bottom).toBeLessThanOrEqual(first.lanes.actions?.top ?? 0);
      expect(first.lanes.actions?.bottom).toBeLessThanOrEqual(first.footerY);
    }
  });

  test('keeps play HUD, maze, and portrait controls in separate lanes', () => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'play');

      expect(layout.lanes.hud?.bottom).toBeLessThanOrEqual(layout.lanes.maze.top);
      expect(layout.lanes.maze.bottom).toBeLessThanOrEqual(layout.lanes.controls?.top ?? 0);
      expect(layout.lanes.controls?.bottom).toBeLessThanOrEqual(layout.height);
    }
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
    expect(touchLayout.controls.restart_attempt.width).toBe(0);
    expect(touchLayout.controls.toggle_thoughts.width).toBe(0);
  });
});
