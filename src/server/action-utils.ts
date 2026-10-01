import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Permission } from "@/lib/auth/permissions";
import { ForbiddenError, requirePermission, type CurrentUser } from "./auth";
import { BusinessError, logTechnicalError } from "./errors";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    const first = r.error.issues[0];
    throw new BusinessError(first ? `${first.message}` : "Dados inválidos", fieldErrors);
  }
  return r.data;
}

function isNextControlFlow(e: unknown) {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_HTTP_ERROR"));
}

/**
 * Envelopa uma Server Action: autorização, tratamento centralizado de erros e revalidação.
 * Erros de negócio voltam como mensagem; erros inesperados são logados sem dados pessoais.
 */
export async function runAction<T>(
  permission: Permission,
  fn: (user: CurrentUser) => Promise<T>,
  opts: { revalidate?: string[]; message?: string; context?: string } = {},
): Promise<ActionResult<T>> {
  try {
    const user = await requirePermission(permission);
    const data = await fn(user);
    for (const p of opts.revalidate ?? ["/"]) revalidatePath(p, "layout");
    return { ok: true, data, message: opts.message };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    if (e instanceof BusinessError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    logTechnicalError(opts.context ?? "action", e);
    return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
  }
}
