export interface LegacyMenuTitlePresentation {
  fontSize: number;
  shadowAlpha: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  titleAlpha: number;
}

export type LegacyMenuTitleSurface = 'snapshot' | 'procedural';

export interface LegacyMenuPathTitleCell {
  column: number;
  order: number;
  row: number;
}

export interface LegacyMenuPathTitleLayout {
  cellSize: number;
  cells: LegacyMenuPathTitleCell[];
  columns: number;
  coreInset: number;
  grid: boolean[][];
  height: number;
  left: number;
  rows: number;
  top: number;
  width: number;
}

export interface LegacyMenuPathTitleOrbitGeometry {
  bottom: number;
  centerX: number;
  centerY: number;
  crownBottom: number;
  crownHalf: number;
  crownTop: number;
  left: number;
  right: number;
  top: number;
}

const LEGACY_MENU_PATH_TITLE_PATTERNS = [
  [
    '10001',
    '11011',
    '10101',
    '10101',
    '10001',
    '10001',
    '10001'
  ],
  [
    '01110',
    '10001',
    '10001',
    '11111',
    '10001',
    '10001',
    '10001'
  ],
  [
    '11111',
    '00001',
    '00010',
    '00100',
    '01000',
    '10000',
    '11111'
  ],
  [
    '11111',
    '10000',
    '10000',
    '11110',
    '10000',
    '10000',
    '11111'
  ],
  [
    '11110',
    '10001',
    '10001',
    '11110',
    '10100',
    '10010',
    '10001'
  ]
] as const;

const LEGACY_MENU_PATH_TITLE_LETTER_COLUMNS = 5;
const LEGACY_MENU_PATH_TITLE_LETTER_GAP_COLUMNS = 4;
const LEGACY_MENU_PATH_TITLE_ROWS = 7;

const buildLegacyMenuPathTitleCells = (): LegacyMenuPathTitleCell[] => {
  const cells: LegacyMenuPathTitleCell[] = [];
  let order = 0;

  LEGACY_MENU_PATH_TITLE_PATTERNS.forEach((pattern, letterIndex) => {
    const columnOffset = letterIndex * (LEGACY_MENU_PATH_TITLE_LETTER_COLUMNS + LEGACY_MENU_PATH_TITLE_LETTER_GAP_COLUMNS);
    pattern.forEach((rowPattern, row) => {
      [...rowPattern].forEach((value, column) => {
        if (value !== '1') {
          return;
        }
        cells.push({
          column: columnOffset + column,
          row,
          order
        });
        order += 1;
      });
    });
  });

  return cells;
};

export const LEGACY_MENU_PATH_TITLE_CELLS = buildLegacyMenuPathTitleCells();
export const LEGACY_MENU_PATH_TITLE_COLUMNS = (LEGACY_MENU_PATH_TITLE_PATTERNS.length * LEGACY_MENU_PATH_TITLE_LETTER_COLUMNS)
  + ((LEGACY_MENU_PATH_TITLE_PATTERNS.length - 1) * LEGACY_MENU_PATH_TITLE_LETTER_GAP_COLUMNS);

const buildLegacyMenuPathTitleGrid = (): boolean[][] => {
  const grid = Array.from({ length: LEGACY_MENU_PATH_TITLE_ROWS }, () => (
    Array.from({ length: LEGACY_MENU_PATH_TITLE_COLUMNS }, () => false)
  ));

  for (const cell of LEGACY_MENU_PATH_TITLE_CELLS) {
    if (grid[cell.row]) {
      grid[cell.row][cell.column] = true;
    }
  }

  return grid;
};

export const LEGACY_MENU_PATH_TITLE_GRID = buildLegacyMenuPathTitleGrid();

