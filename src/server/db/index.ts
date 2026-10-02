import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { pgConfig } from "./pg-config";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

function createPool() {
  return new Pool(
    pgConfig(process.env.DATABASE_URL, {
      max: Number(process.env.DB_POOL_MAX ?? 10),
      // Mantém conexões abertas entre cliques: abrir uma nova (TLS + autenticação no pooler) custa várias idas e
      // voltas — caro com o banco em outra região. O padrão do pg fecha após 10 s ociosa.
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 300_000),
      keepAlive: true,
    }),
  );
}

let instance: DB | undefined;

/** Conecta só no primeiro uso: o `next build` não precisa de DATABASE_URL. */
function getDb(): DB {
  if (!instance) {
    const pool = globalForDb.__pgPool ?? createPool();
    if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;
    instance = drizzle(pool, { schema });
  }
  return instance;
}

export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
export { schema };

/** Transação tipada. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;
