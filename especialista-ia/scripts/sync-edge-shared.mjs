// Copia o código compartilhado (sem dependências) para as Edge Functions do Supabase,
// que são empacotadas a partir de supabase/functions. Execute após alterar packages/shared:
//   node scripts/sync-edge-shared.mjs          (copia)
//   node scripts/sync-edge-shared.mjs --check  (falha se estiver desatualizado — usado nos testes/CI)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = ["constants.ts", "text.ts", "pii.ts", "phone.ts", "injection.ts", "format.ts"];
const header = "// ARQUIVO GERADO por scripts/sync-edge-shared.mjs a partir de packages/shared/src — não edite aqui.\n";
const check = process.argv.includes("--check");
let stale = [];
for (const f of files) {
  const src = header + readFileSync(path.join(root, "packages/shared/src", f), "utf8");
  const dest = path.join(root, "supabase/functions/_shared/vendor", f);
  if (check) {
    if (!existsSync(dest) || readFileSync(dest, "utf8") !== src) stale.push(f);
  } else writeFileSync(dest, src);
}
if (check && stale.length) {
  console.error(`Desatualizado: ${stale.join(", ")}. Rode: node scripts/sync-edge-shared.mjs`);
  process.exit(1);
}
console.log(check ? "vendor em dia" : `copiados: ${files.join(", ")}`);