export const resolveLegacyMenuTitlePresentation = (
  titleReserveHeight: number,
  tileSize: number,
  isPortrait: boolean,
  viewportWidth = titleReserveHeight,
  surface: LegacyMenuTitleSurface = 'snapshot'
): LegacyMenuTitlePresentation => {
  const isProceduralPortrait = isPortrait && surface === 'procedural';
  const isUltraNarrow = isPortrait && viewportWidth < 360;
  const isProceduralUltraNarrow = isUltraNarrow && surface === 'procedural';
  // Font size is derived from the title's own reserved lane height, not
  // board size -- board size and the title reserve are computed
  // independently now (legacyMenuLayout.ts deliberately keeps the title
  // compact regardless of how large the board grows), so deriving from
  // board size would make the title grow right along with the board again.
  // 0.68 leaves the rendered glyph grid plus its orbit/crown decorations
  // (which extend roughly another ~1.4 cell-widths above and below the core
  // 7-row grid -- see resolveLegacyMenuPathTitleOrbitGeometry) comfortably
  // inside the reserved lane with real margin, not sized right to the edge.
  // Bumped up from 0.55 per feedback that the title read as too small next
  // to the (now also smaller) header badges -- keep this in sync with the
  // identical formula in legacyMenuLayout.ts's inline-header fit check.
  const fontSize = Math.max(22, Math.round(titleReserveHeight * 0.68));
  const shadowOffsetX = isUltraNarrow
    ? Math.max(2, Math.round(fontSize * 0.07))
    : Math.max(isPortrait ? 4 : 5, Math.round(tileSize * 0.12));
  const shadowOffsetY = isUltraNarrow
    ? Math.max(3, Math.round(fontSize * 0.09))
    : Math.max(isPortrait ? 6 : 7, Math.round(tileSize * 0.2));

  return {
    fontSize,
    shadowOffsetX,
    shadowOffsetY,
    shadowAlpha: isPortrait ? 0.38 : 0.34,
    titleAlpha: isProceduralUltraNarrow ? 0.64 : (isProceduralPortrait ? 0.82 : (isPortrait ? 0.76 : 0.7))
  };
};

/**
 * Total on-screen width the title wordmark needs at a given font size,
 * including the orbit/crown decorations that extend past the core letter
 * grid -- used by legacyMenuLayout.ts to decide whether the title fits
 * inline between the header's leading/trailing icon frames.
 */
export const resolveLegacyMenuTitleFootprintWidth = (fontSize: number): number => {
  const cellSize = Math.max(4, Math.round(fontSize / 9));
  const coreWidth = LEGACY_MENU_PATH_TITLE_COLUMNS * cellSize;
  const orbitGap = Math.max(7, Math.round(cellSize * 1.08));
  return coreWidth + (orbitGap * 2);
};

export const resolveLegacyMenuPathTitleLayout = (
  centerX: number,
  centerY: number,
  fontSize: number
): LegacyMenuPathTitleLayout => {
  const cellSize = Math.max(4, Math.round(fontSize / 9));
  const width = LEGACY_MENU_PATH_TITLE_COLUMNS * cellSize;
  const height = LEGACY_MENU_PATH_TITLE_ROWS * cellSize;

  return {
    cellSize,
    cells: LEGACY_MENU_PATH_TITLE_CELLS,
    columns: LEGACY_MENU_PATH_TITLE_COLUMNS,
    coreInset: Math.max(1, Math.floor(cellSize * 0.18)),
    grid: LEGACY_MENU_PATH_TITLE_GRID,
    height,
    left: Math.round(centerX - (width / 2)),
    rows: LEGACY_MENU_PATH_TITLE_ROWS,
    top: Math.round(centerY - (height / 2)),
    width
  };
};

export const resolveLegacyMenuPathTitleOrbitGeometry = (
  titleLeft: number,
  titleTop: number,
  titleWidth: number,
  titleHeight: number,
  titleCellSize: number
): LegacyMenuPathTitleOrbitGeometry => {
  const railGap = Math.max(5, Math.round(titleCellSize * 0.8));
  const orbitGap = Math.max(7, Math.round(titleCellSize * 1.08));
  const railTop = titleTop - railGap;
  const railBottom = titleTop + titleHeight + railGap;
  const centerX = titleLeft + (titleWidth / 2);
  const centerY = titleTop + (titleHeight / 2);
  const crest = Math.max(5, Math.round(titleCellSize * 0.68));
  const crownHalf = Math.max(4, Math.round(titleCellSize * 0.56));
  const crownTop = railTop - Math.round(crest * 0.9);
  const crownBottom = railBottom + Math.round(crest * 0.9);

  return {
    bottom: crownBottom,
    centerX,
    centerY,
    crownBottom,
    crownHalf,
    crownTop,
    left: titleLeft - orbitGap,
    right: titleLeft + titleWidth + orbitGap,
    top: crownTop
  };
};

