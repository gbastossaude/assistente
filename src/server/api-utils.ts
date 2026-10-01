import "server-only";
import { NextResponse } from "next/server";
import { can, type Permission } from "@/lib/auth/permissions";
import { ForbiddenError, getCurrentUser, type CurrentUser } from "./auth";
import { BusinessError, logTechnicalError } from "./errors";

/** Envelope para Route Handlers: autenticação, permissão e tratamento centralizado de erros. */
export async function apiHandler(permission: Permission, fn: (user: CurrentUser) => Promise<Response>, context = "api") {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (!can(user.role, permission)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    return await fn(user);
  } catch (e) {
    if (e instanceof BusinessError) return NextResponse.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: 422 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    logTechnicalError(context, e);
    return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
