/** Erros de negócio: mensagem segura para exibir ao usuário. */
export class BusinessError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

export class NotFoundError extends BusinessError {
  constructor(what = "Registro") {
    super(`${what} não encontrado.`);
    this.name = "NotFoundError";
  }
}

/** Log técnico sem dados pessoais: apenas nome/mensagem/stack do erro e um contexto curto. */
export function logTechnicalError(context: string, err: unknown) {
  const e = err as Error;
  console.error(`[erro] ${context}: ${e?.name ?? "Error"} — ${e?.message?.slice(0, 300) ?? String(err).slice(0, 300)}`);
  if (process.env.NODE_ENV !== "production" && e?.stack) console.error(e.stack.split("\n").slice(1, 6).join("\n"));
}

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
