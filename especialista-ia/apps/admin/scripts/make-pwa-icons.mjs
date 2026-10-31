// Gera os ícones do app instalável (PWA): quadrado azul-escuro com cruz branca, sem dependências.
// Para usar a logo da corretora, substitua os PNGs em public/ mantendo nomes e tamanhos.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };

// full = fundo sem cantos transparentes (ícone "maskable" e Apple); cruz menor para caber na zona segura.
function icon(size, full) {
  const row = size * 4 + 1, px = Buffer.alloc(row * size);
  const r = full ? 0 : size * 0.22, s = full ? 0.8 : 1, arm = size * 0.14 * s, len = size * 0.3 * s, c = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * row + 1 + x * 4;
    const dx = Math.max(r - x - 0.5, 0, x + 0.5 - (size - r)), dy = Math.max(r - y - 0.5, 0, y + 0.5 - (size - r));
    const inside = r === 0 || dx * dx + dy * dy <= r * r;
    const X = Math.abs(x + 0.5 - c), Y = Math.abs(y + 0.5 - c);
    const cross = (X <= arm && Y <= len) || (Y <= arm && X <= len);
    const [R, G, B] = cross ? [255, 255, 255] : [11, 31, 58];
    px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = inside ? 255 : 0;
  }
  const h = Buffer.alloc(13); h.writeUInt32BE(size, 0); h.writeUInt32BE(size, 4); h[8] = 8; h[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", h), chunk("IDAT", deflateSync(px)), chunk("IEND", Buffer.alloc(0))]);
}

const out = path.resolve(import.meta.dirname, "../public");
writeFileSync(path.join(out, "icon-192.png"), icon(192, false));
writeFileSync(path.join(out, "icon-512.png"), icon(512, false));
writeFileSync(path.join(out, "icon-maskable-512.png"), icon(512, true));
writeFileSync(path.join(out, "apple-touch-icon.png"), icon(180, true));
console.log("ícones do app gerados em", out);
