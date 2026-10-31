import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "../..");
export const ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
export const TEST_DB = process.env.TEST_DB_NAME ?? "especialista_test";

export async function canConnect(): Promise<boolean> {
  const c = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    const r = await c.query("select 1 from pg_available_extensions where name = 'vector'");
    return r.rowCount === 1;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => {});
  }
}

/** Recria o banco de teste, aplica o shim do Supabase e TODAS as migrations na ordem. */
export async function resetDatabase(dbName: string = TEST_DB): Promise<pg.Pool> {
  if (!/^[a-z_][a-z0-9_]*$/.test(dbName)) throw new Error("nome de banco inválido");
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 12 });
  pool.on("error", () => {});
  await pool.query(readFileSync(path.join(ROOT, "tests/db/supabase-shim.sql"), "utf8"));
  const dir = path.join(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(path.join(dir, f), "utf8"));
  }
  return pool;
}

export type Db = pg.PoolClient;

/** Executa como um usuário autenticado da API (mesmo mecanismo do PostgREST: role + claims do JWT). */
export async function asUser<T>(pool: pg.Pool, userId: string | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (userId === "service_role") {
      await client.query("set local role service_role");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    } else if (userId) {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    } else {
      await client.query("set local role anon");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    }
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function createUser(pool: pg.Pool, email: string, role: string | null, active = true): Promise<string> {
  const meta = role ? { role, active } : {};
  const r = await pool.query("insert into auth.users (email, raw_app_meta_data) values ($1, $2) returning id", [email, meta]);
  return r.rows[0].id as string;
}

/** Vetor de 1024 dimensões concentrado em algumas posições (permite controlar a similaridade). */
export function vec(...hot: number[]): string {
  const v = new Array(1024).fill(0);
  for (const h of hot) v[h % 1024] = 1;
  return `[${v.join(",")}]`;
}
