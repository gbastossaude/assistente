/**
 * Regras do bot oficial do WhatsApp (independentes de Deno/Node):
 * verificação do webhook, assinatura, idempotência, autorização, comandos, fila,
 * teto de consumo, janela de 24 h e envio com retentativas.
 */
import { formatAnswerForWhatsApp } from "./vendor/format.ts";
import { HANDOFF_KEYWORDS, HELP_KEYWORDS, QUESTION_MAX_LENGTH, WHATSAPP_SERVICE_WINDOW_HOURS } from "./vendor/constants.ts";
import { phoneVariants, maskPhone } from "./vendor/phone.ts";
import { redactSensitive } from "./vendor/pii.ts";
import { normalizeText } from "./vendor/text.ts";
import type { MetaSender } from "./meta-api.ts";
import { verifyMetaSignature } from "./signature.ts";
import type { WaContact, WhatsAppDb } from "./whatsapp-db.ts";

export interface CoreConfig {
  verifyToken: string;
  appSecret: string;
  phoneNumberId: string;
}

export interface CoreDeps {
  db: WhatsAppDb;
  meta: MetaSender | null;
  config: CoreConfig;
  now?: () => Date;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface HttpResult {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

export const MESSAGES = {
  help:
    "Olá! Sou o *Especialista IA* da corretora. Envie sua dúvida sobre planos de saúde em uma única mensagem, " +
    "informando quando possível a *operadora*, o *estado*, a *modalidade* (PME, adesão, individual) e o *número de vidas*.\n\n" +
    'Para falar com uma pessoa, envie *"falar com responsável"*.\n' +
    "_Não envie CPF, documentos ou dados de saúde de clientes._",
  handoff:
    "Certo! Registrei seu pedido de atendimento humano. Um responsável vai falar com você pelo painel assim que possível.",
  handoffExisting: "Seu pedido de atendimento humano já está registrado e será respondido assim que possível.",
  unsupported: "Por enquanto consigo responder apenas mensagens de *texto*. Escreva sua dúvida, por favor.",
  offline:
    "Recebi sua pergunta. O assistente está temporariamente offline e responderá assim que voltar (dentro de 24 h). " +
    'Se for urgente, envie "falar com responsável".',
  unauthorized: "Este número não está autorizado a usar o assistente. Procure o administrador da corretora.",
} as const;

/** GET de verificação exigido pela Meta ao cadastrar o webhook. */
export function handleVerify(url: URL, verifyToken: string): HttpResult {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && verifyToken && token === verifyToken && /^[\w-]{1,200}$/.test(challenge)) {
    return { status: 200, body: challenge, headers: { "content-type": "text/plain" } };
  }
  return { status: 403, body: "forbidden" };
}

export function isHandoffCommand(text: string): boolean {
  const n = normalizeText(text).replace(/[!.?]+$/, "");
  return HANDOFF_KEYWORDS.some((k) => n === normalizeText(k)) || /^(quero )?falar com (um |o |a )?(responsavel|humano|atendente|pessoa|gerente|supervisor)/.test(n);
}

export function isHelpCommand(text: string): boolean {
  const n = normalizeText(text).replace(/[!.?,]+/g, "").trim();
  return HELP_KEYWORDS.some((k) => n === normalizeText(k));
}

interface MetaMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}
interface MetaStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  pricing?: { category?: string; billable?: boolean };
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}
interface MetaChangeValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string };
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}
interface MetaPayload {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: MetaChangeValue }> }>;
}

function isValidPayload(p: unknown): p is MetaPayload {
  if (!p || typeof p !== "object") return false;
  const o = p as MetaPayload;
  return o.object === "whatsapp_business_account" && Array.isArray(o.entry);
}

const tsToIso = (ts: string | undefined, now: Date) => {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : now.toISOString();
};

export interface SendRequest {
  contact: WaContact;
  profileId: string | null;
  kind: "resposta" | "ajuda" | "confirmacao" | "encaminhamento" | "humano" | "aviso_offline" | "nao_suportado";
  text: string;
  questionId?: string | null;
  handoffId?: string | null;
}

