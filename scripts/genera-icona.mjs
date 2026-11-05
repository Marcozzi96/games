// Genera le icone PNG della PWA (192, 512, maskable 512) da pixel,
// zero dipendenze: encoding PNG manuale (IHDR + IDAT + IEND, CRC32).
// Stesso disegno di public/icons/icon.svg: sfondo scuro arrotondato +
// croce da D-pad in verde accento.
//
// Uso: node scripts/genera-icona.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'icons');

const SFONDO = [17, 24, 39, 255]; // #111827
const ACCENTO = [74, 222, 128, 255]; // #4ade80

// Dentro un rettangolo arrotondato (test sul centro del pixel).
// [x0, y0, x1, y1] in unità dell'icona, r = raggio angoli.
function dentroRettangoloArrotondato(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const dx = Math.max(Math.abs(px - cx) - (x1 - x0) / 2 + r, 0);
  const dy = Math.max(Math.abs(py - cy) - (y1 - y0) / 2 + r, 0);
  return dx * dx + dy * dy <= r * r;
}

// Disegna il design a dimensione S (geometria proporzionale all'SVG 512).
// maskable: tutto scalato di 0.8 (padding 20% per la zona sicura).
function disegna(S, { maskable = false } = {}) {
  const k = (maskable ? 0.8 : 1) / 512; // scala: coordinate SVG → pixel
  const scala = maskable ? 0.8 : 1;
  const px = new Uint8ClampedArray(S * S * 4);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      // Coordinate in spazio SVG (0..512), al centro del pixel.
      const sx = (i + 0.5) / S / k - 256 * (1 - scala) / scala;
      const sy = (j + 0.5) / S / k - 256 * (1 - scala) / scala;
      let rgba = [0, 0, 0, 0];
      if (dentroRettangoloArrotondato(sx, sy, 0, 0, 512, 512, 112)) {
        rgba = SFONDO;
        // Croce: barra verticale + barra orizzontale (raggio 24).
        const barraV = dentroRettangoloArrotondato(sx, sy, 196, 112, 316, 400, 24);
        const barraH = dentroRettangoloArrotondato(sx, sy, 112, 196, 400, 316, 24);
        if (barraV || barraH) rgba = ACCENTO;
      }
      const o = (j * S + i) * 4;
      px[o] = rgba[0];
      px[o + 1] = rgba[1];
      px[o + 2] = rgba[2];
      px[o + 3] = rgba[3];
    }
  }
  return px;
}

// --- Encoding PNG minimale -------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dati) {
  const out = Buffer.alloc(12 + dati.length);
  out.writeUInt32BE(dati.length, 0);
  out.write(tipo, 4, 'ascii');
  dati.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + dati.length)), 8 + dati.length);
  return out;
}

function codificaPNG(S, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // compression/filter/interlace = 0
  // IDAT: scanline con filter byte 0 + riga RGBA
  const righe = Buffer.alloc(S * (1 + S * 4));
  for (let j = 0; j < S; j++) {
    righe[j * (1 + S * 4)] = 0;
    Buffer.from(px.buffer, j * S * 4, S * 4).copy(righe, j * (1 + S * 4) + 1);
  }
  const idat = deflateSync(righe);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icone = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
];
for (const [nome, S, opz] of icone) {
  writeFileSync(join(OUT, nome), codificaPNG(S, disegna(S, opz)));
  console.log(`scritto ${nome} (${S}×${S})`);
}
