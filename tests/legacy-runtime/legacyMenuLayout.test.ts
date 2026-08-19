import { describe, expect, test } from 'vitest';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';

describe('resolveLegacyMenuLayout row button geometry', () => {
  test('never overlaps the left/center or center/right row buttons across a size sweep', () => {
    const violations: string[] = [];

    for (let width = 260; width <= 1400; width += 20) {
      for (let height = 400; height <= 1200; height += 20) {
        for (const surface of ['menu', 'play'] as const) {
          const layout = resolveLegacyMenuLayout(width, height, 50, 21, surface);
          if (layout.buttonLayout !== 'row' || surface !== 'menu') {
            continue;
          }

          const leftRight = layout.leftButtonX + layout.buttonWidth / 2;
          const centerLeft = layout.centerButtonX - layout.centerButtonWidth / 2;
          const centerRight = layout.centerButtonX + layout.centerButtonWidth / 2;
          const rightLeft = layout.rightButtonX - layout.buttonWidth / 2;

          if (leftRight > centerLeft) {
            violations.push(`${width}x${height}: left/center overlap by ${leftRight - centerLeft}px`);
          }
          if (centerRight > rightLeft) {
            violations.push(`${width}x${height}: center/right overlap by ${centerRight - rightLeft}px`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('reserves the center button its own half-width in the row offset, not just the flanking button\'s', () => {
    const layout = resolveLegacyMenuLayout(900, 700, 50, 21, 'menu');
    const gapLeftToCenter = (layout.centerButtonX - layout.centerButtonWidth / 2)
      - (layout.leftButtonX + layout.buttonWidth / 2);
    const gapCenterToRight = (layout.rightButtonX - layout.buttonWidth / 2)
      - (layout.centerButtonX + layout.centerButtonWidth / 2);

    expect(gapLeftToCenter).toBeGreaterThanOrEqual(0);
    expect(gapCenterToRight).toBeGreaterThanOrEqual(0);
  });
});
