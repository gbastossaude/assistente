/** Gera templates/BASE_SINTETICA_EXEMPLO.xlsm no layout BASE SAÚDE (dados fictícios). */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildBaseWorkbook, sampleLivesRows, syntheticCnpj } from "./sample-data";

async function main() {
  const rows = sampleLivesRows({ companyName: "EMPRESA EXEMPLO (SINTÉTICA)", cnpjs: [syntheticCnpj(1), syntheticCnpj(1, 2)], insurer: "OPERADORA ATUAL", plans: ["ENFERMARIA", "APARTAMENTO"], rows: 250, withErrors: true });
  mkdirSync("templates", { recursive: true });
  writeFileSync("templates/BASE_SINTETICA_EXEMPLO.xlsm", await buildBaseWorkbook(rows));
  console.log(`templates/BASE_SINTETICA_EXEMPLO.xlsm gerado (${rows.length} linhas, com 3 linhas de erro propositais).`);
}
main();
