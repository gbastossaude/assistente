import { AiUnavailableError, answerQuestion, type AnswerDeps } from "@especialista/ai-core";
import type { ProcessingJobRow } from "@especialista/shared";
import type { WorkerRepository } from "../repository.ts";

export const UNAVAILABLE_MESSAGE =
  "O assistente está temporariamente indisponível e não conseguiu processar sua pergunta. Tente novamente mais tarde ou fale com o responsável.";

export interface AnswerJobContext {
  repo: WorkerRepository;
  buildDeps: () => Promise<Omit<AnswerDeps, "retriever">>;
  logger: { info: (m: string, meta?: Record<string, unknown>) => void; warn: (m: string, meta?: Record<string, unknown>) => void };
}

export async function processAnswerJob(job: ProcessingJobRow, ctx: AnswerJobContext): Promise<{ outcome: string; whatsapp?: string }> {
  const q = await ctx.repo.getQuestion(job.question_id!);
  const deps = await ctx.buildDeps();
  let answer: Record<string, unknown>;
  let sources: Awaited<ReturnType<typeof answerQuestion>>["sources"] = [];
  try {
    const r = await answerQuestion(
      { text: q.text, channel: q.channel, context: q.context, parentText: q.parentText },
      { ...deps, retriever: ctx.repo },
    );
    sources = r.sources;
    answer = { ...r, sources: undefined };
  } catch (err) {
    const retryable = err instanceof AiUnavailableError;
    if (retryable && job.attempts < job.max_attempts) {
      // Volta para a fila com espera crescente; a pergunta continua "pendente" para o usuário.
      await ctx.repo.failJob(job.id, (err as Error).message, true);
      return { outcome: "reagendada" };
    }
    ctx.logger.warn("falha definitiva ao responder", { job: job.id, error: (err as Error).message });
    answer = {
      outcome: "erro",
      content: UNAVAILABLE_MESSAGE,
      warnings: [],
      detected: {},
      provider: null,
      model: null,
    };
  }
  await ctx.repo.saveAnswer(job.id, answer, sources);
  let whatsapp: string | undefined;
  if (q.channel === "whatsapp") {
    const sent = await ctx.repo.notifyWhatsapp({ question_id: q.id });
    whatsapp = sent.ok ? sent.status ?? "ok" : `falha: ${sent.error}`;
  }
  return { outcome: String(answer.outcome), whatsapp };
}
