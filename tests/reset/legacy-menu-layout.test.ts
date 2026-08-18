import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human';
import {
  resolveLegacyMenuLayout
} from '../../src/legacy-runtime/legacyMenuLayout';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';
import {
  resolveLegacyMenuPathTitleLayout,
  resolveLegacyMenuPathTitleOrbitGeometry,
  resolveLegacyMenuTitlePresentation
} from '../../src/legacy-runtime/legacyMenuTitle';

describe('legacy menu layout', () => {
  test('keeps the board centered with a bottom-docked action beneath it on desktop', () => {
    const layout = resolveLegacyMenuLayout(1920, 1080, 50, 49);

    const boardCenter = layout.boardLeft + (layout.boardSize / 2);

    expect(Math.abs(boardCenter - (layout.width / 2))).toBeLessThanOrEqual(2);
    expect(layout.leftButtonY).toBe(layout.buttonY);
    expect(layout.rightButtonY).toBe(layout.buttonY);
    expect(layout.centerButtonY).toBe(layout.buttonY);
    expect(layout.buttonLayout).toBe('row');
    expect(layout.buttonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(58);
    expect(layout.buttonHeight).toBeLessThanOrEqual(78);
    // The board now fills essentially all the vertical room left after the
    // deliberately small header/title/dock reserves, not a conservative
    // fixed ratio -- it should dominate the screen, not just occupy a
    // comfortable middle chunk of it.
    expect(layout.boardSize).toBeGreaterThanOrEqual(700);
    expect(layout.leftButtonX).toBeLessThan(layout.centerButtonX);
    expect(layout.rightButtonX).toBeGreaterThan(layout.centerButtonX);
    // The primary Start button is now a wide bottom-docked pill (see
    // MenuScene.ts's primaryButtonWidth), not derived from this row-of-three
    // geometry at all -- that geometry (buttonWidth/leftButtonX/rightButtonX)
    // is preserved correctly (verified overlap-free) for any future
    // three-button row consumer, but no longer describes what's on screen.
    expect(layout.buttonWidth).toBeGreaterThanOrEqual(220);
    expect(layout.buttonWidth).toBeLessThanOrEqual(238);
    expect(layout.lanes.title?.bottom).toBeLessThanOrEqual(layout.lanes.maze.top);
    expect(layout.titleY).toBeLessThan(layout.boardTop);
    expect(layout.lanes.rank).toBeNull();
    // The dock button sits near the bottom edge now, not tucked immediately
    // under the board -- that reclaimed space went to the board instead.
    expect(layout.height - layout.buttonY).toBeLessThanOrEqual(60);
    expect(layout.lanes.actions?.bottom).toBeLessThanOrEqual(layout.footerY);
  });

  test('keeps menu geometry stable across account states', () => {
    const authenticatedDesktop = resolveLegacyMenuLayout(1440, 900, 50, 49, 'menu', {
      menuActionMode: 'authenticated'
    });
    const guestDesktop = resolveLegacyMenuLayout(1440, 900, 50, 49, 'menu', {
      menuActionMode: 'guest'
    });
    const authenticatedPhone = resolveLegacyMenuLayout(405, 958, 50, 49, 'menu', {
      menuActionMode: 'authenticated'
    });
    const guestPhone = resolveLegacyMenuLayout(405, 958, 50, 49, 'menu', {
      menuActionMode: 'guest'
    });
    const authenticatedPlay = resolveLegacyMenuLayout(1440, 900, 50, 49, 'play', {
      menuActionMode: 'authenticated'
    });
    const guestPlay = resolveLegacyMenuLayout(1440, 900, 50, 49, 'play', {
      menuActionMode: 'guest'
    });
    const presentation = resolveLegacyMenuTitlePresentation(
      guestDesktop.lanes.title?.height ?? 0,
      guestDesktop.tileSize,
      false,
      guestDesktop.width,
      'procedural'
    );
    const title = resolveLegacyMenuPathTitleLayout(
      guestDesktop.titleX,
      guestDesktop.titleY,
      presentation.fontSize
    );

    // The menu intentionally sits below its persistent header lane instead of
    // competing with the level and settings controls at the top edge, and the
    // title sits above the board while the dock button sits near the bottom
    // -- three clearly separated bands, not one clustered "visible stack".
    expect(title.top).toBeGreaterThanOrEqual(guestDesktop.lanes.hud?.bottom ?? 0);
    expect(title.top).toBeLessThan(guestDesktop.boardTop);
    expect(guestDesktop.centerButtonY).toBeGreaterThan(guestDesktop.boardTop + guestDesktop.boardSize);
    expect(guestDesktop.height - guestDesktop.centerButtonY).toBeLessThanOrEqual(60);
    expect(guestDesktop).toEqual(authenticatedDesktop);
    expect(guestPhone).toEqual(authenticatedPhone);
    expect(guestPlay).toEqual(authenticatedPlay);
  });

  test('reserves one menu HUD lane before the title, maze, and actions', () => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 405, height: 958 },
      { width: 1440, height: 900 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu');

      expect(layout.lanes.hud).not.toBeNull();
      expect(layout.lanes.hud?.bottom).toBeLessThanOrEqual(layout.lanes.title?.top ?? 0);
      expect(layout.lanes.title?.bottom).toBeLessThanOrEqual(layout.lanes.maze.top);
      expect(layout.lanes.maze.bottom).toBeLessThanOrEqual(layout.lanes.actions?.top ?? 0);
    }
  });

  test('keeps the complete animated title shell out of the header controls and maze', () => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 405, height: 958 },
      { width: 430, height: 932 },
      { width: 1280, height: 720 },
      { width: 1440, height: 900 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu');
      const presentation = resolveLegacyMenuTitlePresentation(
        layout.lanes.title?.height ?? 0,
        layout.tileSize,
        viewport.height > viewport.width,
        viewport.width,
        'procedural'
      );
      const title = resolveLegacyMenuPathTitleLayout(layout.titleX, layout.titleY, presentation.fontSize);
      const orbit = resolveLegacyMenuPathTitleOrbitGeometry(
        title.left,
        title.top,
        title.width,
        title.height,
        title.cellSize
      );

      expect(orbit.top).toBeGreaterThanOrEqual((layout.lanes.hud?.bottom ?? 0));
      expect(orbit.bottom).toBeLessThanOrEqual(layout.lanes.maze.top);
    }
  });

  test('keeps the portrait board dominant with one compact lower action', () => {
    const layout = resolveLegacyMenuLayout(430, 932, 50, 49);

    expect(layout.boardSize).toBeLessThan(layout.width);
    // Board should still dominate the portrait screen -- most of the width.
    expect(layout.boardSize).toBeGreaterThanOrEqual(layout.width * 0.85);
    expect(layout.leftButtonY).toBe(layout.buttonY);
    expect(layout.rightButtonY).toBe(layout.buttonY);
    expect(layout.centerButtonY).toBe(layout.buttonY);
    expect(layout.buttonLayout).toBe('row');
    expect(layout.leftButtonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonY).toBeGreaterThan(layout.boardTop + layout.boardSize);
    expect(layout.buttonY - layout.leftButtonY).toBe(0);
    expect(layout.buttonY + (layout.buttonHeight / 2)).toBeLessThan(layout.footerY);
    expect(layout.buttonWidth).toBeLessThanOrEqual(144);
    expect(layout.buttonHeight).toBeLessThanOrEqual(62);
    expect(layout.leftButtonX).toBeLessThan(layout.centerButtonX);
    expect(layout.rightButtonX).toBeGreaterThan(layout.centerButtonX);
    expect(layout.titleY).toBeLessThan(layout.boardTop);
    // The dock button now sits near the bottom edge, not tucked immediately
    // under the board -- that reclaimed space went to the board instead.
    expect(layout.height - layout.buttonY).toBeLessThanOrEqual(60);
    // Title is a compact banner now: comfortably clear of both the header
    // lane above it and the board below it, not a specific fixed offset.
    expect(layout.titleY).toBeGreaterThanOrEqual(layout.lanes.hud?.bottom ?? 0);
    expect(layout.titleY).toBeLessThan(layout.boardTop);
  });

  test('centers the portrait title diamond on the board top notch while clearing the border', () => {
    const layout = resolveLegacyMenuLayout(405, 958, 50, 49, 'menu');
    const presentation = resolveLegacyMenuTitlePresentation(
      layout.lanes.title?.height ?? 0,
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
    // Title is a compact banner now (fontSize derives from the small
    // reserved lane height, not board size -- see legacyMenuTitle.ts), so
    // its footprint is much smaller than the old design's. What still
    // matters: it's centered on the board and its animated orbit shell
    // stays fully within its lane (header below it, board below that).
    expect(Math.abs(orbitGeometry.centerX - (layout.boardLeft + (layout.boardSize / 2)))).toBeLessThanOrEqual(0.5);
    expect(orbitGeometry.crownBottom).toBeLessThanOrEqual(layout.boardTop);
    expect(orbitGeometry.top).toBeGreaterThanOrEqual(layout.lanes.hud?.bottom ?? 0);
    expect(titleLayout.width).toBeGreaterThan(0);
    expect(titleLayout.width).toBeLessThanOrEqual(layout.width - 48);
  });

  test('uses one edge-tight board frame while scaling maze tiles on normal portrait phones', () => {
    const menuLayout = resolveLegacyMenuLayout(405, 958, 50, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(405, 958, 50, 49, 'play');

    expect(menuLayout.tileSize).toBeCloseTo(7.653, 3);
    expect(playLayout.tileSize).toBeCloseTo(7.653, 3);
    expect(menuLayout.boardSize).toBe(389);
    expect(playLayout.boardSize).toBe(389);
    expect(menuLayout.boardLeft).toBe(8);
    expect(playLayout.boardLeft).toBe(menuLayout.boardLeft);
    // A row of three buttons doesn't fit 405px width once rowButtonOffset
    // correctly reserves the center button's own width (see the fix
    // above) -- both surfaces fall back to the stacked layout via the
    // dynamic fit-check. Doesn't affect what's on screen: the front door
    // renders a single button from centerButtonX/Y directly.
    expect(menuLayout.buttonLayout).toBe('stack');
    expect(playLayout.buttonLayout).toBe('stack');
  });

  test('lets phone menu mazes reach the screen edge when progression scale permits fewer cells', () => {
    const layout = resolveLegacyMenuLayout(405, 958, 50, 46, 'menu');

    expect(layout.tileSize).toBeCloseTo(8.152, 3);
    expect(layout.boardSize).toBe(389);
    expect(layout.boardLeft).toBe(8);
    expect(layout.boardLeft + layout.boardSize).toBeLessThanOrEqual(layout.width - 8);
    expect(layout.titleY).toBeLessThan(layout.boardTop);
    expect(layout.buttonLayout).toBe('stack');
  });

  test('holds the same phone maze border across small and large cell counts', () => {
    const layouts = [37, 45, 49].map((mazeSize) => (
      resolveLegacyMenuLayout(390, 844, 50, mazeSize, 'menu')
    ));

    expect(layouts.map((layout) => layout.boardSize)).toEqual([374, 374, 374]);
    expect(layouts.map((layout) => layout.boardLeft)).toEqual([8, 8, 8]);
    expect(layouts[0]!.tileSize).toBeGreaterThan(layouts[1]!.tileSize);
    expect(layouts[1]!.tileSize).toBeGreaterThan(layouts[2]!.tileSize);
  });

  test('keeps normal phone-width menu geometry clear around the single action', () => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 740 },
      { width: 390, height: 844 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu');

      // A row of three buttons genuinely does not fit at these widths once
      // rowButtonOffset correctly reserves the center button's own width
      // (see the rowButtonOffset fix above) -- these fall back to the
      // stacked layout via the dynamic fit-check, not a fixed pixel
      // threshold. The single Start button MenuScene actually renders is
      // unaffected either way (it uses centerButtonX/Y directly, not this
      // row-vs-stack geometry).
      expect(layout.buttonLayout).toBe('stack');
      expect(layout.leftButtonX).toBe(layout.centerButtonX);
      expect(layout.rightButtonX).toBe(layout.centerButtonX);
      expect(layout.leftButtonX - (layout.buttonWidth / 2)).toBeGreaterThanOrEqual(0);
      expect(layout.rightButtonX + (layout.buttonWidth / 2)).toBeLessThanOrEqual(layout.width);
      expect(layout.buttonHeight).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(layout.boardLeft).toBeGreaterThanOrEqual(0);
      expect(layout.boardLeft + layout.boardSize).toBeLessThanOrEqual(layout.width);
      expect(layout.titleY).toBeLessThan(layout.boardTop);
      expect(layout.rightButtonY + (layout.buttonHeight / 2)).toBeLessThanOrEqual(layout.footerY);
    }
  });

  test('reclaims the old status-card lane for the single menu action', () => {
    const layout = resolveLegacyMenuLayout(360, 720, 50, 49, 'menu');

    expect(layout.lanes.rank).toBeNull();
    expect(layout.lanes.actions?.top).toBeLessThanOrEqual(
      layout.buttonY - (layout.buttonHeight / 2)
    );
  });

  test('keeps the single menu action centered regardless of account state', () => {
    for (const viewport of [
      { width: 405, height: 958 },
      { width: 430, height: 932 },
      { width: 1440, height: 900 }
    ]) {
      const authenticated = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu', {
        menuActionMode: 'authenticated'
      });
      const guest = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 'menu', {
        menuActionMode: 'guest'
      });

      expect(authenticated).toEqual(guest);
      expect(authenticated.centerButtonX).toBe(Math.round(viewport.width / 2));
      expect(authenticated.centerButtonY - (authenticated.buttonHeight / 2)).toBeGreaterThan(
        authenticated.boardTop + authenticated.boardSize
      );
      expect(authenticated.centerButtonY + (authenticated.buttonHeight / 2)).toBeLessThanOrEqual(
        authenticated.footerY
      );
    }
  });

  test('keeps the board and menu action lane within ultra-narrow side panels', () => {
    const layout = resolveLegacyMenuLayout(172, 407, 50, 49);

    expect(layout.buttonLayout).toBe('stack');
    expect(layout.buttonHeight).toBe(42);
    expect(layout.boardLeft).toBeGreaterThanOrEqual(0);
    expect(layout.boardLeft + layout.boardSize).toBeLessThanOrEqual(layout.width);
    expect(layout.tileSize).toBeGreaterThanOrEqual(3);
    expect(layout.tileSize).toBeGreaterThan(3);
    // The board now claims essentially all reclaimed vertical room (a
    // slightly smaller compact-title reserve and a slightly larger dock
    // bottom margin -- 20px vs. the old 18px footer margin, so the dock
    // button never sits below the footer text position -- shift this by a
    // sub-pixel amount at this exact viewport; 155px+ is still "fills the
    // narrow panel", the point of this assertion).
    expect(layout.boardSize).toBeGreaterThan(155);
    expect(layout.leftButtonX).toBe(layout.centerButtonX);
    expect(layout.rightButtonX).toBe(layout.centerButtonX);
    expect(layout.leftButtonY + layout.buttonHeight).toBeLessThan(layout.rightButtonY);
    expect(layout.rightButtonY + (layout.buttonHeight / 2)).toBeLessThanOrEqual(layout.footerY);
    expect(layout.buttonWidth).toBeLessThanOrEqual(layout.width - 36);
    expect(layout.centerButtonWidth).toBeLessThanOrEqual(layout.width - 20);
  });

  test('keeps ordinary narrow portrait views at the canonical touch floor', () => {
    const layout = resolveLegacyMenuLayout(280, 600, 50, 49, 'menu');

    expect(layout.buttonLayout).toBe('stack');
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
    expect(layout.leftButtonY + layout.buttonHeight).toBeLessThan(layout.rightButtonY);
    expect(layout.rightButtonY + (layout.buttonHeight / 2)).toBeLessThanOrEqual(layout.footerY);
  });

  test('keeps active-play controls clear of the board in ultra-narrow side panels without changing menu button math', () => {
    const menuLayout = resolveLegacyMenuLayout(172, 407, 50, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(172, 407, 50, 49, 'play');
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

    expect(playLayout.buttonLayout).toBe('stack');
    expect(playLayout.boardLeft).toBeGreaterThanOrEqual(0);
    expect(playLayout.boardLeft + playLayout.boardSize).toBeLessThanOrEqual(playLayout.width);
    expect(playLayout.lanes.hud?.bottom).toBeLessThanOrEqual(playLayout.lanes.maze.top);
    expect(playLayout.boardTop).toBe((playLayout.lanes.hud?.bottom ?? 0) + 4);
    expect(playLayout.boardTop).toBeGreaterThanOrEqual(48);
    expect(playLayout.boardTop + playLayout.boardSize + 12).toBeLessThanOrEqual(touchLayout.frame.top);
    expect(touchLayout.frame.right).toBeLessThanOrEqual(playLayout.width);
    expect(touchLayout.frame.bottom).toBeLessThanOrEqual(playLayout.height);
    expect(menuLayout.leftButtonY + menuLayout.buttonHeight).toBeLessThan(menuLayout.rightButtonY);
  });

  test('reserves play HUD and controller lanes on desktop as well as phones', () => {
    const layout = resolveLegacyMenuLayout(1440, 900, 50, 49, 'play');

    expect(layout.lanes.hud).not.toBeNull();
    expect(layout.lanes.controls).not.toBeNull();
    expect(layout.lanes.hud?.bottom).toBeLessThanOrEqual(layout.lanes.maze.top);
    expect(layout.lanes.maze.bottom).toBeLessThanOrEqual(layout.lanes.controls?.top ?? Number.NEGATIVE_INFINITY);
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
    expect(touchLayout.controls.pause.width).toBe(touchLayout.controls.move_up.width);
    expect(touchLayout.controls.restart_attempt.width).toBe(0);
    expect(touchLayout.controls.toggle_thoughts.width).toBe(0);
  });

  test('reserves a top mobile HUD lane and keeps the controller visually connected to the maze', () => {
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
    expect(touchLayout.frame.top).toBeLessThanOrEqual(playLayout.boardTop + playLayout.boardSize + 124);
  });

  test('keeps a substantial desktop maze after reserving the complete title shell', () => {
    const menuLayout = resolveLegacyMenuLayout(1920, 1080, 50, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(1920, 1080, 50, 49, 'play');

    expect(menuLayout.boardSize).toBeGreaterThanOrEqual(600);
    // Menu now deliberately fills to the edges (a much smaller title
    // reserve, board claims all remaining room) while play surface keeps
    // its previous, more conservative ratio-based sizing untouched -- menu
    // is no longer guaranteed smaller than play; at this viewport it's
    // actually larger.
    expect(menuLayout.boardSize).toBeGreaterThan(playLayout.boardSize);
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
      expect(first.lanes.rank).toBeNull();
      expect(first.lanes.maze.bottom).toBeLessThanOrEqual(first.lanes.actions?.top ?? 0);
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

  test('centers wide play controls in the reserved lower lane and keeps pause above the maze', () => {
    const playLayout = resolveLegacyMenuLayout(1280, 720, 50, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true,
      placement: 'bottom-centered',
      avoidRect: {
        left: playLayout.boardLeft,
        top: playLayout.boardTop,
        width: playLayout.boardSize,
        height: playLayout.boardSize
      }
    });

    expect(Math.abs(touchLayout.frame.centerX - (playLayout.width / 2))).toBeLessThanOrEqual(1);
    expect(touchLayout.frame.top).toBeGreaterThanOrEqual(playLayout.boardTop + playLayout.boardSize);
    expect(touchLayout.controls.pause.left).toBeGreaterThanOrEqual(playLayout.boardLeft + playLayout.boardSize + 8);
    expect(touchLayout.controls.pause.bottom).toBeLessThanOrEqual(playLayout.boardTop);
  });
});
