// Envio de mensagens pela Cloud API com teto de consumo e janela de 24 h.
// Chamado pelo worker local (resposta pronta / reenvio) e pelo painel (resposta humana).
import { env, serviceClient } from "../_shared/deno-env.ts";
import { whatsappSendHandler } from "../_shared/handlers.ts";

declare const Deno: { serve(h: (req: Request) => Response | Promise<Response>): void };

Deno.serve((req) => whatsappSendHandler(req, env, serviceClient()));
