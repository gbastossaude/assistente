import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import { routeIntent } from "@/lib/assistant/router";
import { formatDateBR, todayISO } from "@/lib/domain/dates";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { assistantActions, assistantMessages, tasks } from "../db/schema";
import { BusinessError, logTechnicalError } from "../errors";
import { addTimeline } from "../timeline";
import { runTool, TOOLS } from "./tools";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 6;

const SYSTEM = `Você é o assistente operacional do Head de Planos de Saúde da BeSmart (corretora). Responda em português do Brasil, de forma objetiva e executiva.
Regras obrigatórias:
- Use SOMENTE dados obtidos pelas ferramentas. Nunca invente empresas, números, datas, status ou documentos. Se a informação não existir no sistema, diga claramente que está pendente/ausente.
- Para perguntas sobre cotações, pendências, renovações, operadoras, histórico ou agenda, consulte a ferramenta adequada antes de responder.
- Você não altera dados diretamente. Ações em lote só podem ser PROPOSTAS pela ferramenta de proposta; deixe claro que o usuário precisa confirmar na interface e liste exatamente os registros afetados.
- Mensagens de e-mail/WhatsApp são geradas como texto para o usuário revisar e enviar; nunca afirme que algo foi enviado.
- Não exponha CID ou dados clínicos individuais em resumos gerais.
- Datas no formato dd/mm/aaaa.`;

export interface AssistantReply {
  text: string;
  actionIds: string[];
  mode: "claude" | "local";
}

async function localAnswer(text: string, user: CurrentUser, note?: string): Promise<AssistantReply> {
  const intent = routeIntent(text, todayISO());
  if ("clarify" in intent) return { text: intent.clarify, actionIds: [], mode: "local" };
  const res = await runTool(intent.tool, intent.input, user);
  return { text: `${note ? `${note}\n\n` : ""}${res.text}`, actionIds: res.actionId ? [res.actionId] : [], mode: "local" };
}

async function claudeAnswer(text: string, user: CurrentUser): Promise<AssistantReply> {
  const client = new Anthropic();
  // Histórico recente (somente texto) — append-only, mantém a conversa coerente sem reenviar resultados de ferramentas.
  const history = await db
    .select({ role: assistantMessages.role, content: assistantMessages.content })
    .from(assistantMessages)
    .where(eq(assistantMessages.userId, user.id))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(12);
  const messages: Anthropic.Beta.BetaMessageParam[] = history
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  // garante alternância começando por user e terminando com a pergunta atual
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].content !== text) messages.push({ role: "user", content: text });

  const tools: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.jsonSchema as Anthropic.Beta.BetaTool.InputSchema,
    strict: true,
  }));
  const actionIds: string[] = [];
  const system = `${SYSTEM}\nHoje é ${formatDateBR(todayISO())}. Usuário: ${user.name} (${user.role}).`;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      tools,
      tool_choice: { type: "auto" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    });
    if (response.stop_reason === "refusal") {
      return { text: "Não posso ajudar com essa solicitação. Reformule a pergunta sobre os processos do sistema.", actionIds, mode: "claude" };
    }
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const out = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: out || "Sem resposta.", actionIds, mode: "claude" };
    }
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      try {
        const r = await runTool(tu.name, tu.input, user);
        if (r.actionId) actionIds.push(r.actionId);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: r.actionId ? `${r.text}\n[ação proposta ${r.actionId}: aguardando confirmação do usuário na interface]` : r.text });
      } catch (e) {
        logTechnicalError(`assistant-tool:${tu.name}`, e);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: "Erro ao consultar o sistema.", is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "A consulta exigiu passos demais. Tente uma pergunta mais específica.", actionIds, mode: "claude" };
}

