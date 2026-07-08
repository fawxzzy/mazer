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
  height: number;
  left: number;
  rows: number;
  top: number;
  width: number;
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

export const resolveLegacyMenuTitlePresentation = (
  boardSize: number,
  tileSize: number,
  isPortrait: boolean,
  viewportWidth = boardSize,
  surface: LegacyMenuTitleSurface = 'snapshot'
): LegacyMenuTitlePresentation => {
  const baseFontSize = Math.max(
    isPortrait ? 78 : 142,
    Math.round(boardSize * (isPortrait ? 0.205 : 0.226))
  );
  const isUltraNarrow = isPortrait && viewportWidth < 360;
  const isProceduralPortrait = isPortrait && surface === 'procedural';
  const isProceduralUltraNarrow = isUltraNarrow && surface === 'procedural';
  const fontSize = isUltraNarrow
    ? Math.round(Math.min(
      baseFontSize,
      Math.max(isProceduralUltraNarrow ? 34 : 42, viewportWidth * (isProceduralUltraNarrow ? 0.2 : 0.3))
    ))
    : isProceduralPortrait
      ? Math.round(Math.min(baseFontSize, Math.max(54, viewportWidth * 0.16)))
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
    height,
    left: Math.round(centerX - (width / 2)),
    rows: LEGACY_MENU_PATH_TITLE_ROWS,
    top: Math.round(centerY - (height / 2)),
    width
  };
};
