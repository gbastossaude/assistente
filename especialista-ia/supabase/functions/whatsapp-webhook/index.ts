// Webhook oficial da WhatsApp Business Cloud API.
// GET: verificação do endpoint pela Meta. POST: eventos (mensagens e status), com assinatura validada.
// verify_jwt = false (a Meta não envia JWT); a autenticidade vem do X-Hub-Signature-256.
import { coreDeps, serviceClient } from "../_shared/deno-env.ts";
import { handleVerify, handleWebhook } from "../_shared/whatsapp-core.ts";

declare const Deno: { serve(h: (req: Request) => Response | Promise<Response>): void };

const MAX_BODY = 512 * 1024;

Deno.serve(async (req) => {
  const deps = coreDeps(serviceClient());
  const url = new URL(req.url);
  if (req.method === "GET") {
    const r = handleVerify(url, deps.config.verifyToken);
    return new Response(r.body, { status: r.status, headers: r.headers });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!deps.config.appSecret || !deps.config.phoneNumberId) {
    return new Response(JSON.stringify({ error: "WHATSAPP_APP_SECRET/WHATSAPP_PHONE_NUMBER_ID não configurados" }), { status: 503 });
  }
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength > MAX_BODY) return new Response("payload too large", { status: 413 });
  try {
    const r = await handleWebhook(raw, req.headers.get("x-hub-signature-256"), deps);
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } });
  } catch (err) {
    // 500 faz a Meta reenviar depois; o processamento é idempotente pelo wamid.
    console.error(JSON.stringify({ msg: "erro no webhook", error: (err as Error).message }));
    return new Response(JSON.stringify({ error: "erro interno" }), { status: 500 });
  }
});
