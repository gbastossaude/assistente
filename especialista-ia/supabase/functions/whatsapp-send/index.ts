// Envio de mensagens pela Cloud API com teto de consumo e janela de 24 h.
// Chamado pelo worker local (resposta pronta / reenvio) e pelo painel (resposta humana).
import { authenticate, coreDeps, env, serviceClient } from "../_shared/deno-env.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { flushPendingAnswers, sendAnswer, sendHumanReply } from "../_shared/whatsapp-core.ts";

declare const Deno: { serve(h: (req: Request) => Response | Promise<Response>): void };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"), (env("ADMIN_ORIGINS") || "*").split(","));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "método não permitido" }, cors);

  const client = serviceClient();
  const user = await authenticate(client, req);
  if (!user) return json(401, { error: "não autenticado" }, cors);
  const body = (await req.json().catch(() => ({}))) as { question_id?: string; action?: string; handoff_id?: string; text?: string };
  const deps = coreDeps(client);

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
});
