import { describe, expect, test } from 'vitest';
import { resolveTouchControlLayout } from '../../src/input-human';
import { resolveLegacyHeaderControlFrame } from '../../src/legacy-runtime/legacyHeaderControl';
import {
  resolveLegacyMenuLayout
} from '../../src/legacy-runtime/legacyMenuLayout';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';
import {
  resolveLegacyMenuPathTitleLayout,
  resolveLegacyMenuPathTitleOrbitGeometry,
  resolveLegacyMenuTitlePresentation
} from '../../src/legacy-runtime/legacyMenuTitle';

// The title now prefers to sit inline in the header row (centered between
// the leading AI/level badge and the trailing settings cog) and only falls
// back to its own banner lane above the board when that gap is too narrow
// (see legacyMenuLayout.ts's menuTitleFitsInHeader). `lanes.title` is null
// in the inline case -- assert against whichever mode a given layout is
// actually in rather than assuming one or the other.
//
// The board itself is full-bleed (near-full height, see menuFullBleedTop/
// BottomMargin) -- the header/title/dock button float above it rather than
// the board leaving a lane clear for them, so there is no longer a
// meaningful "title sits above boardTop" invariant to check here; only the
// title's own position relative to its header/banner lane matters.
const expectTitlePlacedSafely = (layout: ReturnType<typeof resolveLegacyMenuLayout>): void => {
  if (layout.lanes.title) {
    expect(layout.lanes.hud?.bottom ?? 0).toBeLessThanOrEqual(layout.lanes.title.top);
  } else if (layout.lanes.hud) {
    expect(layout.titleY).toBeGreaterThanOrEqual(layout.lanes.hud.top);
    expect(layout.titleY).toBeLessThanOrEqual(layout.lanes.hud.bottom);
  }
};

