// Empacota dist/ em release/especialista-ia-extensao-<versão>.zip (para distribuir ou publicar na Chrome Web Store).
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const manifest = JSON.parse(readFileSync(path.join(dist, "manifest.json"), "utf8"));
const zip = new JSZip();
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const full = path.join(dir, f);
    if (statSync(full).isDirectory()) walk(full);
    else zip.file(path.relative(dist, full).split(path.sep).join("/"), readFileSync(full));
  }
};
walk(dist);
const forbidden = ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_SECRET"];
for (const [name, file] of Object.entries(zip.files)) {
  if (file.dir) continue;
  const text = readFileSync(path.join(dist, name), "latin1");
  for (const f of forbidden) if (text.includes(f)) throw new Error(`Segredo proibido encontrado em ${name}: ${f}`);
}
mkdirSync(path.join(root, "release"), { recursive: true });
const out = path.join(root, "release", `especialista-ia-extensao-${manifest.version}.zip`);
writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`pacote: ${out}`);
