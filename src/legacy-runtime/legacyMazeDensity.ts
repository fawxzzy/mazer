// Density metrics (MAZER-GEN-007, sparse mazes). Pure, integer-only. Planar view of the interior of the
// board (the border ring is the wrap ring, not blank space).
//
//   floorCells        : open cells.
//   emptyRectArea     : area of the largest axis-aligned block of wall cells that lies wholly inside the board
//                       interior (x 1..width-2, y 1..height-2): the "blank patch" the eye sees. emptyRectW/H are
//                       its sides (a corridor spacing of one wall cell is the normal look; a 5x5 block is not).
//   blankPatches      : number of disjoint blank patches of at least BLANK_PATCH_MIN_AREA wall cells, found
//                       greedily (largest rectangle first, then the next largest in what is left).
//   hallCount         : straight halls: maximal collinear stretches of corridor cells (exactly two open
//                       neighbours, both in line) of at least HALL_MIN_CELLS cells, i.e. a long empty street with
//                       no junction. longestHall is the longest one.
export const BLANK_PATCH_MIN_AREA = 20;
export const HALL_MIN_CELLS = 10;

export interface DensityMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
}

export interface DensityMetrics {
  readonly floorCells: number;
  readonly emptyRectArea: number;
  readonly emptyRectW: number;
  readonly emptyRectH: number;
  readonly blankPatches: number;
  readonly hallCount: number;
  readonly longestHall: number;
}

const largestWallRect = (wall: Uint8Array, width: number, height: number): { area: number; x: number; y: number; w: number; h: number } => {
  const heights = new Int32Array(width);
  let best = { area: 0, x: 0, y: 0, w: 0, h: 0 };
  for (let y = 1; y <= height - 2; y += 1) {
    for (let x = 1; x <= width - 2; x += 1) { heights[x] = wall[(y * width) + x] === 1 ? heights[x]! + 1 : 0; }
    const stack: number[] = [];
    for (let x = 1; x <= width - 1; x += 1) {
      const current = x <= width - 2 ? heights[x]! : 0;
      while (stack.length > 0 && heights[stack[stack.length - 1]!]! >= current) {
        const top = stack.pop()!;
        const h = heights[top]!;
        const left = stack.length > 0 ? stack[stack.length - 1]! + 1 : 1;
        const w = x - left;
        if (h * w > best.area) { best = { area: h * w, x: left, y: y - h + 1, w, h }; }
      }
      stack.push(x);
    }
  }
  return best;
};

export const analyzeMazeDensity = (maze: DensityMaze): DensityMetrics => {
  const { width, height, grid } = maze;
  const wall = new Uint8Array(width * height);
  let floorCells = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y]?.[x] === true) { floorCells += 1; } else { wall[(y * width) + x] = 1; }
    }
  }
  const first = largestWallRect(wall, width, height);
  let blankPatches = 0;
  for (let round = 0; round < 40; round += 1) {
    const rect = round === 0 ? first : largestWallRect(wall, width, height);
    if (rect.area < BLANK_PATCH_MIN_AREA) { break; }
    blankPatches += 1;
    for (let y = rect.y; y < rect.y + rect.h; y += 1) { for (let x = rect.x; x < rect.x + rect.w; x += 1) { wall[(y * width) + x] = 0; } }
  }
  // Straight halls (planar, interior corridor cells with exactly two open neighbours in line).
  const open = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && grid[y]![x] === true;
  const inLine = (x: number, y: number, horizontal: boolean): boolean => {
    if (!open(x, y)) { return false; }
    const a = horizontal ? open(x - 1, y) : open(x, y - 1);
    const b = horizontal ? open(x + 1, y) : open(x, y + 1);
    const c = horizontal ? open(x, y - 1) : open(x - 1, y);
    const d = horizontal ? open(x, y + 1) : open(x + 1, y);
    return a && b && !c && !d;
  };
  let hallCount = 0;
  let longestHall = 0;
  for (const horizontal of [true, false]) {
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;
    for (let o = 0; o < outer; o += 1) {
      let length = 0;
      for (let i = 0; i <= inner; i += 1) {
        const x = horizontal ? i : o;
        const y = horizontal ? o : i;
        if (i < inner && inLine(x, y, horizontal)) { length += 1; continue; }
        if (length >= HALL_MIN_CELLS) { hallCount += 1; }
        longestHall = Math.max(longestHall, length);
        length = 0;
      }
    }
  }
  return { floorCells, emptyRectArea: first.area, emptyRectW: first.w, emptyRectH: first.h, blankPatches, hallCount, longestHall };
};
