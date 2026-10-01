import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgConfig } from "./pg-config";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

function createPool() {
  return new Pool(pgConfig(process.env.DATABASE_URL, { max: Number(process.env.DB_POOL_MAX ?? 10) }));
}

const pool = globalForDb.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;

export const db: DB = drizzle(pool, { schema });
export { schema };

/** Transação tipada. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;
