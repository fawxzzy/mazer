/**
 * Minimal dependency-free PNG codec (node:zlib only) used by the maze
 * lifecycle capture/analysis tools. Decodes 8-bit, non-interlaced PNGs of
 * colour type 0/2/3/4/6 (what Chromium screenshots and our synthetic test
 * images use) into RGBA, and encodes RGBA back to a PNG. Pure functions over
 * Buffers/Uint8Arrays; no file system access.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const makeChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

/**
 * @param {Buffer|Uint8Array} input PNG file bytes
 * @returns {{ width: number, height: number, data: Uint8Array }} RGBA pixels
 */
export const decodePng = (input) => {
  const bytes = Buffer.from(input);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('decodePng: not a PNG (bad signature).');
  }
  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12]
      };
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'tRNS') {
      transparency = data;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!header) throw new Error('decodePng: missing IHDR.');
  if (header.bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${header.bitDepth}.`);
  if (header.interlace !== 0) throw new Error('decodePng: interlaced PNGs are not supported.');
  const channels = CHANNELS_BY_COLOR_TYPE[header.colorType];
  if (!channels) throw new Error(`decodePng: unsupported colour type ${header.colorType}.`);

  const { width, height } = header;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('decodePng: truncated image data.');

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowIn = y * (stride + 1) + 1;
    const rowOut = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[rowOut + x - channels] : 0;
      const up = y > 0 ? pixels[rowOut - stride + x] : 0;
      const upLeft = (y > 0 && x >= channels) ? pixels[rowOut - stride + x - channels] : 0;
      let value = raw[rowIn + x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`decodePng: bad filter ${filter}.`);
      pixels[rowOut + x] = value & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    const p = i * channels;
    if (header.colorType === 6) {
      rgba[o] = pixels[p]; rgba[o + 1] = pixels[p + 1]; rgba[o + 2] = pixels[p + 2]; rgba[o + 3] = pixels[p + 3];
    } else if (header.colorType === 2) {
      rgba[o] = pixels[p]; rgba[o + 1] = pixels[p + 1]; rgba[o + 2] = pixels[p + 2]; rgba[o + 3] = 255;
    } else if (header.colorType === 0) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = pixels[p]; rgba[o + 3] = 255;
    } else if (header.colorType === 4) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = pixels[p]; rgba[o + 3] = pixels[p + 1];
    } else {
      const index = pixels[p];
      if (!palette) throw new Error('decodePng: indexed PNG without PLTE.');
      rgba[o] = palette[index * 3]; rgba[o + 1] = palette[index * 3 + 1]; rgba[o + 2] = palette[index * 3 + 2];
      rgba[o + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    }
  }
  return { width, height, data: rgba };
};

/**
 * @param {{ width: number, height: number, data: Uint8Array|Uint8ClampedArray }} image RGBA pixels
 * @returns {Buffer} PNG file bytes (RGBA, filter 0)
 */
export const encodePng = ({ width, height, data }) => {
  if (data.length !== width * height * 4) throw new Error('encodePng: data length does not match width*height*4.');
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', header),
    makeChunk('IDAT', deflateSync(raw, { level: 6 })),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
};

/** Box-average downscale of an RGBA image to (outWidth x outHeight). */
export const resizeBox = (image, outWidth, outHeight) => {
  const out = new Uint8Array(outWidth * outHeight * 4);
  const sx = image.width / outWidth;
  const sy = image.height / outHeight;
  for (let y = 0; y < outHeight; y += 1) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(image.height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < outWidth; x += 1) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(image.width, Math.floor((x + 1) * sx)));
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const p = (yy * image.width + xx) * 4;
          r += image.data[p]; g += image.data[p + 1]; b += image.data[p + 2]; n += 1;
        }
      }
      const o = (y * outWidth + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { width: outWidth, height: outHeight, data: out };
};

/**
 * Lay out equally-sized RGBA thumbnails in a grid on a dark background with a
 * 2px gutter. Returns the composed RGBA image.
 */
export const composeContactSheet = (thumbs, { columns = 8, gutter = 2 } = {}) => {
  if (thumbs.length === 0) return { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]) };
  const cellW = Math.max(...thumbs.map((t) => t.width));
  const cellH = Math.max(...thumbs.map((t) => t.height));
  const cols = Math.min(columns, thumbs.length);
  const rows = Math.ceil(thumbs.length / cols);
  const width = cols * (cellW + gutter) + gutter;
  const height = rows * (cellH + gutter) + gutter;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 24; data[i * 4 + 1] = 24; data[i * 4 + 2] = 28; data[i * 4 + 3] = 255;
  }
  thumbs.forEach((thumb, index) => {
    const ox = gutter + (index % cols) * (cellW + gutter);
    const oy = gutter + Math.floor(index / cols) * (cellH + gutter);
    for (let y = 0; y < thumb.height; y += 1) {
      for (let x = 0; x < thumb.width; x += 1) {
        const s = (y * thumb.width + x) * 4;
        const d = ((oy + y) * width + ox + x) * 4;
        data[d] = thumb.data[s]; data[d + 1] = thumb.data[s + 1]; data[d + 2] = thumb.data[s + 2]; data[d + 3] = 255;
      }
    }
  });
  return { width, height, data };
};