export type SendStatus = "enviada" | "falhou" | "bloqueada_limite" | "janela_expirada" | "desativado" | "duplicada" | "sem_credenciais";

/**
 * Envio com todos os controles: liga/desliga, janela de 24 h, idempotência, teto de consumo
 * (reserva atômica no banco) e registro do resultado. Nunca envia templates pagos.
 */
export async function sendControlled(deps: CoreDeps, req: SendRequest): Promise<{ status: SendStatus; error?: string }> {
  const now = deps.now?.() ?? new Date();
  const ctx = await deps.db.context();
  const pn = deps.config.phoneNumberId;
  const prepared = await deps.db.prepareOutbound({
    contactId: req.contact.id, profileId: req.profileId, kind: req.kind, body: req.text,
    questionId: req.questionId ?? null, handoffId: req.handoffId ?? null, phoneNumberId: pn,
  });
  if (prepared.duplicate || !prepared.id) return { status: "duplicada" };
  const id = prepared.id;

  if (!ctx.settings?.enabled) {
    await deps.db.finishOutbound({ id, status: "desativado", errorMessage: "Envio desativado em Configurações → WhatsApp.", attempts: 0 });
    return { status: "desativado" };
  }
  if (!deps.meta) {
    await deps.db.finishOutbound({ id, status: "falhou", errorCode: "config", errorMessage: "Credenciais da Meta não configuradas.", attempts: 0 });
    return { status: "sem_credenciais" };
  }
  if (!req.contact.window_expires_at || new Date(req.contact.window_expires_at) <= now) {
    await deps.db.finishOutbound({ id, status: "janela_expirada", errorMessage: `Janela de ${WHATSAPP_SERVICE_WINDOW_HOURS} h encerrada.`, attempts: 0 });
    return { status: "janela_expirada" };
  }
  const reservation = await deps.db.reserveSend(pn);
  if (!reservation.allowed) {
    await deps.db.finishOutbound({ id, status: "bloqueada_limite", errorCode: reservation.reason ?? "limite", errorMessage: `Bloqueio preventivo: ${reservation.reason}.`, attempts: 0 });
    deps.log?.("envio bloqueado pelo teto de consumo", { reason: reservation.reason, month: reservation.month_count, cap: reservation.cap });
    return { status: "bloqueada_limite", error: reservation.reason };
  }

  const result = await deps.meta.sendText(req.contact.wa_id, req.text);
  const usageDate = reservation.usage_date ?? now.toISOString().slice(0, 10);
  if (result.ok) {
    await deps.db.finishOutbound({ id, status: "enviada", waMessageId: result.messageId, usageDate, attempts: result.attempts });
    await deps.db.recordSend(pn, usageDate, true);
    return { status: "enviada" };
  }
  const status = result.windowExpired ? "janela_expirada" : "falhou";
  await deps.db.finishOutbound({ id, status, errorCode: result.errorCode, errorMessage: result.errorMessage, usageDate, attempts: result.attempts });
  await deps.db.recordSend(pn, usageDate, false);
  deps.log?.("falha no envio pela Cloud API", { code: result.errorCode, to: maskPhone(req.contact.wa_id) });
  return { status, error: result.errorMessage };
}

export interface WebhookSummary {
  messages: number;
  statuses: number;
  duplicates: number;
  unauthorized: number;
  queued: number;
  commands: number;
  ignored: number;
}

