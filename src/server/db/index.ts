import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada (veja .env.example)");
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    ssl: /sslmode=require|supabase\.co/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
}

const pool = globalForDb.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;

export const db: DB = drizzle(pool, { schema });
export { schema };

/** Transação tipada. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;
