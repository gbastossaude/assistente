import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import {
  CHECKLIST_STATUS_LABELS,
  CLOSED_STATUSES,
  EVENT_TYPE_LABELS,
  INSURER_QUOTE_STATUS_LABELS,
  INTERACTION_TYPE_LABELS,
  QUOTATION_STATUSES,
  QUOTATION_STATUS_LABELS,
  type QuotationStatus,
} from "@/lib/domain/constants";
import { addDays, diffDays, formatDateBR, formatDateTimeBR, todayISO } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/utils";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { assistantActions, companies, insurers, quotationInsurers, quotations, renewals, tasks } from "../db/schema";
import { listAgenda, localToUtc } from "../services/calendar";
import { getComparison } from "../services/insurers";
import { listTimeline } from "../services/interactions";
import { clientRequestItems, generateMessage } from "../services/messages";
import { listPendencies } from "../services/pendencies";
import { getQuotationDetail } from "../services/quotations";
import { globalSearch } from "../services/search";

export interface ToolResult {
  /** Texto pronto para exibir (modo local) — também enviado ao modelo. */
  text: string;
  data?: unknown;
  /** Ação proposta que exige confirmação explícita do usuário. */
  actionId?: string;
}

interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  jsonSchema: Record<string, unknown>;
  run: (input: z.infer<S>, user: CurrentUser) => Promise<ToolResult>;
}

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });

const OPEN = sql`${quotations.status} not in ('fechada_ganha','fechada_perdida','concluida','cancelada')`;
const companyName = sql<string>`coalesce(${companies.tradeName}, ${companies.legalName})`;

/** Localiza uma cotação por código (COT-AAAA-NNNN) ou nome da empresa; prefere as abertas. */
export async function findQuotation(ref: string) {
  const term = ref.trim();
  const code = term.match(/COT-\d{4}-\d{1,4}/i)?.[0];
  const rows = await db
    .select({ id: quotations.id, code: quotations.code, status: quotations.status, company: companyName })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(
      and(
        isNull(quotations.deletedAt),
        code ? ilike(quotations.code, code) : or(ilike(companies.legalName, `%${term}%`), ilike(companies.tradeName, `%${term}%`), ilike(companies.economicGroup, `%${term}%`)),
      ),
    )
    .orderBy(desc(quotations.lastActivityAt))
    .limit(10);
  const open = rows.filter((r) => !CLOSED_STATUSES.includes(r.status));
  return open.length ? open : rows;
}

async function resolveOne(ref: string): Promise<{ id: string; code: string } | ToolResult> {
  const found = await findQuotation(ref);
  if (found.length === 0) return { text: `Não encontrei cotação para “${ref}” no sistema.` };
  if (found.length > 1 && !found.every((f) => f.company === found[0].company)) {
    return { text: `Encontrei mais de uma cotação para “${ref}”. Especifique o código:\n${found.map((f) => `• ${f.code} — ${f.company} (${QUOTATION_STATUS_LABELS[f.status]})`).join("\n")}` };
  }
  return found[0];
}

const isResult = (x: unknown): x is ToolResult => typeof x === "object" && x !== null && "text" in x;

// ────────────────────────────── Ferramentas ──────────────────────────────

const buscar: ToolDef<z.ZodObject<{ termo: z.ZodString }>> = {
  name: "buscar",
  description: "Busca global no sistema: empresas, CNPJs, contatos, cotações, operadoras, protocolos, planos, documentos e tarefas.",
  schema: z.object({ termo: z.string().min(2) }),
  jsonSchema: obj({ termo: str("Texto a buscar (nome, CNPJ, código da cotação, protocolo…)") }),
  async run({ termo }) {
    const hits = await globalSearch(termo, 6);
    if (!hits.length) return { text: `Nada encontrado para “${termo}”.`, data: [] };
    return { text: hits.map((h) => `• [${h.kind}] ${h.title}${h.subtitle ? ` — ${h.subtitle}` : ""}`).join("\n"), data: hits };
  },
};

