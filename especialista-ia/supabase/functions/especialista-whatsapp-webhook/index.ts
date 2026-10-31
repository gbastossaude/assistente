// Webhook oficial da WhatsApp Business Cloud API.
// GET: verificação do endpoint pela Meta. POST: eventos (mensagens e status), com assinatura validada.
// verify_jwt = false (a Meta não envia JWT); a autenticidade vem do X-Hub-Signature-256.
import { env, serviceClient } from "../_shared/deno-env.ts";
import { webhookHandler } from "../_shared/handlers.ts";

declare const Deno: { serve(h: (req: Request) => Response | Promise<Response>): void };

Deno.serve((req) => webhookHandler(req, env, serviceClient()));
