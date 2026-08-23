import { describe, expect, test } from 'vitest';
import {
  formatLegacyCameraZoomPercent,
  normalizeLegacyCameraZoom,
  quantizeLegacyCameraZoom,
  resolveLegacyCameraZoomFromPosition,
  resolveLegacyCameraZoomPosition
} from '../../src/legacy-runtime/legacyCameraZoom';

describe('legacy camera zoom', () => {
  test('normalizes the full player-facing 50 through 150 percent range', () => {
    expect(normalizeLegacyCameraZoom(-500)).toBe(-50);
    expect(normalizeLegacyCameraZoom('12')).toBe(12);
    expect(normalizeLegacyCameraZoom(500)).toBe(50);
    expect(normalizeLegacyCameraZoom(Number.NaN, -20)).toBe(-20);
  });

  test('quantizes zoom to stable five-percent steps', () => {
    expect(quantizeLegacyCameraZoom(-48)).toBe(-50);
    expect(quantizeLegacyCameraZoom(-2)).toBe(0);
    expect(quantizeLegacyCameraZoom(13)).toBe(15);
    expect(quantizeLegacyCameraZoom(49)).toBe(50);
  });

  test('round trips minimum, default, and maximum slider positions', () => {
    expect(resolveLegacyCameraZoomPosition(-50)).toBe(0);
    expect(resolveLegacyCameraZoomPosition(0)).toBe(0.5);
    expect(resolveLegacyCameraZoomPosition(50)).toBe(1);

    expect(resolveLegacyCameraZoomFromPosition(0)).toBe(-50);
    expect(resolveLegacyCameraZoomFromPosition(0.5)).toBe(0);
    expect(resolveLegacyCameraZoomFromPosition(1)).toBe(50);
  });

  test('formats the board zoom players actually see', () => {
    expect(formatLegacyCameraZoomPercent(-50)).toBe('50%');
    expect(formatLegacyCameraZoomPercent(0)).toBe('100%');
    expect(formatLegacyCameraZoomPercent(50)).toBe('150%');
  });
});
