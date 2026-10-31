import type pg from "pg";
import { asUser } from "./db.ts";

const SET_RETURNING = new Set(["wa_pending_answers"]);

/** Chama funções SQL com argumentos nomeados, como o supabase.rpc() faz via PostgREST. */
export function pgRpc(pool: pg.Pool, user: string = "service_role") {
  return async (fn: string, args: Record<string, unknown>) => {
    if (!/^[a-z_]+$/.test(fn)) throw new Error("nome inválido");
    const keys = Object.keys(args);
    const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
    const values = keys.map((k) => {
      const v = args[k];
      return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v;
    });
    const rows = await asUser(pool, user, async (db) => (await db.query(sql, values)).rows);
    if (SET_RETURNING.has(fn)) return rows.map((r) => r[fn]);
    return rows[0]?.[fn] ?? null;
  };
}