export const resolveLegacyMenuPathTitleOrbitPoint = (
  geometry: LegacyMenuPathTitleOrbitGeometry,
  orbit: number
): { x: number; y: number } => {
  const perimeter = (((orbit % 1) + 1) % 1) * 4;

  if (perimeter < 1) {
    return {
      x: geometry.left + ((geometry.right - geometry.left) * perimeter),
      y: geometry.top
    };
  }

  if (perimeter < 2) {
    return {
      x: geometry.right,
      y: geometry.top + ((geometry.bottom - geometry.top) * (perimeter - 1))
    };
  }

  if (perimeter < 3) {
    return {
      x: geometry.right - ((geometry.right - geometry.left) * (perimeter - 2)),
      y: geometry.bottom
    };
  }

  return {
    x: geometry.left,
    y: geometry.bottom - ((geometry.bottom - geometry.top) * (perimeter - 3))
  };
};

// A general-purpose version of the title's letter-cell system, for the
// Start/Login front-door labels -- so they read as made of the same
// material as the title instead of a separate rendered-font look. Static
// (no build/deconstruct animation, no orbit) -- just the finished glyph
// grid for whichever short word is passed in. Reuses the exact same 5x7
// bitmap convention as LEGACY_MENU_PATH_TITLE_PATTERNS above (the M/A/Z/E/R
// glyphs are duplicated here rather than shared, since the title array's
// cell order also encodes its own build-animation sequence and isn't safe
// to repurpose as a generic lookup table).
const LEGACY_GLYPH_LETTER_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01110', '10001', '10000', '10011', '10001', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111']
};

const LEGACY_GLYPH_LETTER_COLUMNS = 5;
const LEGACY_GLYPH_LETTER_ROWS = 7;
const LEGACY_GLYPH_WORD_GAP_COLUMNS = 1;

export interface LegacyGlyphWordCell {
  column: number;
  row: number;
}

export interface LegacyGlyphWordLayout {
  cellSize: number;
  cells: LegacyGlyphWordCell[];
  columns: number;
  grid: boolean[][];
  height: number;
  left: number;
  rows: number;
  top: number;
  width: number;
}

/** Every character in `word` must have an entry in LEGACY_GLYPH_LETTER_PATTERNS (letters only, no spaces/punctuation). */
export const isLegacyGlyphWordRenderable = (word: string): boolean => (
  [...word.toUpperCase()].every((letter) => LEGACY_GLYPH_LETTER_PATTERNS[letter] !== undefined)
);

export const resolveLegacyGlyphWordColumns = (
  word: string,
  gapColumns: number = LEGACY_GLYPH_WORD_GAP_COLUMNS
): number => {
  const letterCount = word.length;
  if (letterCount <= 0) {
    return 0;
  }
  return (letterCount * LEGACY_GLYPH_LETTER_COLUMNS) + ((letterCount - 1) * gapColumns);
};

const buildLegacyGlyphWordCells = (
  word: string,
  gapColumns: number
): LegacyGlyphWordCell[] => {
  const cells: LegacyGlyphWordCell[] = [];

  [...word.toUpperCase()].forEach((letter, letterIndex) => {
    const pattern = LEGACY_GLYPH_LETTER_PATTERNS[letter];
    if (!pattern) {
      return;
    }
    const columnOffset = letterIndex * (LEGACY_GLYPH_LETTER_COLUMNS + gapColumns);
    pattern.forEach((rowPattern, row) => {
      [...rowPattern].forEach((value, column) => {
        if (value === '1') {
          cells.push({ column: columnOffset + column, row });
        }
      });
    });
  });

  return cells;
};

export const resolveLegacyGlyphWordLayout = (
  word: string,
  centerX: number,
  centerY: number,
  cellSize: number,
  gapColumns: number = LEGACY_GLYPH_WORD_GAP_COLUMNS
): LegacyGlyphWordLayout => {
  const columns = resolveLegacyGlyphWordColumns(word, gapColumns);
  const width = columns * cellSize;
  const height = LEGACY_GLYPH_LETTER_ROWS * cellSize;
  const cells = buildLegacyGlyphWordCells(word, gapColumns);
  const grid = Array.from({ length: LEGACY_GLYPH_LETTER_ROWS }, () => (
    Array.from({ length: Math.max(1, columns) }, () => false)
  ));
  for (const cell of cells) {
    if (grid[cell.row]) {
      grid[cell.row][cell.column] = true;
    }
  }

  return {
    cellSize,
    cells,
    columns,
    grid,
    height,
    left: Math.round(centerX - (width / 2)),
    rows: LEGACY_GLYPH_LETTER_ROWS,
    top: Math.round(centerY - (height / 2)),
    width
  };
};