/** POST do webhook: valida a assinatura sobre o corpo bruto, registra e responde rápido. */
export async function handleWebhook(rawBody: Uint8Array, signature: string | null, deps: CoreDeps): Promise<HttpResult & { summary?: WebhookSummary }> {
  const now = deps.now?.() ?? new Date();
  const valid = await verifyMetaSignature(rawBody, signature, deps.config.appSecret);
  if (!valid) {
    await deps.db.logEvent({ signatureValid: false, kind: "desconhecido", messages: 0, statuses: 0, outcome: "assinatura_invalida" }).catch(() => {});
    return { status: 401, body: JSON.stringify({ error: "assinatura inválida" }) };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return { status: 400, body: JSON.stringify({ error: "JSON inválido" }) };
  }
  if (!isValidPayload(payload)) {
    await deps.db.logEvent({ signatureValid: true, kind: "invalido", messages: 0, statuses: 0, outcome: "estrutura_invalida" }).catch(() => {});
    return { status: 400, body: JSON.stringify({ error: "estrutura inválida" }) };
  }

  const summary: WebhookSummary = { messages: 0, statuses: 0, duplicates: 0, unauthorized: 0, queued: 0, commands: 0, ignored: 0 };
  let ctx: Awaited<ReturnType<WhatsAppDb["context"]>> | null = null;
  const getCtx = async () => (ctx ??= await deps.db.context());

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value) continue;
      const value = change.value;
      if (value.metadata?.phone_number_id && value.metadata.phone_number_id !== deps.config.phoneNumberId) {
        summary.ignored++;
        continue; // evento de outro número da mesma conta
      }
      for (const st of value.statuses ?? []) {
        if (!st.id || !st.status) continue;
        summary.statuses++;
        await deps.db.recordStatus({
          waMessageId: st.id, status: st.status, at: tsToIso(st.timestamp, now),
          pricingCategory: st.pricing?.category ?? null, billable: st.pricing?.billable ?? null,
          errorCode: st.errors?.[0]?.code !== undefined ? String(st.errors[0].code) : null,
          errorMessage: st.errors?.[0]?.message ?? st.errors?.[0]?.title ?? null,
        });
      }
      for (const msg of value.messages ?? []) {
        if (!msg.id || !msg.from) continue;
        summary.messages++;
        await handleInboundMessage(msg, deps, summary, getCtx, now);
      }
    }
  }
  await deps.db.logEvent({
    signatureValid: true, kind: summary.messages ? "mensagens" : summary.statuses ? "status" : "outro",
    messages: summary.messages, statuses: summary.statuses, outcome: "processado",
  }).catch(() => {});
  return { status: 200, body: JSON.stringify({ ok: true }), summary };
}

