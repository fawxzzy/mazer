/** node contact-sheet.mjs out.png columns thumbWidth in1.png in2.png ... : box-downscaled grid of PNGs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { composeContactSheet, decodePng, encodePng, resizeBox } from './lib/png-codec.mjs';
const [out, columns, thumbWidth, ...ins] = process.argv.slice(2);
const thumbs = ins.map((f) => {
  const img = decodePng(readFileSync(f));
  const w = Number(thumbWidth);
  return resizeBox(img, w, Math.round((img.height * w) / img.width));
});
writeFileSync(out, encodePng(composeContactSheet(thumbs, { columns: Number(columns), gutter: 4 })));
