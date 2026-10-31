import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";
export const configured = Boolean(SUPABASE_URL && ANON);

/** Cliente com a chave pública (anon): tudo é protegido por login + RLS. Nenhum segredo vai para o navegador. */
export const sb = createClient(SUPABASE_URL || "http://localhost:54321", ANON || "anon-nao-configurada", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "especialista.admin.auth" },
  global: { headers: { "x-client-info": "especialista-admin" } },
});

export function unwrap<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

/** Chama uma Edge Function com o JWT do usuário logado. */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      if (j?.error) detail = j.error;
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(detail);
  }
  return data as T;
}
