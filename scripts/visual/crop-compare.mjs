/** Side-by-side zoomed crops: node crop-compare.mjs out.png zoom x y w h in1.png in2.png ... (css px at the given dpr=1 scale of the png) */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './lib/png-codec.mjs';
const [out, zoomS, xS, yS, wS, hS, dprS, ...ins] = process.argv.slice(2);
const zoom = Number(zoomS); const dpr = Number(dprS);
const x0 = Math.round(Number(xS) * dpr); const y0 = Math.round(Number(yS) * dpr);
const w = Math.round(Number(wS) * dpr); const h = Math.round(Number(hS) * dpr);
const tiles = ins.map((f) => {
  const img = decodePng(readFileSync(f));
  const data = new Uint8Array(w * zoom * h * zoom * 4);
  for (let y = 0; y < h * zoom; y += 1) for (let x = 0; x < w * zoom; x += 1) {
    const sx = Math.min(img.width - 1, x0 + Math.floor(x / zoom)); const sy = Math.min(img.height - 1, y0 + Math.floor(y / zoom));
    const s = (sy * img.width + sx) * 4; const d = (y * w * zoom + x) * 4;
    data[d] = img.data[s]; data[d + 1] = img.data[s + 1]; data[d + 2] = img.data[s + 2]; data[d + 3] = 255;
  }
  return { width: w * zoom, height: h * zoom, data };
});
const gap = 6; const W = tiles.length * (w * zoom + gap) - gap; const H = h * zoom;
const o = new Uint8Array(W * H * 4).fill(255);
tiles.forEach((t, i) => { const ox = i * (w * zoom + gap); for (let y = 0; y < H; y += 1) for (let x = 0; x < t.width; x += 1) { const s = (y * t.width + x) * 4; const d = (y * W + ox + x) * 4; o[d] = t.data[s]; o[d + 1] = t.data[s + 1]; o[d + 2] = t.data[s + 2]; o[d + 3] = 255; } });
writeFileSync(out, encodePng({ width: W, height: H, data: o }));
