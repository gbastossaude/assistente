// Somente Deno (Supabase Edge Runtime). Não importado pelos testes em Node.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { createRpcWhatsAppDb } from "./whatsapp-db.ts";
import { MetaCloudApi } from "./meta-api.ts";
import type { CoreDeps } from "./whatsapp-core.ts";

declare const Deno: { env: { get(k: string): string | undefined } };

export const env = (k: string) => Deno.env.get(k) ?? "";

/** Cliente com service role — existe SOMENTE no servidor (segredo da Edge Function). */
export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
}

export function coreDeps(client: SupabaseClient, apiVersion = "v23.0"): CoreDeps {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  return {
    db: createRpcWhatsAppDb(rpc),
    meta: token && phoneNumberId ? new MetaCloudApi({ accessToken: token, phoneNumberId, apiVersion: env("WHATSAPP_GRAPH_VERSION") || apiVersion }) : null,
    config: { verifyToken: env("WHATSAPP_VERIFY_TOKEN"), appSecret: env("WHATSAPP_APP_SECRET"), phoneNumberId },
    log: (msg, meta) => console.log(JSON.stringify({ msg, ...meta })),
  };
}

/** Identifica o usuário pelo JWT enviado no cabeçalho Authorization e devolve o perfil. */
export async function authenticate(client: SupabaseClient, req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await client.from("profiles").select("id, role, active, full_name").eq("id", data.user.id).maybeSingle();
  if (!profile?.active) return null;
  return profile as { id: string; role: string; active: boolean; full_name: string };
}
