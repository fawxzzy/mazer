import { describe, expect, test } from 'vitest';
import {
  resolveLegacyMenuBorderDockRenderAreas,
  resolveLegacyMenuBorderDockRenderFrames,
  type LegacyMenuBorderDockDirection
} from '../../src/legacy-runtime/legacyMenuRender';

describe('legacy bleed-off dock rendering', () => {
  test.each<LegacyMenuBorderDockDirection>(['left', 'right', 'top', 'bottom'])(
    'keeps a %s continuation inside the single connected tile band',
    (direction) => {
      const tileSize = 12;
      const tileRect = { left: 4, top: 3, width: tileSize, height: tileSize };
      const frame = resolveLegacyMenuBorderDockRenderFrames(direction, tileSize).edge;
      const areas = resolveLegacyMenuBorderDockRenderAreas(direction, frame, {
        boardHeight: 120,
        boardLeft: 0,
        boardTop: 0,
        boardWidth: 120,
        continuationLength: 24,
        materialTileSize: tileSize,
        mazeHeight: 96,
        mazeLeft: 4,
        mazeTop: 3,
        mazeWidth: 96,
        tileRect
      });

      expect(areas).toHaveLength(1);
      const [area] = areas;
      expect(area).toBeDefined();
      if (direction === 'left' || direction === 'right') {
        expect(area!.top).toBeGreaterThanOrEqual(tileRect.top);
        expect(area!.bottom).toBeLessThanOrEqual(tileRect.top + tileRect.height);
      } else {
        expect(area!.left).toBeGreaterThanOrEqual(tileRect.left);
        expect(area!.right).toBeLessThanOrEqual(tileRect.left + tileRect.width);
      }
    }
  );
});
