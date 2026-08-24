export type MazerIconName = 'back' | 'eye' | 'eye-off' | 'home' | 'leaderboard' | 'settings';

export type MazerIconShape =
  | Readonly<{ element: 'circle'; cx: number; cy: number; r: number }>
  | Readonly<{ element: 'line'; x1: number; y1: number; x2: number; y2: number }>
  | Readonly<{ element: 'path'; d: string }>
  | Readonly<{ element: 'polyline'; points: string }>;

export interface MazerIconDefinition {
  readonly viewBox: '0 0 20 20';
  readonly shapes: readonly MazerIconShape[];
}

const icon = (shapes: readonly MazerIconShape[]): MazerIconDefinition => Object.freeze({
  viewBox: '0 0 20 20',
  shapes: Object.freeze([...shapes])
});

/**
 * Renderer-independent, line-only icons. No definition contains a fill or an
 * embedded raster, so CSS `currentColor` remains the single color owner.
 */
export const mazerIcons: Readonly<Record<MazerIconName, MazerIconDefinition>> = Object.freeze({
  back: icon([
    { element: 'polyline', points: '11.5 4 5.5 10 11.5 16' }
  ]),
  eye: icon([
    { element: 'path', d: 'M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z' },
    { element: 'circle', cx: 10, cy: 10, r: 2.25 }
  ]),
  'eye-off': icon([
    { element: 'path', d: 'M3.2 6.2C2.4 7.1 1.8 8.4 1.8 10c0 0 3 5 8.2 5 1.3 0 2.5-.3 3.5-.8' },
    { element: 'path', d: 'M6.3 5.5A8.8 8.8 0 0 1 10 5c5.2 0 8.2 5 8.2 5a10.8 10.8 0 0 1-1.9 2.6' },
    { element: 'line', x1: 3, y1: 3, x2: 17, y2: 17 }
  ]),
  home: icon([
    { element: 'path', d: 'M3 9.2 10 3l7 6.2V17h-5v-4H8v4H3Z' }
  ]),
  leaderboard: icon([
    { element: 'line', x1: 4, y1: 17, x2: 4, y2: 11 },
    { element: 'line', x1: 10, y1: 17, x2: 10, y2: 6 },
    { element: 'line', x1: 16, y1: 17, x2: 16, y2: 9 }
  ]),
  settings: icon([
    { element: 'circle', cx: 10, cy: 10, r: 3 },
    { element: 'path', d: 'M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4' }
  ])
});

export const getMazerIconDefinition = (name: MazerIconName): MazerIconDefinition => mazerIcons[name];
