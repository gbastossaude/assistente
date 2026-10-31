/**
 * Handlers HTTP das Edge Functions, independentes do runtime (Deno no Supabase; Node nos testes).
 * Recebem o cliente Supabase com service role — que existe SOMENTE no servidor.
 */
import { corsHeaders, json } from "./http.ts";
import { MetaCloudApi } from "./meta-api.ts";
import { flushPendingAnswers, handleVerify, handleWebhook, sendAnswer, sendHumanReply, type CoreDeps } from "./whatsapp-core.ts";
import { createRpcWhatsAppDb } from "./whatsapp-db.ts";

export type Env = (key: string) => string;
// deno-lint-ignore no-explicit-any
export type ServiceClient = any;

export interface Actor {
  id: string;
  role: string;
  active: boolean;
  full_name: string;
}

export function coreDepsFrom(client: ServiceClient, env: Env, fetchImpl?: typeof fetch): CoreDeps {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  return {
    db: createRpcWhatsAppDb(rpc),
    meta: token && phoneNumberId
      ? new MetaCloudApi({ accessToken: token, phoneNumberId, apiVersion: env("WHATSAPP_GRAPH_VERSION") || "v23.0", baseUrl: env("WHATSAPP_GRAPH_BASE_URL") || undefined, fetchImpl })
      : null,
    config: { verifyToken: env("WHATSAPP_VERIFY_TOKEN"), appSecret: env("WHATSAPP_APP_SECRET"), phoneNumberId },
    log: (msg, meta) => console.log(JSON.stringify({ msg, ...meta })),
  };
}

/** Identifica o usuário pelo JWT do cabeçalho Authorization e devolve o perfil ativo. */
export async function authenticate(client: ServiceClient, req: Request): Promise<Actor | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await client.from("profiles").select("id, role, active, full_name").eq("id", data.user.id).maybeSingle();
  if (!profile?.active) return null;
  return profile as Actor;
}

const MAX_BODY = 512 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function webhookHandler(req: Request, env: Env, client: ServiceClient, fetchImpl?: typeof fetch): Promise<Response> {
  const deps = coreDepsFrom(client, env, fetchImpl);
  if (req.method === "GET") {
    const r = handleVerify(new URL(req.url), deps.config.verifyToken);
    return new Response(r.body, { status: r.status, headers: r.headers });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!deps.config.appSecret || !deps.config.phoneNumberId) {
    return json(503, { error: "WHATSAPP_APP_SECRET/WHATSAPP_PHONE_NUMBER_ID não configurados" });
  }
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength > MAX_BODY) return new Response("payload too large", { status: 413 });
  try {
    const r = await handleWebhook(raw, req.headers.get("x-hub-signature-256"), deps);
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } });
  } catch (err) {
    // 500 faz a Meta reenviar depois; o processamento é idempotente pelo wamid.
    console.error(JSON.stringify({ msg: "erro no webhook", error: (err as Error).message }));
    return json(500, { error: "erro interno" });
  }
}

export async function whatsappSendHandler(req: Request, env: Env, client: ServiceClient, fetchImpl?: typeof fetch): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"), (env("ADMIN_ORIGINS") || "*").split(","));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "método não permitido" }, cors);
  const user = await authenticate(client, req);
  if (!user) return json(401, { error: "não autenticado" }, cors);
  const body = (await req.json().catch(() => ({}))) as { question_id?: string; action?: string; handoff_id?: string; text?: string };
  const deps = coreDepsFrom(client, env, fetchImpl);
  try {
    if (body.action === "flush") {
      if (!["worker", "admin"].includes(user.role)) return json(403, { error: "sem permissão" }, cors);
      return json(200, await flushPendingAnswers(deps), cors);
    }
    if (body.question_id) {
      if (!["worker", "admin", "editor"].includes(user.role)) return json(403, { error: "sem permissão" }, cors);
      if (!UUID.test(body.question_id)) return json(400, { error: "question_id inválido" }, cors);
      return json(200, await sendAnswer(deps, body.question_id), cors);
    }
    if (body.handoff_id) {
      if (!["admin", "editor"].includes(user.role)) return json(403, { error: "sem permissão" }, cors);
      if (!UUID.test(body.handoff_id) || !body.text?.trim()) return json(400, { error: "dados inválidos" }, cors);
      const r = await sendHumanReply(deps, body.handoff_id, body.text, user.full_name);
      if (r.status === "enviada") {
        await client.from("handoff_requests").update({ status: "em_atendimento", assigned_to: user.id }).eq("id", body.handoff_id).eq("status", "aberto");
      }
      return json(200, r, cors);
    }
    return json(400, { error: "informe question_id, handoff_id ou action" }, cors);
  } catch (err) {
    console.error(JSON.stringify({ msg: "erro no envio", error: (err as Error).message }));
    return json(500, { error: "erro interno" }, cors);
  }
}

