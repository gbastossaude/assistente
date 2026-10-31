// Somente Deno (Supabase Edge Runtime). Não importado pelos testes em Node.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import type { ServiceClient } from "./handlers.ts";
import { DB_SCHEMA } from "./vendor/constants.ts";

declare const Deno: { env: { get(k: string): string | undefined } };

export const env = (k: string) => Deno.env.get(k) ?? "";

/** Cliente com service role — existe SOMENTE no servidor (segredo da Edge Function). */
export function serviceClient(): ServiceClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: DB_SCHEMA },
  });
}