const resumoCotacao: ToolDef<z.ZodObject<{ cotacao: z.ZodString }>> = {
  name: "resumo_cotacao",
  description: "Resumo completo de uma cotação: status, completude, pendências, operadoras, propostas e próximos prazos. Use para 'resuma a cotação da empresa X' ou 'o que está pendente'.",
  schema: z.object({ cotacao: z.string().min(2) }),
  jsonSchema: obj({ cotacao: str("Código da cotação (COT-AAAA-NNNN) ou nome da empresa") }),
  async run({ cotacao }, user) {
    const r = await resolveOne(cotacao);
    if (isResult(r)) return r;
    const d = (await getQuotationDetail(r.id))!;
    const [qis, cmp, items, openTasks] = await Promise.all([
      db.select({ qi: quotationInsurers, name: insurers.name }).from(quotationInsurers).innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId)).where(eq(quotationInsurers.quotationId, r.id)),
      getComparison(r.id),
      clientRequestItems(r.id),
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.quotationId, r.id), isNull(tasks.deletedAt), inArray(tasks.status, ["a_fazer", "em_andamento", "aguardando_terceiro"])))
        .orderBy(asc(tasks.dueDate))
        .limit(5),
    ]);
    const q = d.q;
    const lines = [
      `**${q.code} — ${d.company.tradeName ?? d.company.legalName}** (${q.processType}, ${q.estimatedLives} vidas)`,
      `Status: ${QUOTATION_STATUS_LABELS[q.status]} · Completude: ${d.completeness.pct}% (${d.completeness.label}) · Prontidão: ${d.readiness.score}/100`,
      `Responsável: ${d.ownerName ?? "—"} · Data-alvo: ${formatDateBR(q.targetDate)} · Renovação: ${formatDateBR(q.renewalDate)}`,
      d.activeImport ? `Base de vidas: ${d.activeImport.totalRows} vidas (${d.activeImport.errorRows} com erro)` : "Base de vidas: não importada",
      items.length ? `Pendências para o cliente (${items.length}):\n${items.map((i) => `  • ${i}`).join("\n")}` : "Nenhuma pendência obrigatória com o cliente.",
      qis.length
        ? `Operadoras:\n${qis.map((x) => `  • ${x.name}: ${INSURER_QUOTE_STATUS_LABELS[x.qi.status]}${x.qi.protocol ? ` (protocolo ${x.qi.protocol})` : ""}${x.qi.nextFollowupAt ? ` — próximo follow-up ${formatDateBR(x.qi.nextFollowupAt)}` : ""}`).join("\n")}`
        : "Nenhuma operadora selecionada ainda.",
      cmp.proposals.length
        ? `Propostas:\n${cmp.proposals.map((p) => `  • ${p.insurerName} v${p.p.version}: ${formatMoney(p.totalMonthly)}/mês${p.variationPct !== null ? ` (${p.variationPct > 0 ? "+" : ""}${p.variationPct.toFixed(1)}% vs. atual)` : ""}, validade ${formatDateBR(p.p.validUntil)}${p.p.selectedForPresentation ? " ★" : ""}`).join("\n")}`
        : "Nenhuma proposta recebida.",
      openTasks.length ? `Próximas tarefas:\n${openTasks.map((t) => `  • ${t.title} (${formatDateBR(t.dueDate)})`).join("\n")}` : "Sem tarefas abertas.",
      q.readyOverrideReason ? `⚠ Liberada ao mercado com override: “${q.readyOverrideReason}”` : "",
    ].filter(Boolean);
    void user;
    return { text: lines.join("\n"), data: { quotationId: r.id, code: q.code } };
  },
};

const pendenciasTool: ToolDef<z.ZodObject<{ cotacao: z.ZodString }>> = {
  name: "pendencias",
  description: "Lista pendências abertas (cliente, operadora, documentos, base de vidas, internas). Informe a cotação/empresa ou deixe vazio para todas.",
  schema: z.object({ cotacao: z.string() }),
  jsonSchema: obj({ cotacao: str("Código/empresa, ou string vazia para todas") }),
  async run({ cotacao }) {
    let quotationId: string | null = null;
    if (cotacao.trim()) {
      const r = await resolveOne(cotacao);
      if (isResult(r)) return r;
      quotationId = r.id;
    }
    const rows = await listPendencies({ quotationId });
    if (!rows.length) return { text: "Nenhuma pendência aberta." };
    return {
      text: rows
        .slice(0, 40)
        .map((r) => `• [${r.p.category}] ${r.p.title}${r.quotationCode ? ` — ${r.companyName} ${r.quotationCode}` : ""}${r.p.dueDate ? ` (prazo ${formatDateBR(r.p.dueDate)})` : ""}`)
        .join("\n"),
      data: rows.length,
    };
  },
};

