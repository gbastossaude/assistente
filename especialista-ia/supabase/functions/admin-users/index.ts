// Gestão de contas (somente administradores): criar usuário/worker, redefinir senha, bloquear e desbloquear.
// Usa a service role APENAS no servidor; o painel envia o JWT do administrador.
import { authenticate, env, serviceClient } from "../_shared/deno-env.ts";
import { corsHeaders, json } from "../_shared/http.ts";

declare const Deno: { serve(h: (req: Request) => Response | Promise<Response>): void };

const ROLES = ["admin", "editor", "colaborador", "worker"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function strongPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 28) + "!9a";
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"), (env("ADMIN_ORIGINS") || "*").split(","));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "método não permitido" }, cors);
  const client = serviceClient();
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
        if (res.error || !res.data.user) return json(400, { error: res.error?.message ?? "falha ao criar" }, cors);
        const id = res.data.user.id;
        if (invite) await client.auth.admin.updateUserById(id, { app_metadata: meta.app_metadata });
        await client.from("profiles").upsert({ id, email, full_name: meta.user_metadata.full_name, role, active: true });
        await audit("criar_usuario", id, { email, role, convite: invite });
        // A senha temporária é exibida UMA vez ao administrador e não é armazenada.
        return json(200, { id, email, role, temporary_password: password ?? null }, cors);
      }
      case "reset_password": {
        if (!body.user_id) return json(400, { error: "user_id obrigatório" }, cors);
        const password = strongPassword();
        const { error } = await client.auth.admin.updateUserById(body.user_id, { password });
        if (error) return json(400, { error: error.message }, cors);
        await audit("redefinir_senha", body.user_id, {});
        return json(200, { temporary_password: password }, cors);
      }
      case "block":
      case "unblock": {
        if (!body.user_id || body.user_id === actor.id) return json(400, { error: "usuário inválido" }, cors);
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
});
