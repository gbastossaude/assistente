// Gestão de contas (somente administradores): criar usuário/worker, redefinir senha, bloquear e desbloquear.
// Usa a service role APENAS no servidor; o painel envia o JWT do administrador.
import { env, serviceClient } from "../_shared/deno-env.ts";
import { adminUsersHandler } from "../_shared/handlers.ts";

declare const Deno: { serve(h: (req: Request) => Response | Promise<Response>): void };

Deno.serve((req) => adminUsersHandler(req, env, serviceClient()));
