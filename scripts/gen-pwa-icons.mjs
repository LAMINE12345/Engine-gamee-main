// Génère les icônes PWA (192/512) en PNG pur (zlib natif, zéro dépendance).
// Motif : fond nuit arrondi + diamant violet + reflet.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.from(type, 'ascii');
  const cr = Buffer.alloc(4);
  cr.writeUInt32BE(crc32(Buffer.concat([td, data])));
  return Buffer.concat([len, td, data, cr]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.subarray(y * w * 4, (y + 1) * w * 4)).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function paint(size) {
  const px = new Uint8ClampedArray(size * size * 4);
  const R = 0.22 * size; // rayon coins
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      // Fond nuit avec coins arrondis.
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      let a = 255;
      let r = 14;
      let g = 15;
      let b = 24;
      if (dx < R && dy < R) {
        const d = Math.hypot(R - dx, R - dy);
        if (d > R) {
          a = 0;
        } else if (d > R - 1.5) {
          const t = (d - (R - 1.5)) / 1.5;
          a = Math.round(255 * (1 - t));
        }
      }
      // Halo radial violet.
      const dh = Math.hypot(x - cx, y - cy) / (size * 0.5);
      const glow = Math.max(0, 1 - dh);
      r += Math.round(60 * glow * glow);
      g += Math.round(30 * glow * glow);
      b += Math.round(110 * glow * glow);
      // Diamant (cube isométrique simplifié).
      const s = size * 0.30;
      const lx = Math.abs(x - cx) / s + Math.abs(y - cy) / (s * 1.22);
      if (lx < 1) {
        const edge = lx > 0.86 ? 0.55 : 1;
        const top = y < cy ? 1.18 : 0.82;
        r = Math.round((139 * top * edge + r * (1 - edge)) );
        g = Math.round((92 * top * edge + g * (1 - edge)));
        b = Math.round((246 * top * edge + b * (1 - edge)));
      }
      // Reflet diagonal subtil.
      if (x + y < size * 0.55 && a > 0) {
        r = Math.min(255, r + 10);
        g = Math.min(255, g + 10);
        b = Math.min(255, b + 14);
      }
      px[o] = Math.min(255, r);
      px[o + 1] = Math.min(255, g);
      px[o + 2] = Math.min(255, b);
      px[o + 3] = a;
    }
  }
  return px;
}

for (const size of [192, 512]) {
  const png = encodePNG(size, size, paint(size));
  const name = size === 512 ? 'icon-512.png' : 'icon-192.png';
  writeFileSync(join(outDir, name), png);
  console.log(`icons/${name} : ${(png.length / 1024).toFixed(1)} Ko`);
}
// Maskable : même 512 avec zone de sécurité (fond plein déjà adapté).
writeFileSync(join(outDir, 'maskable-512.png'), encodePNG(512, 512, paint(512)));
console.log('icons/maskable-512.png ok');