const listarCotacoes: ToolDef<z.ZodObject<{ status: z.ZodString; min_vidas: z.ZodNumber; sem_movimentacao_dias: z.ZodNumber; tipo: z.ZodString }>> = {
  name: "listar_cotacoes",
  description: "Lista cotações abertas com filtros. Use para 'cotações acima de 200 vidas em negociação', 'cotações sem retorno/movimentação há X dias'.",
  schema: z.object({ status: z.string(), min_vidas: z.number().int().min(0), sem_movimentacao_dias: z.number().int().min(0), tipo: z.string() }),
  jsonSchema: obj({
    status: str(`Status (um destes ou vazio): ${QUOTATION_STATUSES.join(", ")}`),
    min_vidas: int("Mínimo de vidas (0 = sem filtro)"),
    sem_movimentacao_dias: int("Somente sem movimentação há pelo menos N dias (0 = sem filtro)"),
    tipo: str("NEW, RENEW ou vazio"),
  }),
  async run({ status, min_vidas, sem_movimentacao_dias, tipo }) {
    const today = todayISO();
    const rows = await db
      .select({ q: quotations, company: companyName })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .where(
        and(
          isNull(quotations.deletedAt),
          (QUOTATION_STATUSES as readonly string[]).includes(status) ? eq(quotations.status, status as QuotationStatus) : OPEN,
          min_vidas ? sql`${quotations.estimatedLives} >= ${min_vidas}` : undefined,
          tipo === "NEW" || tipo === "RENEW" ? eq(quotations.processType, tipo) : undefined,
          sem_movimentacao_dias ? sql`${quotations.lastActivityAt} < now() - make_interval(days => ${sem_movimentacao_dias})` : undefined,
        ),
      )
      .orderBy(desc(quotations.estimatedLives));
    if (!rows.length) return { text: "Nenhuma cotação encontrada com esses critérios.", data: [] };
    return {
      text: rows
        .map((r) => `• ${r.q.code} — ${r.company}: ${r.q.estimatedLives} vidas, ${QUOTATION_STATUS_LABELS[r.q.status]}, última movimentação há ${diffDays(r.q.lastActivityAt.toISOString().slice(0, 10), today)} dia(s)`)
        .join("\n"),
      data: rows.map((r) => r.q.code),
    };
  },
};

const renovacoesTool: ToolDef<z.ZodObject<{ dias: z.ZodNumber; mes: z.ZodString }>> = {
  name: "renovacoes",
  description: "Renovações (aniversários de contrato) nos próximos N dias ou em um mês específico (AAAA-MM).",
  schema: z.object({ dias: z.number().int().min(0).max(730), mes: z.string() }),
  jsonSchema: obj({ dias: int("Janela em dias a partir de hoje (0 se usar mês)"), mes: str("Mês AAAA-MM ou vazio") }),
  async run({ dias, mes }) {
    const today = todayISO();
    const rows = await db
      .select({ r: renewals, company: companyName })
      .from(renewals)
      .innerJoin(companies, eq(companies.id, renewals.companyId))
      .where(
        and(
          isNull(renewals.deletedAt),
          sql`${renewals.status} not in ('renovada','migrada','perdida','cancelada')`,
          /^\d{4}-\d{2}$/.test(mes) ? sql`to_char(${renewals.anniversaryDate}, 'YYYY-MM') = ${mes}` : sql`${renewals.anniversaryDate} between ${today} and ${addDays(today, dias || 60)}`,
        ),
      )
      .orderBy(asc(renewals.anniversaryDate));
    if (!rows.length) return { text: "Nenhuma renovação no período." };
    return { text: rows.map((x) => `• ${x.company}: ${formatDateBR(x.r.anniversaryDate)} (em ${diffDays(today, x.r.anniversaryDate)} dias) — ${x.r.insurerName ?? "operadora não informada"}, ${x.r.lives ?? "?"} vidas`).join("\n") };
  },
};

