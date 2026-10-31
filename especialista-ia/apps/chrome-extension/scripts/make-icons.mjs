// Gera os ícones PNG da extensão (quadrado azul-escuro arredondado com cruz branca) sem dependências.
// Para usar a logo da corretora, substitua os arquivos em public/icons mantendo os nomes e tamanhos.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size) {
  const px = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22, arm = size * 0.14, len = size * 0.30, c = size / 2;
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const dx = Math.max(r - x - 0.5, 0, x + 0.5 - (size - r)), dy = Math.max(r - y - 0.5, 0, y + 0.5 - (size - r));
      const inside = dx * dx + dy * dy <= r * r;
      const cross = (Math.abs(x + 0.5 - c) <= arm && Math.abs(y + 0.5 - c) <= len) || (Math.abs(y + 0.5 - c) <= arm && Math.abs(x + 0.5 - c) <= len);
      const [R, G, B] = cross ? [255, 255, 255] : [11, 31, 58];
      px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(px)), chunk("IEND", Buffer.alloc(0))]);
}

const out = process.argv[2] ?? path.resolve(import.meta.dirname, "../public/icons");
mkdirSync(out, { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(path.join(out, `icon-${s}.png`), icon(s));
console.log(`ícones gerados em ${out}`);
