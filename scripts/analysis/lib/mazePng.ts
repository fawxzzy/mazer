// Minimal dependency-free PNG writer + maze rasterizer for the analysis scripts
// (contact sheets, before/after comparisons). Node only (node:zlib).
import { deflateSync } from 'node:zlib';

export type Rgb = readonly [number, number, number];

const crcTable = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) { c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) { c = crcTable[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8); }
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Buffer => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

export interface RasterImage {
  readonly width: number;
  readonly height: number;
  // RGB, row-major, 3 bytes per pixel.
  readonly pixels: Uint8Array;
}

export const createImage = (width: number, height: number, fill: Rgb): RasterImage => {
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 3] = fill[0]; pixels[(i * 3) + 1] = fill[1]; pixels[(i * 3) + 2] = fill[2];
  }
  return { width, height, pixels };
};

export const fillRect = (image: RasterImage, x: number, y: number, w: number, h: number, color: Rgb): void => {
  for (let yy = Math.max(0, y); yy < Math.min(image.height, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(image.width, x + w); xx += 1) {
      const o = ((yy * image.width) + xx) * 3;
      image.pixels[o] = color[0]; image.pixels[o + 1] = color[1]; image.pixels[o + 2] = color[2];
    }
  }
};

export const encodePng = (image: RasterImage): Buffer => {
  const raw = Buffer.alloc((image.width * 3 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowStart = y * (image.width * 3 + 1);
    raw[rowStart] = 0;
    Buffer.from(image.pixels.buffer, image.pixels.byteOffset + (y * image.width * 3), image.width * 3).copy(raw, rowStart + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0))
  ]);
};

export interface RasterMaze {
  readonly width: number;
  readonly height: number;
  readonly grid: ReadonlyArray<ReadonlyArray<boolean>>;
  readonly start: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
}

export interface MazeRasterOptions {
  readonly tile?: number;
  // Cells drawn in the route color (index = y * width + x).
  readonly route?: ReadonlySet<number>;
  // Cells drawn in the loop color (cells on a cycle that are not on the route).
  readonly loops?: ReadonlySet<number>;
  // Cells the explorer visited but that are not on the route (dead-end ground).
  readonly visited?: ReadonlySet<number>;
}

export const PALETTE = {
  wall: [24, 28, 40] as Rgb,
  floor: [226, 231, 242] as Rgb,
  route: [59, 130, 246] as Rgb,
  loop: [244, 140, 40] as Rgb,
  visited: [180, 192, 214] as Rgb,
  start: [34, 178, 106] as Rgb,
  goal: [245, 185, 66] as Rgb,
  gutter: [248, 249, 252] as Rgb
};

export const rasterizeMaze = (maze: RasterMaze, options: MazeRasterOptions = {}): RasterImage => {
  const tile = options.tile ?? 6;
  const image = createImage(maze.width * tile, maze.height * tile, PALETTE.wall);
  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      if (maze.grid[y]?.[x] !== true) { continue; }
      const cell = (y * maze.width) + x;
      let color: Rgb = PALETTE.floor;
      if (options.visited?.has(cell)) { color = PALETTE.visited; }
      if (options.loops?.has(cell)) { color = PALETTE.loop; }
      if (options.route?.has(cell)) { color = PALETTE.route; }
      fillRect(image, x * tile, y * tile, tile, tile, color);
    }
  }
  fillRect(image, maze.start.x * tile, maze.start.y * tile, tile, tile, PALETTE.start);
  fillRect(image, maze.goal.x * tile, maze.goal.y * tile, tile, tile, PALETTE.goal);
  return image;
};

// Lay several images out in a grid with a gutter.
export const composeSheet = (
  images: readonly RasterImage[],
  columns: number,
  gutter = 8
): RasterImage => {
  const rows = Math.ceil(images.length / columns);
  const cellW = Math.max(...images.map((image) => image.width));
  const cellH = Math.max(...images.map((image) => image.height));
  const sheet = createImage((columns * cellW) + ((columns + 1) * gutter), (rows * cellH) + ((rows + 1) * gutter), PALETTE.gutter);
  images.forEach((image, index) => {
    const ox = gutter + ((index % columns) * (cellW + gutter));
    const oy = gutter + (Math.floor(index / columns) * (cellH + gutter));
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const from = ((y * image.width) + x) * 3;
        const to = (((oy + y) * sheet.width) + ox + x) * 3;
        sheet.pixels[to] = image.pixels[from]!; sheet.pixels[to + 1] = image.pixels[from + 1]!; sheet.pixels[to + 2] = image.pixels[from + 2]!;
      }
    }
  });
  return sheet;
};