async function insurersWithoutResponse(days: number) {
  return db
    .select({ qi: quotationInsurers, insurer: insurers.name, q: quotations, company: companyName })
    .from(quotationInsurers)
    .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
    .innerJoin(quotations, eq(quotations.id, quotationInsurers.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(
      and(
        isNull(quotations.deletedAt),
        OPEN,
        inArray(quotationInsurers.status, ["enviada", "recebida_operadora", "em_analise", "pendencia"]),
        sql`${quotationInsurers.sentAt} < now() - make_interval(days => ${days})`,
      ),
    )
    .orderBy(asc(quotationInsurers.sentAt));
}

const operadorasSemResposta: ToolDef<z.ZodObject<{ dias: z.ZodNumber; cotacao: z.ZodString }>> = {
  name: "operadoras_sem_resposta",
  description: "Operadoras que receberam a cotação há mais de N dias e ainda não retornaram proposta. Pode filtrar por cotação.",
  schema: z.object({ dias: z.number().int().min(0), cotacao: z.string() }),
  jsonSchema: obj({ dias: int("Dias desde o envio"), cotacao: str("Código/empresa ou vazio") }),
  async run({ dias, cotacao }) {
    let rows = await insurersWithoutResponse(dias);
    if (cotacao.trim()) {
      const r = await resolveOne(cotacao);
      if (isResult(r)) return r;
      rows = rows.filter((x) => x.q.id === r.id);
    }
    if (!rows.length) return { text: `Nenhuma operadora sem resposta há mais de ${dias} dia(s).` };
    return {
      text: rows.map((x) => `• ${x.insurer} — ${x.company} (${x.q.code}): enviada em ${formatDateBR(x.qi.sentAt)}, status ${INSURER_QUOTE_STATUS_LABELS[x.qi.status]}${x.qi.protocol ? `, protocolo ${x.qi.protocol}` : ""}`).join("\n"),
      data: rows.map((x) => x.qi.id),
    };
  },
};

const historico: ToolDef<z.ZodObject<{ cotacao: z.ZodString }>> = {
  name: "historico",
  description: "Histórico (timeline) da negociação de uma cotação/empresa: status, interações, documentos, propostas.",
  schema: z.object({ cotacao: z.string().min(2) }),
  jsonSchema: obj({ cotacao: str("Código da cotação ou nome da empresa") }),
  async run({ cotacao }) {
    const r = await resolveOne(cotacao);
    if (isResult(r)) return r;
    const rows = await listTimeline({ quotationId: r.id, limit: 40 });
    return { text: `Histórico de ${r.code}:\n${rows.map(({ i, userName }) => `• ${formatDateTimeBR(i.occurredAt)} — ${INTERACTION_TYPE_LABELS[i.type]}: ${i.description}${userName ? ` (${userName})` : ""}`).join("\n")}` };
  },
};

const agendaHoje: ToolDef<z.ZodObject<Record<string, never>>> = {
  name: "agenda_do_dia",
  description: "Compromissos e tarefas de hoje do usuário, com contexto das cotações envolvidas. Use para preparar resumo executivo de reuniões.",
  schema: z.object({}),
  jsonSchema: obj({}),
  async run(_, user) {
    const today = todayISO();
    const { events, tasks: ts } = await listAgenda(localToUtc(today, "00:00"), localToUtc(addDays(today, 1), "00:00"), { ownerId: user.id });
    const parts: string[] = [];
    for (const { e, companyName: cn, quotationCode } of events) {
      parts.push(`• ${e.allDay ? "Dia inteiro" : formatDateTimeBR(e.startsAt).slice(-5)} — ${e.title} (${EVENT_TYPE_LABELS[e.type]})${cn ? ` · ${cn}` : ""}${quotationCode ? ` ${quotationCode}` : ""}`);
      if (e.quotationId) {
        const s = await resumoCotacao.run({ cotacao: quotationCode! }, user);
        parts.push(s.text.split("\n").map((l) => `    ${l}`).join("\n"));
      }
    }
    for (const { t } of ts) parts.push(`• Tarefa: ${t.title}${t.scheduledTime ? ` às ${t.scheduledTime.slice(0, 5)}` : ""}`);
    return { text: parts.length ? parts.join("\n") : "Nenhum compromisso ou tarefa com data para hoje." };
  },
};

const gerarMensagem: ToolDef<z.ZodObject<{ cotacao: z.ZodString; modelo: z.ZodString; operadora: z.ZodString }>> = {
  name: "gerar_mensagem",
  description:
    "Gera texto de e-mail ou WhatsApp a partir das pendências reais (não envia). Modelos: cliente_solicitacao_inicial_email, cliente_solicitacao_inicial_whatsapp, cliente_cobranca_formal_email, cliente_cobranca_whatsapp, cliente_followup_cordial, cliente_followup_urgente, operadora_envio_inicial, operadora_cobranca_protocolo, operadora_cobranca_retorno, operadora_envio_complemento, operadora_revisao_comercial, operadora_agradecimento.",
  schema: z.object({ cotacao: z.string().min(2), modelo: z.string(), operadora: z.string() }),
  jsonSchema: obj({ cotacao: str("Código ou empresa"), modelo: str("Chave do modelo"), operadora: str("Nome da operadora (para modelos de operadora) ou vazio") }),
  async run({ cotacao, modelo, operadora }, user) {
    const r = await resolveOne(cotacao);
    if (isResult(r)) return r;
    let qiId: string | null = null;
    if (modelo.startsWith("operadora")) {
      const [qi] = await db
        .select({ id: quotationInsurers.id })
        .from(quotationInsurers)
        .innerJoin(insurers, eq(insurers.id, quotationInsurers.insurerId))
        .where(and(eq(quotationInsurers.quotationId, r.id), ilike(insurers.name, `%${operadora}%`)));
      if (!qi) return { text: `A operadora “${operadora}” não está nesta cotação.` };
      qiId = qi.id;
    }
    const m = await generateMessage({ quotationId: r.id, templateKey: modelo, quotationInsurerId: qiId }, user.name);
    return {
      text: `${m.subject ? `Assunto: ${m.subject}\n\n` : ""}${m.body}${m.missing.length ? `\n\n(Dados ausentes no sistema: ${m.missing.join(", ")} — complete antes de enviar. A mensagem NÃO foi enviada.)` : "\n\n(A mensagem não foi enviada — copie e envie pelo seu canal.)"}`,
    };
  },
};

const proporTarefasOperadoras: ToolDef<z.ZodObject<{ dias: z.ZodNumber; prazo_dias: z.ZodNumber }>> = {
  name: "propor_tarefas_operadoras_sem_resposta",
  description:
    "PROPÕE (não executa) a criação de tarefas de cobrança para cada operadora sem resposta há mais de N dias. Retorna a lista exata de registros; o usuário precisa confirmar na interface.",
  schema: z.object({ dias: z.number().int().min(0), prazo_dias: z.number().int().min(0).max(30) }),
  jsonSchema: obj({ dias: int("Dias sem resposta desde o envio"), prazo_dias: int("Prazo da tarefa em dias a partir de hoje (0 = hoje)") }),
  async run({ dias, prazo_dias }, user) {
    if (!can(user.role, "task:write")) return { text: "Seu perfil não permite criar tarefas." };
    const rows = await insurersWithoutResponse(dias);
    if (!rows.length) return { text: `Nenhuma operadora sem resposta há mais de ${dias} dia(s) — nenhuma tarefa a criar.` };
    const due = addDays(todayISO(), prazo_dias);
    const items = rows.map((x) => ({
      title: `Cobrar retorno ${x.insurer} — ${x.q.code} (${x.company})`,
      quotationId: x.q.id,
      companyId: x.q.companyId,
      insurerId: x.qi.insurerId,
      quotationInsurerId: x.qi.id,
      dueDate: due,
      ownerId: x.q.ownerId,
    }));
    const [a] = await db
      .insert(assistantActions)
      .values({ userId: user.id, kind: "create_tasks", description: `Criar ${items.length} tarefa(s) de cobrança para operadoras sem resposta há mais de ${dias} dia(s), prazo ${formatDateBR(due)}`, payload: { items } })
      .returning();
    return { text: `Ação proposta (aguardando sua confirmação): criar ${items.length} tarefa(s):\n${items.map((i) => `• ${i.title} — prazo ${formatDateBR(i.dueDate)}`).join("\n")}`, actionId: a.id };
  },
};

export const TOOLS = [buscar, resumoCotacao, pendenciasTool, listarCotacoes, renovacoesTool, operadorasSemResposta, historico, agendaHoje, gerarMensagem, proporTarefasOperadoras] as ToolDef<z.ZodTypeAny>[];

export async function runTool(name: string, input: unknown, user: CurrentUser): Promise<ToolResult> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { text: `Ferramenta desconhecida: ${name}` };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) return { text: `Parâmetros inválidos para ${name}: ${parsed.error.issues[0]?.message}` };
  return t.run(parsed.data, user);
}