export async function askAssistant(text: string, user: CurrentUser): Promise<AssistantReply> {
  const q = text.trim().slice(0, 2000);
  if (!q) throw new BusinessError("Digite uma pergunta.");
  await db.insert(assistantMessages).values({ userId: user.id, role: "user", content: q });
  let reply: AssistantReply;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      reply = await claudeAnswer(q, user);
    } catch (e) {
      // Erros de API/rede: responde pelo roteador local, sem perder a pergunta.
      if (e instanceof Anthropic.APIError || e instanceof Anthropic.APIConnectionError) logTechnicalError("assistant-claude", e);
      else throw e;
      reply = await localAnswer(q, user, "_(Claude indisponível no momento — resposta gerada pelo modo local.)_");
    }
  } else {
    reply = await localAnswer(q, user);
  }
  await db.insert(assistantMessages).values({ userId: user.id, role: "assistant", content: reply.text, payload: { actionIds: reply.actionIds, mode: reply.mode } });
  return reply;
}

export async function listConversation(userId: string, limit = 60) {
  const rows = await db.select().from(assistantMessages).where(eq(assistantMessages.userId, userId)).orderBy(desc(assistantMessages.createdAt)).limit(limit);
  const ordered = rows.reverse();
  const actionIds = ordered.flatMap((m) => ((m.payload?.actionIds as string[]) ?? []));
  const actions = actionIds.length ? await db.select().from(assistantActions).where(eq(assistantActions.userId, userId)).orderBy(asc(assistantActions.createdAt)) : [];
  return { messages: ordered, actions: actions.filter((a) => actionIds.includes(a.id)) };
}

export async function clearConversation(userId: string) {
  await db.delete(assistantMessages).where(eq(assistantMessages.userId, userId));
}

interface TaskItem {
  title: string;
  quotationId: string;
  companyId: string;
  insurerId: string;
  quotationInsurerId: string;
  dueDate: string;
  ownerId: string | null;
}

/** Executa (ou recusa) uma ação proposta — somente após confirmação explícita do usuário. */
export async function decideAction(actionId: string, confirm: boolean, user: CurrentUser) {
  const [a] = await db
    .select()
    .from(assistantActions)
    .where(and(eq(assistantActions.id, actionId), eq(assistantActions.userId, user.id)));
  if (!a) throw new BusinessError("Ação não encontrada.");
  if (a.status !== "proposta") throw new BusinessError("Esta ação já foi decidida.");
  if (!confirm) {
    await db.update(assistantActions).set({ status: "recusada", decidedAt: new Date() }).where(eq(assistantActions.id, actionId));
    await audit({ userId: user.id, action: "assistant_action", entityType: "assistant_action", entityId: actionId, summary: `Ação do assistente recusada: ${a.description}` });
    return { created: 0 };
  }
  if (a.kind !== "create_tasks") throw new BusinessError("Tipo de ação não suportado.");
  const items = (a.payload.items as TaskItem[]) ?? [];
  const created = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const it of items) {
      const [t] = await tx
        .insert(tasks)
        .values({
          title: it.title,
          description: "Criada pelo assistente após confirmação do usuário.",
          quotationId: it.quotationId,
          companyId: it.companyId,
          insurerId: it.insurerId,
          quotationInsurerId: it.quotationInsurerId,
          dueDate: it.dueDate,
          scheduledDate: it.dueDate,
          ownerId: it.ownerId ?? user.id,
          priority: "alta",
          category: "follow_up",
          source: "assistente",
          createdBy: user.id,
        })
        .returning({ id: tasks.id });
      ids.push(t.id);
      await addTimeline({ type: "sistema", description: `Tarefa criada via assistente: ${it.title}`, userId: user.id, quotationId: it.quotationId }, tx);
    }
    await tx.update(assistantActions).set({ status: "executada", decidedAt: new Date(), result: { taskIds: ids } }).where(eq(assistantActions.id, actionId));
    await audit({ userId: user.id, action: "batch", entityType: "assistant_action", entityId: actionId, summary: `Ação em lote confirmada (assistente): ${ids.length} tarefa(s) criada(s)`, changes: { taskIds: ids } }, tx);
    return ids.length;
  });
  return { created };
}
