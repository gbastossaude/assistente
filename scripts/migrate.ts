import "dotenv/config";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { dbSchema, describeConnection, pgConfig } from "../src/server/db/pg-config";
import { runResilient } from "./script-timeout";

/**
 * Aplica as migrations de drizzle/. Com DATABASE_SCHEMA (ex.: "besmart"), tudo é criado nesse schema —
 * tabelas, tipos, views e o próprio histórico de migrations — sem tocar no schema "public" de outro sistema.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  const schema = dbSchema();
  const pool = new Pool(pgConfig(url));
  let folder = "./drizzle";
  let tmp: string | null = null;
  try {
    if (schema !== "public") {
      await pool.query(`create schema if not exists "${schema}"`);
      // As migrations geradas qualificam tipos/FKs com "public": reescreve para o schema do sistema.
      tmp = mkdtempSync(path.join(tmpdir(), "besmart-migrations-"));
      cpSync("./drizzle", tmp, { recursive: true });
      for (const f of readdirSync(tmp).filter((x) => x.endsWith(".sql"))) {
        const file = path.join(tmp, f);
        writeFileSync(file, readFileSync(file, "utf8").replaceAll('"public".', `"${schema}".`));
      }
      folder = tmp;
    }
    await migrate(drizzle(pool), { migrationsFolder: folder, migrationsSchema: schema === "public" ? "drizzle" : schema });
    console.log(`Migrations aplicadas (schema "${schema}").`);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    await pool.end();
  }
}
// Primeira instalação aplica todas as migrations pelo pooler (mais lenta): prazo maior por tentativa.
void runResilient(
  "Migração",
  async () => {
    try {
      await main();
    } catch (e) {
      console.error(`Conexão usada: ${describeConnection(process.env.DATABASE_URL)}`);
      throw e;
    }
  },
  { timeoutMs: Number(process.env.DB_SCRIPT_TIMEOUT_MS ?? 300_000) },
);
