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
// Bloqueia chaves reais no pacote: JWT com papel service_role, chaves secretas novas do Supabase e tokens da Meta.
function findSecrets(text) {
  const found = [];
  for (const jwt of text.match(/eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g) ?? []) {
    try {
      if (JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).role === "service_role") found.push("JWT service_role");
    } catch {
      /* não é JWT */
    }
  }
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text)) found.push("chave sb_secret_");
  if (/EAA[A-Za-z0-9]{60,}/.test(text)) found.push("token de acesso da Meta");
  return found;
}
for (const [name, file] of Object.entries(zip.files)) {
  if (file.dir) continue;
  const secrets = findSecrets(readFileSync(path.join(dist, name), "latin1"));
  if (secrets.length) throw new Error(`Segredo proibido encontrado em ${name}: ${secrets.join(", ")}`);
}
mkdirSync(path.join(root, "release"), { recursive: true });
const out = path.join(root, "release", `especialista-ia-extensao-${manifest.version}.zip`);
writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(`pacote: ${out}`);