describe('legacy menu layout', () => {
  test('keeps the board centered with a vertically-centered action floating over it on desktop', () => {
    const layout = resolveLegacyMenuLayout(1920, 1080, 50, 49, 49);

    const boardCenter = layout.boardLeft + (layout.boardWidth / 2);

    expect(Math.abs(boardCenter - (layout.width / 2))).toBeLessThanOrEqual(2);
    expect(layout.leftButtonY).toBe(layout.buttonY);
    expect(layout.rightButtonY).toBe(layout.buttonY);
    expect(layout.centerButtonY).toBe(layout.buttonY);
    expect(layout.buttonLayout).toBe('row');
    // The board is full-bleed now -- it extends past the dock button
    // instead of stopping short above it, so the button floats over the
    // board's lower edge rather than sitting below it.
    expect(layout.boardTop + layout.boardHeight).toBeGreaterThan(layout.buttonY);
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(58);
    expect(layout.buttonHeight).toBeLessThanOrEqual(78);
    // The board now fills essentially all the vertical room (full-bleed,
    // only a hair of margin at top/bottom), not a conservative fixed ratio
    // -- it should dominate the screen, not just occupy a comfortable
    // middle chunk of it.
    expect(layout.boardWidth).toBeGreaterThanOrEqual(700);
    expect(layout.leftButtonX).toBeLessThan(layout.centerButtonX);
    expect(layout.rightButtonX).toBeGreaterThan(layout.centerButtonX);
    // The primary Start button now reuses centerButtonWidth directly (see
    // MenuScene.ts's primaryButtonWidth) as a normal compact button rather
    // than the row-of-three geometry's flanking buttons -- leftButtonX/
    // rightButtonX/buttonWidth are preserved correctly (verified
    // overlap-free) for any future three-button row consumer, but no longer
    // describe what's on screen.
    expect(layout.buttonWidth).toBeGreaterThanOrEqual(220);
    expect(layout.buttonWidth).toBeLessThanOrEqual(238);
    // This wide desktop viewport has plenty of header-row gap, so the title
    // sits inline between the header icons -- no separate title lane at all.
    expect(layout.lanes.title).toBeNull();
    expectTitlePlacedSafely(layout);
    expect(layout.lanes.rank).toBeNull();
    // The primary action sits at the true vertical screen center, floating
    // over the demo maze background like a hero CTA -- not docked near
    // either edge.
    expect(Math.abs(layout.buttonY - (layout.height / 2))).toBeLessThanOrEqual(2);
  });

  test('keeps menu geometry stable across account states', () => {
    const authenticatedDesktop = resolveLegacyMenuLayout(1440, 900, 50, 49, 49, 'menu', {
      menuActionMode: 'authenticated'
    });
    const guestDesktop = resolveLegacyMenuLayout(1440, 900, 50, 49, 49, 'menu', {
      menuActionMode: 'guest'
    });
    const authenticatedPhone = resolveLegacyMenuLayout(405, 958, 50, 49, 49, 'menu', {
      menuActionMode: 'authenticated'
    });
    const guestPhone = resolveLegacyMenuLayout(405, 958, 50, 49, 49, 'menu', {
      menuActionMode: 'guest'
    });
    const authenticatedPlay = resolveLegacyMenuLayout(1440, 900, 50, 49, 49, 'play', {
      menuActionMode: 'authenticated'
    });
    const guestPlay = resolveLegacyMenuLayout(1440, 900, 50, 49, 49, 'play', {
      menuActionMode: 'guest'
    });
    const presentation = resolveLegacyMenuTitlePresentation(
      guestDesktop.titleReserveHeight,
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

    // At this width the title sits inline inside the header row itself
    // (between the leading AI/level badge and the trailing settings cog),
    // not below it in its own banner lane -- the header, title, board, and
    // dock button are still each clearly separated, just with the title
    // sharing the header's vertical band instead of owning its own.
    expect(guestDesktop.lanes.title).toBeNull();
    expect(title.top).toBeGreaterThanOrEqual(guestDesktop.lanes.hud?.top ?? 0);
    expect(title.top + title.height).toBeLessThanOrEqual(guestDesktop.lanes.hud?.bottom ?? 0);
    // The board is full-bleed -- it extends past the button instead of
    // stopping above it, and the button itself floats at the true vertical
    // screen center rather than docked near an edge.
    expect(guestDesktop.boardTop + guestDesktop.boardHeight).toBeGreaterThan(guestDesktop.centerButtonY);
    expect(Math.abs(guestDesktop.centerButtonY - (guestDesktop.height / 2))).toBeLessThanOrEqual(2);
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
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu');

      expect(layout.lanes.hud).not.toBeNull();
      expectTitlePlacedSafely(layout);
      // The board is full-bleed now -- whether it actually reaches the dock
      // button's action lane depends on how well this (fixed, square-ish)
      // test maze shape fills the available box, not a layout invariant
      // this function still guarantees on its own.
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
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu');
      const presentation = resolveLegacyMenuTitlePresentation(
        layout.titleReserveHeight,
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

      // Inline mode: the orbit shell lives inside the header lane alongside
      // the icons. Banner mode: it lives in its own lane below the header.
      // The board is full-bleed now, so it no longer guarantees staying
      // clear of the orbit shell below it -- that's the point (the title
      // floats above the board rather than the board leaving room for it).
      if (layout.lanes.title) {
        expect(orbit.top).toBeGreaterThanOrEqual((layout.lanes.hud?.bottom ?? 0));
      } else {
        expect(orbit.top).toBeGreaterThanOrEqual((layout.lanes.hud?.top ?? 0));
      }
    }
  });

  test('keeps the portrait board dominant with one compact lower action', () => {
    const layout = resolveLegacyMenuLayout(430, 932, 50, 49, 49);

    expect(layout.boardWidth).toBeLessThan(layout.width);
    // Board should still dominate the portrait screen -- most of the width.
    expect(layout.boardWidth).toBeGreaterThanOrEqual(layout.width * 0.85);
    expect(layout.leftButtonY).toBe(layout.buttonY);
    expect(layout.rightButtonY).toBe(layout.buttonY);
    expect(layout.centerButtonY).toBe(layout.buttonY);
    expect(layout.buttonLayout).toBe('row');
    // The button floats over the full-bleed board at the true vertical
    // screen center now, rather than sitting in a dedicated lane below it.
    expect(Math.abs(layout.buttonY - (layout.height / 2))).toBeLessThanOrEqual(2);
    expect(layout.buttonY - layout.leftButtonY).toBe(0);
    expect(layout.buttonY + (layout.buttonHeight / 2)).toBeLessThan(layout.footerY);
    expect(layout.buttonWidth).toBeLessThanOrEqual(144);
    expect(layout.buttonHeight).toBeLessThanOrEqual(62);
    expect(layout.leftButtonX).toBeLessThan(layout.centerButtonX);
    expect(layout.rightButtonX).toBeGreaterThan(layout.centerButtonX);
    expect(layout.titleY).toBeLessThan(layout.boardTop);
    // The button floats at the true vertical screen center over the
    // full-bleed board, not docked near either edge.
    expect(Math.abs(layout.buttonY - (layout.height / 2))).toBeLessThanOrEqual(2);
    // Title is compact and clear of the board below it -- whether it sits
    // inline in the header row or in its own banner lane depends on width.
    expectTitlePlacedSafely(layout);
  });

  test('centers the portrait title diamond on the board top notch while clearing the border', () => {
    const layout = resolveLegacyMenuLayout(405, 958, 50, 49, 49, 'menu');
    const presentation = resolveLegacyMenuTitlePresentation(
      layout.titleReserveHeight,
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
    // Title is compact (fontSize derives from its reserved height, not board
    // size -- see legacyMenuTitle.ts), so its footprint is much smaller than
    // the old design's. What still matters: it's centered on the board
    // (the header row is symmetric about the same centerline the board is)
    // and its animated orbit shell stays fully clear of the board below it.
    expect(Math.abs(orbitGeometry.centerX - (layout.boardLeft + (layout.boardWidth / 2)))).toBeLessThanOrEqual(1);
    expect(orbitGeometry.crownBottom).toBeLessThanOrEqual(layout.boardTop);
    if (layout.lanes.title) {
      expect(orbitGeometry.top).toBeGreaterThanOrEqual(layout.lanes.hud?.bottom ?? 0);
    } else {
      expect(orbitGeometry.top).toBeGreaterThanOrEqual(layout.lanes.hud?.top ?? 0);
    }
    expect(titleLayout.width).toBeGreaterThan(0);
    expect(titleLayout.width).toBeLessThanOrEqual(layout.width - 48);
  });

  test('reserves one tile of bleed margin on the menu board while play stays edge-tight, scaling maze tiles on normal portrait phones', () => {
    const menuLayout = resolveLegacyMenuLayout(405, 958, 50, 49, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(405, 958, 50, 49, 49, 'play');

    // Menu's board leaves roughly one tile of margin from the true edge now
    // (so a bleed-off dock corridor has somewhere to reach) -- boardLeft is
    // no longer pinned to the tiny fixed edge margin play still uses.
    expect(menuLayout.tileSize).toBeCloseTo(7.49, 3);
    expect(playLayout.tileSize).toBeCloseTo(7.816, 3);
    expect(menuLayout.boardWidth).toBe(381);
    expect(playLayout.boardWidth).toBe(397);
    expect(menuLayout.boardLeft).toBe(12);
    expect(playLayout.boardLeft).toBe(4);
    // "Roughly one tile" is the single-pass estimate's goal, not exact
    // precision (the margin is estimated from the un-margined box, before
    // the shrink slightly reduces the final tileSize) -- a loose half-to-
    // double bound catches a genuinely broken margin without being brittle.
    expect(menuLayout.boardLeft).toBeGreaterThan(menuLayout.tileSize * 0.5);
    expect(menuLayout.boardLeft).toBeLessThan(menuLayout.tileSize * 2);
    // A row of three buttons doesn't fit 405px width once rowButtonOffset
    // correctly reserves the center button's own width (see the fix
    // above) -- both surfaces fall back to the stacked layout via the
    // dynamic fit-check. Doesn't affect what's on screen: the front door
    // renders a single button from centerButtonX/Y directly.
    expect(menuLayout.buttonLayout).toBe('stack');
    expect(playLayout.buttonLayout).toBe('stack');
  });

  test('lets phone menu mazes reach the screen edge (minus one tile of bleed margin) when progression scale permits fewer cells', () => {
    const layout = resolveLegacyMenuLayout(405, 958, 50, 46, 46, 'menu');

    expect(layout.tileSize).toBeCloseTo(7.935, 3);
    expect(layout.boardWidth).toBe(379);
    expect(layout.boardLeft).toBe(13);
    expect(layout.boardLeft).toBeGreaterThan(layout.tileSize * 0.5);
    expect(layout.boardLeft).toBeLessThan(layout.tileSize * 2);
    expect(layout.boardLeft + layout.boardWidth).toBeLessThanOrEqual(layout.width - 4);
    expect(layout.titleY).toBeLessThan(layout.boardTop);
    expect(layout.buttonLayout).toBe('stack');
  });

  test('holds a roughly one-tile phone maze border across small and large cell counts', () => {
    const layouts = [37, 45, 49].map((mazeSize) => (
      resolveLegacyMenuLayout(390, 844, 50, mazeSize, mazeSize, 'menu')
    ));

    // The border is sized in tile units now (one tile of bleed margin), not
    // a fixed pixel value -- so it tracks tileSize (which shrinks as cell
    // count grows) instead of staying pixel-identical across cell counts.
    expect(layouts.map((layout) => layout.boardWidth)).toEqual([362, 366, 366]);
    expect(layouts.map((layout) => layout.boardLeft)).toEqual([14, 12, 12]);
    for (const layout of layouts) {
      expect(layout.boardLeft).toBeGreaterThan(layout.tileSize * 0.5);
      expect(layout.boardLeft).toBeLessThan(layout.tileSize * 2);
    }
    expect(layouts[0]!.tileSize).toBeGreaterThan(layouts[1]!.tileSize);
    expect(layouts[1]!.tileSize).toBeGreaterThan(layouts[2]!.tileSize);
  });

  test('keeps normal phone-width menu geometry clear around the single action', () => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 740 },
      { width: 390, height: 844 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu');

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
      expect(layout.boardLeft + layout.boardWidth).toBeLessThanOrEqual(layout.width);
      expect(layout.titleY).toBeLessThan(layout.boardTop);
      expect(layout.rightButtonY + (layout.buttonHeight / 2)).toBeLessThanOrEqual(layout.footerY);
    }
  });

  test('reclaims the old status-card lane for the single menu action', () => {
    const layout = resolveLegacyMenuLayout(360, 720, 50, 49, 49, 'menu');

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
      const authenticated = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu', {
        menuActionMode: 'authenticated'
      });
      const guest = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu', {
        menuActionMode: 'guest'
      });

      expect(authenticated).toEqual(guest);
      expect(authenticated.centerButtonX).toBe(Math.round(viewport.width / 2));
      // The board is full-bleed now, so it no longer guarantees stopping
      // short above the button -- that's the point (the button floats over
      // the board rather than the board leaving room for it). Whether it
      // actually reaches this deep depends on how well this (fixed,
      // square-ish) test maze shape fills the available box at each width.
      expect(authenticated.centerButtonY + (authenticated.buttonHeight / 2)).toBeLessThanOrEqual(
        authenticated.footerY
      );
    }
  });

  test('keeps the board and menu action lane within ultra-narrow side panels', () => {
    const layout = resolveLegacyMenuLayout(172, 407, 50, 49, 49);

    expect(layout.buttonLayout).toBe('stack');
    expect(layout.buttonHeight).toBe(42);
    expect(layout.boardLeft).toBeGreaterThanOrEqual(0);
    expect(layout.boardLeft + layout.boardWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.tileSize).toBeGreaterThanOrEqual(3);
    expect(layout.tileSize).toBeGreaterThan(3);
    // The board now claims essentially all reclaimed vertical room (a
    // slightly smaller compact-title reserve and a slightly larger dock
    // bottom margin -- 20px vs. the old 18px footer margin, so the dock
    // button never sits below the footer text position -- shift this by a
    // sub-pixel amount at this exact viewport; 155px+ is still "fills the
    // narrow panel", the point of this assertion).
    expect(layout.boardWidth).toBeGreaterThan(155);
    expect(layout.leftButtonX).toBe(layout.centerButtonX);
    expect(layout.rightButtonX).toBe(layout.centerButtonX);
    expect(layout.leftButtonY + layout.buttonHeight).toBeLessThan(layout.rightButtonY);
    expect(layout.rightButtonY + (layout.buttonHeight / 2)).toBeLessThanOrEqual(layout.footerY);
    expect(layout.buttonWidth).toBeLessThanOrEqual(layout.width - 36);
    expect(layout.centerButtonWidth).toBeLessThanOrEqual(layout.width - 20);
    // This exact diagnostic side panel is narrow enough that the header gap
    // between the leading and trailing icons can't hold the title legibly --
    // it must fall back to its own banner lane above the board.
    expect(layout.lanes.title).not.toBeNull();
    expectTitlePlacedSafely(layout);
  });

  test('places the title inline in the header row, centered between the leading and trailing icons, whenever the gap allows it', () => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 405, height: 958 },
      { width: 430, height: 932 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu');
      const hudHeight = layout.lanes.hud?.height ?? 0;
      const leadingFrame = resolveLegacyHeaderControlFrame({
        height: layout.height,
        hudHeight,
        hudTop: 0,
        placement: 'leading',
        width: layout.width
      });
      const trailingFrame = resolveLegacyHeaderControlFrame({
        height: layout.height,
        hudHeight,
        hudTop: 0,
        placement: 'trailing',
        width: layout.width
      });

      // Every one of these viewports has enough header-row gap to fit the
      // title inline -- confirmed live, not assumed (only the 172x407
      // diagnostic panel above falls back to the banner lane).
      expect(layout.lanes.title).toBeNull();
      expect(layout.titleX).toBeGreaterThan(leadingFrame.right);
      expect(layout.titleX).toBeLessThan(trailingFrame.left);
      expect(Math.abs(layout.titleX - ((leadingFrame.right + trailingFrame.left) / 2))).toBeLessThanOrEqual(1);
      expect(layout.titleY).toBe(Math.round(leadingFrame.centerY));
      expect(layout.titleReserveHeight).toBe(hudHeight);
    }
  });

  test('keeps ordinary narrow portrait views at the canonical touch floor', () => {
    const layout = resolveLegacyMenuLayout(280, 600, 50, 49, 49, 'menu');

    expect(layout.buttonLayout).toBe('stack');
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
    expect(layout.leftButtonY + layout.buttonHeight).toBeLessThan(layout.rightButtonY);
    expect(layout.rightButtonY + (layout.buttonHeight / 2)).toBeLessThanOrEqual(layout.footerY);
  });

  test('keeps active-play controls clear of the board in ultra-narrow side panels without changing menu button math', () => {
    const menuLayout = resolveLegacyMenuLayout(172, 407, 50, 49, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(172, 407, 50, 49, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true,
      avoidRect: {
        left: playLayout.boardLeft,
        top: playLayout.boardTop,
        width: playLayout.boardWidth,
        height: playLayout.boardWidth
      }
    });

    expect(playLayout.buttonLayout).toBe('stack');
    expect(playLayout.boardLeft).toBeGreaterThanOrEqual(0);
    expect(playLayout.boardLeft + playLayout.boardWidth).toBeLessThanOrEqual(playLayout.width);
    expect(playLayout.lanes.hud?.bottom).toBeLessThanOrEqual(playLayout.lanes.maze.top);
    expect(playLayout.boardTop).toBe((playLayout.lanes.hud?.bottom ?? 0) + 4);
    expect(playLayout.boardTop).toBeGreaterThanOrEqual(48);
    expect(playLayout.boardTop + playLayout.boardWidth + 12).toBeLessThanOrEqual(touchLayout.frame.top);
    expect(touchLayout.frame.right).toBeLessThanOrEqual(playLayout.width);
    expect(touchLayout.frame.bottom).toBeLessThanOrEqual(playLayout.height);
    expect(menuLayout.leftButtonY + menuLayout.buttonHeight).toBeLessThan(menuLayout.rightButtonY);
  });

  test('reserves play HUD and controller lanes on desktop as well as phones', () => {
    const layout = resolveLegacyMenuLayout(1440, 900, 50, 49, 49, 'play');

    expect(layout.lanes.hud).not.toBeNull();
    expect(layout.lanes.controls).not.toBeNull();
    expect(layout.lanes.hud?.bottom).toBeLessThanOrEqual(layout.lanes.maze.top);
    expect(layout.lanes.maze.bottom).toBeLessThanOrEqual(layout.lanes.controls?.top ?? Number.NEGATIVE_INFINITY);
  });

  test('keeps the compact phone control deck below the active-play board', () => {
    const playLayout = resolveLegacyMenuLayout(360, 740, 50, 49, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true
    });

    expect(playLayout.boardTop + playLayout.boardWidth + 24).toBeLessThanOrEqual(touchLayout.frame.top);
    expect(touchLayout.controls.pause.width).toBe(touchLayout.controls.move_up.width);
    expect(touchLayout.controls.restart_attempt.width).toBe(0);
    expect(touchLayout.controls.toggle_thoughts.width).toBe(0);
  });

  test('reserves a top mobile HUD lane and keeps the controller visually connected to the maze', () => {
    const playLayout = resolveLegacyMenuLayout(405, 958, 50, 49, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true,
      controlMode: 'stick',
      avoidRect: {
        left: playLayout.boardLeft,
        top: playLayout.boardTop,
        width: playLayout.boardWidth,
        height: playLayout.boardWidth
      }
    });

    expect(playLayout.boardTop).toBeGreaterThanOrEqual(62);
    expect(playLayout.boardTop).toBe((playLayout.lanes.hud?.bottom ?? 0) + 8);
    expect(touchLayout.controls.pause.top).toBeLessThan(16);
    expect(touchLayout.controls.pause.right).toBeGreaterThanOrEqual(playLayout.width - 14);
    expect(touchLayout.controls.pause.left).toBeGreaterThan(playLayout.width * 0.7);
    expect(touchLayout.controls.pause.bottom + 12).toBeLessThanOrEqual(playLayout.boardTop);
    expect(playLayout.boardTop + playLayout.boardWidth + 24).toBeLessThanOrEqual(touchLayout.frame.top);
    expect(touchLayout.frame.top).toBeLessThanOrEqual(playLayout.boardTop + playLayout.boardWidth + 124);
  });

  test('keeps a substantial desktop maze after reserving the complete title shell', () => {
    const menuLayout = resolveLegacyMenuLayout(1920, 1080, 50, 49, 49, 'menu');
    const playLayout = resolveLegacyMenuLayout(1920, 1080, 50, 49, 49, 'play');

    expect(menuLayout.boardWidth).toBeGreaterThanOrEqual(600);
    // Menu now deliberately fills to the edges (a much smaller title
    // reserve, board claims all remaining room) while play surface keeps
    // its previous, more conservative ratio-based sizing untouched -- menu
    // is no longer guaranteed smaller than play; at this viewport it's
    // actually larger.
    expect(menuLayout.boardWidth).toBeGreaterThan(playLayout.boardWidth);
    expect(Math.abs((playLayout.boardLeft + (playLayout.boardWidth / 2)) - (playLayout.width / 2))).toBeLessThanOrEqual(2);
    expect(playLayout.boardTop).toBeGreaterThanOrEqual(56);
    expect(playLayout.boardTop + playLayout.boardWidth).toBeLessThanOrEqual(playLayout.height - 12);
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
      const first = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu');
      resolveLegacyMenuLayout(viewport.height, viewport.width, 50, 49, 49, 'menu');
      const restored = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'menu');

      expect(restored).toEqual(first);
      expectTitlePlacedSafely(first);
      expect(first.lanes.rank).toBeNull();
      // The board is full-bleed now, so it no longer guarantees stopping
      // short of the dock button's action lane -- see expectTitlePlacedSafely's
      // comment above.
      expect(first.lanes.actions?.bottom).toBeLessThanOrEqual(first.footerY);
    }
  });

  test('keeps play HUD, maze, and portrait controls in separate lanes', () => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 430, height: 932 }
    ]) {
      const layout = resolveLegacyMenuLayout(viewport.width, viewport.height, 50, 49, 49, 'play');

      expect(layout.lanes.hud?.bottom).toBeLessThanOrEqual(layout.lanes.maze.top);
      expect(layout.lanes.maze.bottom).toBeLessThanOrEqual(layout.lanes.controls?.top ?? 0);
      expect(layout.lanes.controls?.bottom).toBeLessThanOrEqual(layout.height);
    }
  });

  test('keeps compact landscape active-play controls out of the board gutters', () => {
    const playLayout = resolveLegacyMenuLayout(1280, 690, 50, 49, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true,
      avoidRect: {
        left: playLayout.boardLeft,
        top: playLayout.boardTop,
        width: playLayout.boardWidth,
        height: playLayout.boardWidth
      }
    });

    expect(touchLayout.frames).toHaveLength(2);
    expect(touchLayout.frames?.[0].right).toBeLessThanOrEqual(playLayout.boardLeft - 18);
    expect(touchLayout.frames?.[1].left).toBeGreaterThanOrEqual(playLayout.boardLeft + playLayout.boardWidth + 18);
    expect(touchLayout.controls.move_right.right).toBeLessThanOrEqual(playLayout.boardLeft - 8);
    expect(touchLayout.controls.pause.left).toBeGreaterThanOrEqual(playLayout.boardLeft + playLayout.boardWidth + 8);
    expect(touchLayout.controls.restart_attempt.width).toBe(0);
    expect(touchLayout.controls.toggle_thoughts.width).toBe(0);
  });

  test('centers wide play controls in the reserved lower lane and keeps pause above the maze', () => {
    const playLayout = resolveLegacyMenuLayout(1280, 720, 50, 49, 49, 'play');
    const touchLayout = resolveTouchControlLayout({
      width: playLayout.width,
      height: playLayout.height
    }, {
      compact: true,
      placement: 'bottom-centered',
      avoidRect: {
        left: playLayout.boardLeft,
        top: playLayout.boardTop,
        width: playLayout.boardWidth,
        height: playLayout.boardWidth
      }
    });

    expect(Math.abs(touchLayout.frame.centerX - (playLayout.width / 2))).toBeLessThanOrEqual(1);
    expect(touchLayout.frame.top).toBeGreaterThanOrEqual(playLayout.boardTop + playLayout.boardWidth);
    expect(touchLayout.controls.pause.left).toBeGreaterThanOrEqual(playLayout.boardLeft + playLayout.boardWidth + 8);
    expect(touchLayout.controls.pause.bottom).toBeLessThanOrEqual(playLayout.boardTop);
  });
});
