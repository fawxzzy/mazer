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
const LEGACY_MENU_PATH_TITLE_LETTER_GAP_COLUMNS = 1;
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
  boardSize: number,
  tileSize: number,
  isPortrait: boolean,
  viewportWidth = boardSize,
  surface: LegacyMenuTitleSurface = 'snapshot'
): LegacyMenuTitlePresentation => {
  const isProceduralPortrait = isPortrait && surface === 'procedural';
  const baseFontSize = Math.max(
    isPortrait ? 78 : 142,
    Math.round(boardSize * (isProceduralPortrait ? 0.265 : (isPortrait ? 0.205 : 0.226)))
  );
  const isUltraNarrow = isPortrait && viewportWidth < 360;
  const isProceduralUltraNarrow = isUltraNarrow && surface === 'procedural';
  const fontSize = isUltraNarrow
    ? Math.round(Math.min(
      baseFontSize,
      Math.max(isProceduralUltraNarrow ? 46 : 42, viewportWidth * (isProceduralUltraNarrow ? 0.24 : 0.3))
    ))
    : isProceduralPortrait
      ? Math.round(Math.min(baseFontSize, Math.max(72, viewportWidth * 0.255)))
    : baseFontSize;
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