async function handleInboundMessage(
  msg: MetaMessage,
  deps: CoreDeps,
  summary: WebhookSummary,
  getCtx: () => Promise<Awaited<ReturnType<WhatsAppDb["context"]>>>,
  now: Date,
) {
  const rawText = msg.type === "text" ? (msg.text?.body ?? "").trim() : "";
  const redacted = rawText ? redactSensitive(rawText.slice(0, QUESTION_MAX_LENGTH)).text : null;
  const reg = await deps.db.registerInbound({
    waMessageId: msg.id!, phoneNumberId: deps.config.phoneNumberId, waId: msg.from!, variants: phoneVariants(msg.from!),
    type: msg.type ?? "desconhecido", body: redacted, sentAt: tsToIso(msg.timestamp, now),
  });
  if (reg.duplicate) {
    summary.duplicates++;
    return;
  }
  if (!reg.authorized) {
    summary.unauthorized++;
    deps.log?.("mensagem de número não autorizado", { from: maskPhone(msg.from!) });
    const ctx = await getCtx();
    if (ctx.settings?.reply_unauthorized && deps.meta) {
      // Opcional (desligado por padrão para não consumir a franquia com números desconhecidos).
      await deps.meta.sendText(msg.from!, MESSAGES.unauthorized).catch(() => {});
    }
    return;
  }
  const contact: WaContact = { id: reg.contact_id!, wa_id: msg.from!, profile_id: reg.profile_id!, window_expires_at: reg.window_expires_at! };
  const base = { contact, profileId: reg.profile_id! };

  if (msg.type !== "text" || !rawText) {
    summary.ignored++;
    await deps.db.updateInbound(reg.message_id!, "ignorada", "tipo de mensagem não suportado");
    await sendControlled(deps, { ...base, kind: "nao_suportado", text: MESSAGES.unsupported });
    return;
  }

  if (isHandoffCommand(rawText)) {
    summary.commands++;
    const h = await deps.db.createHandoff({ profileId: reg.profile_id!, contactId: reg.contact_id!, messageId: reg.message_id! });
    await sendControlled(deps, { ...base, kind: "encaminhamento", text: h.existing ? MESSAGES.handoffExisting : MESSAGES.handoff, handoffId: h.handoff_id });
    return;
  }
  if (isHelpCommand(rawText)) {
    summary.commands++;
    await deps.db.updateInbound(reg.message_id!, "comando");
    const recent = reg.last_help_sent_at && now.getTime() - new Date(reg.last_help_sent_at).getTime() < 10 * 60_000;
    if (!recent) {
      await deps.db.touchContact(reg.contact_id!, "help");
      await sendControlled(deps, { ...base, kind: "ajuda", text: MESSAGES.help });
    }
    return;
  }

  const ctx = await getCtx();
  const perMinute = Number(ctx.security?.rate_limit_per_minute ?? 6);
  if ((reg.recent_questions ?? 0) >= perMinute) {
    summary.ignored++;
    await deps.db.updateInbound(reg.message_id!, "ignorada", "limite de perguntas por minuto");
    return;
  }

  await deps.db.createQuestion({
    profileId: reg.profile_id!, contactId: reg.contact_id!, text: redacted!, parentQuestionId: reg.pending_question_id ?? null, messageId: reg.message_id!,
  });
  summary.queued++;

  if (!ctx.worker_online && ctx.settings?.offline_ack) {
    const recentNotice = reg.last_offline_notice_at && now.getTime() - new Date(reg.last_offline_notice_at).getTime() < 60 * 60_000;
    if (!recentNotice) {
      await deps.db.touchContact(reg.contact_id!, "offline");
      await sendControlled(deps, { ...base, kind: "aviso_offline", text: MESSAGES.offline });
    }
  }
}

/** Envia a resposta gerada pelo worker para a pergunta (chamado pelo worker após salvar). */
export async function sendAnswer(deps: CoreDeps, questionId: string): Promise<{ status: SendStatus | "sem_resposta" | "nao_whatsapp"; error?: string }> {
  const p = await deps.db.answerPayload(questionId);
  if (!p || p.channel !== "whatsapp" || !p.contact) return { status: "nao_whatsapp" };
  if (!p.answer) return { status: "sem_resposta" };
  const ctx = await deps.db.context();
  const text = formatAnswerForWhatsApp(
    { content: p.answer.content, warnings: p.answer.warnings },
    p.answer.outcome === "respondida" || p.answer.outcome === "conflito" ? p.sources : [],
    Number(ctx.settings?.max_answer_chars ?? 3500),
  );
  return sendControlled(deps, { contact: p.contact, profileId: p.contact.profile_id, kind: "resposta", text, questionId });
}

/** Reenvia respostas que falharam por erro transitório, ainda dentro da janela. */
export async function flushPendingAnswers(deps: CoreDeps, limit = 20) {
  const ids = await deps.db.pendingAnswers(limit);
  const results: Record<string, number> = {};
  for (const id of ids) {
    const r = await sendAnswer(deps, id);
    results[r.status] = (results[r.status] ?? 0) + 1;
  }
  return { processed: ids.length, results };
}

/** Resposta humana do painel ("Falar com responsável"). */
export async function sendHumanReply(deps: CoreDeps, handoffId: string, text: string, responderName: string) {
  const t = await deps.db.handoffTarget(handoffId);
  if (!t || !t.contact) return { status: "sem_contato" as const };
  const body = `*Resposta de ${responderName.slice(0, 60) || "responsável"}*\n${text.trim().slice(0, 3800)}`;
  return sendControlled(deps, { contact: t.contact, profileId: t.profile_id, kind: "humano", text: body, handoffId });
}