const ROLES = ["admin", "editor", "colaborador", "worker"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function strongPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 28) + "!9a";
}

export async function adminUsersHandler(req: Request, env: Env, client: ServiceClient): Promise<Response> {
  const cors = corsHeaders(req.headers.get("origin"), (env("ADMIN_ORIGINS") || "*").split(","));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "método não permitido" }, cors);
  const actor = await authenticate(client, req);
  if (!actor || actor.role !== "admin") return json(403, { error: "somente administradores" }, cors);

  const body = (await req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const audit = (action: string, entityId: string, details: Record<string, unknown>) =>
    client.from("audit_logs").insert({ actor_id: actor.id, actor_role: "admin", action, entity: "auth.users", entity_id: entityId, details });

  try {
    switch (body.action) {
      case "create": {
        const email = (body.email ?? "").trim().toLowerCase();
        const role = body.role ?? "colaborador";
        if (!EMAIL.test(email) || !ROLES.includes(role)) return json(400, { error: "e-mail ou papel inválido" }, cors);
        const invite = body.mode === "invite" && role !== "worker";
        const password = invite ? undefined : strongPassword();
        const meta = { app_metadata: { role, active: true }, user_metadata: { full_name: (body.full_name ?? "").slice(0, 120) } };
        const res = invite
          ? await client.auth.admin.inviteUserByEmail(email, { data: meta.user_metadata, redirectTo: body.redirect_to })
          : await client.auth.admin.createUser({ email, password, email_confirm: true, ...meta });
        if (res.error || !res.data?.user) return json(400, { error: res.error?.message ?? "falha ao criar" }, cors);
        const id = res.data.user.id;
        if (invite) await client.auth.admin.updateUserById(id, { app_metadata: meta.app_metadata });
        await client.from("profiles").upsert({ id, email, full_name: meta.user_metadata.full_name, role, active: true });
        await audit("criar_usuario", id, { email, role, convite: invite });
        // A senha temporária é exibida UMA vez ao administrador e não é armazenada.
        return json(200, { id, email, role, temporary_password: password ?? null }, cors);
      }
      case "reset_password": {
        if (!body.user_id || !UUID.test(body.user_id)) return json(400, { error: "user_id obrigatório" }, cors);
        const password = strongPassword();
        const { error } = await client.auth.admin.updateUserById(body.user_id, { password });
        if (error) return json(400, { error: error.message }, cors);
        await audit("redefinir_senha", body.user_id, {});
        return json(200, { temporary_password: password }, cors);
      }
      case "block":
      case "unblock": {
        if (!body.user_id || !UUID.test(body.user_id) || body.user_id === actor.id) return json(400, { error: "usuário inválido" }, cors);
        const block = body.action === "block";
        const { error } = await client.auth.admin.updateUserById(body.user_id, { ban_duration: block ? "876000h" : "none" });
        if (error) return json(400, { error: error.message }, cors);
        const { error: pErr } = await client.from("profiles").update({ active: !block }).eq("id", body.user_id);
        if (pErr) return json(400, { error: pErr.message }, cors);
        await audit(block ? "bloquear_usuario" : "desbloquear_usuario", body.user_id, {});
        return json(200, { ok: true }, cors);
      }
      default:
        return json(400, { error: "ação inválida" }, cors);
    }
  } catch (err) {
    console.error(JSON.stringify({ msg: "erro admin-users", error: (err as Error).message }));
    return json(500, { error: "erro interno" }, cors);
  }
}
