import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { suggestCampaign } from "@/lib/domain/campaigns";
import {
  LEAD_SOURCE_LABELS,
  OPEN_STAGES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABELS,
  PRODUCTS,
  PRODUCT_LABELS,
  type LeadSource,
  type OpportunityStage,
  type Product,
} from "@/lib/domain/commercial";
import { SCOPED_ROLES } from "@/lib/domain/constants";
import { documentChecklist, followupState, opportunityFollowupMessage, suggestNextSteps } from "@/lib/domain/crm";
import { addDays, formatDateBR, formatDateTimeBR, isValidISODate, todayISO } from "@/lib/domain/dates";
import { buildEditorialCalendar, defaultEditorialStart, EDITORIAL_PLATFORMS, editorialMarkdown, POSTING_FREQUENCIES, suggestImportantDates, type EditorialPlatform, type PostingFrequency } from "@/lib/domain/editorial-calendar";
import { fillVariables } from "@/lib/domain/library";
import { buildMeetingOutputs, DEFAULT_MEETING_QUESTIONS } from "@/lib/domain/meetings";
import { formatMoney, formatPct } from "@/lib/utils";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { assistantActions, calendarEvents, libraryItems, meetings, opportunities, tasks, users } from "../db/schema";
import { getScope, ownerCond } from "../scope";
import { localToUtc } from "../services/calendar";
import { getCommercialOverview } from "../services/commercial";
import { getCommercialReports } from "../services/commercial-reports";
import { findMeetings } from "../services/meetings";
import { findOpportunities } from "../services/opportunities";
import { int, obj, str, type ToolDef, type ToolResult } from "./tool-kit";

const consultantName = (u: CurrentUser) => u.name.replace(/\s*\(.*\)$/, "");

async function oneOpportunity(term: string, user: CurrentUser): Promise<{ o: typeof opportunities.$inferSelect; brokerName: string | null } | ToolResult> {
  const found = await findOpportunities(term, await getScope(user), 5);
  if (!found.length) return { text: `Não encontrei oportunidade para “${term}” na sua carteira. Cadastre em /crm ou informe o nome como está no CRM.` };
  const exact = found.filter((f) => f.o.clientName.toLowerCase() === term.trim().toLowerCase());
  if (exact.length === 1) return exact[0];
  if (found.length > 1) return { text: `Encontrei mais de uma oportunidade para “${term}”:\n${found.map((f) => `• ${f.o.clientName} — ${OPPORTUNITY_STAGE_LABELS[f.o.stage]}${f.brokerName ? ` (${f.brokerName})` : ""}`).join("\n")}\nQual delas?` };
  return found[0];
}
const isResult = (x: unknown): x is ToolResult => typeof x === "object" && x !== null && "text" in x;

const listarOportunidades: ToolDef<z.ZodObject<{ etapa: z.ZodString; followup: z.ZodString; produto: z.ZodString }>> = {
  name: "listar_oportunidades",
  description:
    "Lista oportunidades do CRM (vendas/leads) da carteira do usuário. Filtros: etapa (lead_novo, primeiro_contato, diagnostico, documentos_pendentes, cotacao_em_andamento, proposta_enviada, em_negociacao, aprovado, fechado, implantado, perdido ou vazio), followup ('atrasado', 'hoje', 'sem_data' ou vazio) e produto (plano_saude, dental, vida, seguro, consorcio, beneficios ou vazio). Use para 'mostrar vendas com follow-up atrasado'.",
  schema: z.object({ etapa: z.string(), followup: z.string(), produto: z.string() }),
  jsonSchema: obj({ etapa: str("Etapa do pipeline ou vazio"), followup: str("atrasado | hoje | sem_data | vazio"), produto: str("Produto ou vazio") }),
  scopeSafe: true,
  async run({ etapa, followup, produto }, user) {
    const today = todayISO();
    const scope = await getScope(user);
    const conds = [isNull(opportunities.deletedAt), ownerCond(scope, opportunities.brokerId)];
    if ((OPPORTUNITY_STAGES as readonly string[]).includes(etapa)) conds.push(eq(opportunities.stage, etapa as OpportunityStage));
    else conds.push(inArray(opportunities.stage, OPEN_STAGES));
    if ((PRODUCTS as readonly string[]).includes(produto)) conds.push(eq(opportunities.product, produto as Product));
    if (followup === "atrasado") conds.push(lt(opportunities.nextFollowupAt, today));
    if (followup === "hoje") conds.push(eq(opportunities.nextFollowupAt, today));
    if (followup === "sem_data") conds.push(isNull(opportunities.nextFollowupAt));
    const rows = await db
      .select({ o: opportunities, brokerName: users.name })
      .from(opportunities)
      .leftJoin(users, eq(users.id, opportunities.brokerId))
      .where(and(...conds))
      .orderBy(asc(sql`coalesce(${opportunities.nextFollowupAt}, '2999-12-31')`))
      .limit(40);
    if (!rows.length) return { text: followup === "atrasado" ? "Nenhuma venda com follow-up atrasado. 👏" : "Nenhuma oportunidade encontrada com esses filtros.", data: [] };
    const head = followup === "atrasado" ? `Vendas com follow-up atrasado (${rows.length}):` : `Oportunidades (${rows.length}):`;
    return {
      text: `${head}\n${rows
        .map(
          ({ o, brokerName }) =>
            `• ${o.clientName} — ${OPPORTUNITY_STAGE_LABELS[o.stage]} · ${PRODUCT_LABELS[o.product]}${o.estimatedValue ? ` · ${formatMoney(o.estimatedValue)}/mês` : ""}${o.nextFollowupAt ? ` · follow-up ${formatDateBR(o.nextFollowupAt)}${followupState(o.nextFollowupAt, today) === "atrasado" ? " (ATRASADO)" : ""}` : " · sem follow-up"}${brokerName ? ` · ${brokerName}` : ""}${o.nextStep ? `\n    → ${o.nextStep}` : ""}`,
        )
        .join("\n")}\n\nAbra em /crm para atualizar.`,
      data: rows.map((r) => r.o.id),
    };
  },
};

const resumoOportunidade: ToolDef<z.ZodObject<{ cliente: z.ZodString }>> = {
  name: "resumo_oportunidade",
  description: "Resumo de uma oportunidade do CRM (cliente/lead): etapa, produto, valores, histórico recente e PRÓXIMOS PASSOS sugeridos. Use para 'sugira os próximos passos para o cliente X'.",
  schema: z.object({ cliente: z.string().min(2) }),
  jsonSchema: obj({ cliente: str("Nome do cliente/empresa como está no CRM") }),
  scopeSafe: true,
  async run({ cliente }, user) {
    const r = await oneOpportunity(cliente, user);
    if (isResult(r)) return r;
    const { o, brokerName } = r;
    const today = todayISO();
    const steps = suggestNextSteps(o, today);
    return {
      text: [
        `**${o.clientName}** — ${OPPORTUNITY_STAGE_LABELS[o.stage]} · ${PRODUCT_LABELS[o.product]}`,
        `Vidas: ${o.lives ?? "—"} · Valor estimado: ${o.estimatedValue ? `${formatMoney(o.estimatedValue)}/mês` : "—"} · Operadora atual: ${o.currentInsurer ?? "—"}${o.quotedInsurers.length ? ` · Cotadas: ${o.quotedInsurers.join(", ")}` : ""}`,
        `Corretor: ${brokerName ?? "—"} · Origem: ${LEAD_SOURCE_LABELS[o.source as LeadSource] ?? o.source} · Próximo follow-up: ${o.nextFollowupAt ? formatDateBR(o.nextFollowupAt) : "não definido"}`,
        `\nPróximos passos sugeridos:\n${steps.map((s) => `  • ${s}`).join("\n")}`,
        `\n(Abrir: /crm/${o.id})`,
      ].join("\n"),
      data: { opportunityId: o.id },
    };
  },
};

const mensagemFollowup: ToolDef<z.ZodObject<{ cliente: z.ZodString }>> = {
  name: "mensagem_followup_cliente",
  description: "Gera mensagem de follow-up (WhatsApp) para um cliente do CRM, adequada à etapa da negociação. NÃO envia — o usuário copia e envia.",
  schema: z.object({ cliente: z.string().min(2) }),
  jsonSchema: obj({ cliente: str("Nome do cliente/empresa no CRM") }),
  scopeSafe: true,
  async run({ cliente }, user) {
    const r = await oneOpportunity(cliente, user);
    if (isResult(r)) return r;
    const msg = opportunityFollowupMessage(r.o, consultantName(user));
    return { text: `${msg}\n\n(Mensagem gerada para a etapa “${OPPORTUNITY_STAGE_LABELS[r.o.stage]}”. Não foi enviada — copie e envie pelo WhatsApp.)` };
  },
};

const resumirReuniao: ToolDef<z.ZodObject<{ reuniao: z.ZodString }>> = {
  name: "resumir_reuniao",
  description: "Resume uma reunião registrada (ata, pendências e próximos passos) a partir da ficha de reunião. Informe o cliente/título ou vazio para a reunião mais recente.",
  schema: z.object({ reuniao: z.string() }),
  jsonSchema: obj({ reuniao: str("Cliente, empresa ou título da reunião; vazio = mais recente") }),
  scopeSafe: true,
  async run({ reuniao }, user) {
    const scope = await getScope(user);
    const [m] = reuniao.trim()
      ? await findMeetings(reuniao, scope, 1)
      : await db
          .select()
          .from(meetings)
          .where(and(isNull(meetings.deletedAt), ownerCond(scope, meetings.ownerId), sql`${meetings.date} <= ${todayISO()}`))
          .orderBy(desc(meetings.date))
          .limit(1);
    if (!m) return { text: reuniao ? `Não encontrei reunião para “${reuniao}”.` : "Nenhuma reunião registrada ainda. Crie em /reunioes/nova." };
    const out = buildMeetingOutputs(m, { consultant: consultantName(user), today: todayISO() });
    return { text: `${out.minutes}\n\n(Ficha: /reunioes/${m.id} — use “Finalizar: ata + tarefa de retorno” para registrar a ata e criar a tarefa.)`, data: { meetingId: m.id } };
  },
};

const roteiroReuniao: ToolDef<z.ZodObject<{ cliente: z.ZodString }>> = {
  name: "roteiro_reuniao",
  description: "Cria um roteiro de reunião de diagnóstico para um cliente: objetivo, perguntas (omitindo o que já se sabe pelo CRM), documentos a pedir e fechamento.",
  schema: z.object({ cliente: z.string() }),
  jsonSchema: obj({ cliente: str("Nome do cliente/empresa (ou vazio para roteiro genérico)") }),
  scopeSafe: true,
  async run({ cliente }, user) {
    const r = cliente.trim() ? await oneOpportunity(cliente, user) : null;
    const o = r && !isResult(r) ? r.o : null;
    const known = new Set<string>();
    if (o?.currentInsurer) known.add("operadora_atual");
    if (o?.lives) known.add("vidas");
    if (o?.estimatedValue) known.add("valor_atual");
    const qs = DEFAULT_MEETING_QUESTIONS.filter((q) => !known.has(q.key));
    const who = o ? o.clientName : cliente.trim() || "o cliente";
    const lines = [
      `ROTEIRO DE REUNIÃO — ${who}`,
      `\n1) Abertura (2 min): agradecer, confirmar o tempo disponível e o objetivo — entender a situação atual e o que é prioridade (custo, rede ou ambos).`,
      o ? `   Contexto do CRM: ${PRODUCT_LABELS[o.product]}${o.lives ? ` · ${o.lives} vidas` : ""}${o.currentInsurer ? ` · operadora atual ${o.currentInsurer}` : ""} · etapa ${OPPORTUNITY_STAGE_LABELS[o.stage]}.` : "",
      `\n2) Diagnóstico (15–20 min) — perguntas:`,
      ...qs.map((q, i) => `   ${i + 1}. ${q.text}`),
      `\n3) Implicação: “O que acontece se o reajuste vier alto de novo / se a rede continuar como está?”`,
      `\n4) Próximos passos: combinar documentos e prazo de retorno. Documentos:`,
      ...documentChecklist(o?.product ?? "plano_saude", o?.lives ?? null).map((d) => `   • ${d}`),
      `\n5) Fechamento: confirmar decisor, data da apresentação e canal de contato.`,
      `\nRegistre as respostas na ficha /reunioes/nova${o ? `?oportunidade=${o.id}` : ""} — a ata e o follow-up saem automaticamente.`,
    ].filter(Boolean);
    return { text: lines.join("\n") };
  },
};

const checklistDocumentos: ToolDef<z.ZodObject<{ cliente: z.ZodString; produto: z.ZodString; vidas: z.ZodNumber; mensagem: z.ZodBoolean }>> = {
  name: "checklist_documentos",
  description: "Checklist de documentos para cotação conforme produto e porte; com mensagem=true gera também o WhatsApp pedindo os documentos (modelo da biblioteca). Para cotações +99 já abertas, prefira gerar_mensagem.",
  schema: z.object({ cliente: z.string(), produto: z.string(), vidas: z.number().int().min(0), mensagem: z.boolean() }),
  jsonSchema: obj({ cliente: str("Cliente no CRM (ou vazio)"), produto: str("plano_saude, dental, vida, seguro, consorcio, beneficios ou vazio"), vidas: int("Quantidade de vidas (0 se desconhecida)"), mensagem: { type: "boolean", description: "Gerar também a mensagem de WhatsApp pedindo os documentos" } }),
  scopeSafe: true,
  async run({ cliente, produto, vidas, mensagem }, user) {
    let product: Product = (PRODUCTS as readonly string[]).includes(produto) ? (produto as Product) : "plano_saude";
    let lives: number | null = vidas || null;
    let name = cliente.trim();
    let contact = "";
    if (name) {
      const r = await oneOpportunity(name, user);
      if (!isResult(r)) {
        product = (PRODUCTS as readonly string[]).includes(produto) ? product : r.o.product;
        lives = lives ?? r.o.lives;
        name = r.o.clientName;
        contact = r.o.contactName ?? "";
      }
    }
    const docs = documentChecklist(product, lives);
    const list = docs.map((d) => `• ${d}`).join("\n");
    let text = `Checklist de documentos — ${PRODUCT_LABELS[product]}${lives ? ` (${lives} vidas)` : ""}${name ? ` · ${name}` : ""}:\n${list}\n\n(Ponto de partida — confirme com a operadora escolhida.)`;
    if (mensagem) {
      const [tpl] = await db.select().from(libraryItems).where(and(eq(libraryItems.sourceKey, "msg_pedido_documentos"), isNull(libraryItems.deletedAt)));
      const body = tpl?.body ?? "{{cliente}}, para cotarmos o plano da {{empresa}}, preciso dos documentos abaixo:\n{{documentos}}\nPode me enviar por aqui mesmo?";
      const filled = fillVariables(body, { cliente: contact.split(" ")[0] || "", empresa: name, documentos: list, consultor: consultantName(user) });
      text += `\n\nMensagem (WhatsApp):\n${filled.text}${filled.missing.length ? `\n\n(Complete: ${filled.missing.join(", ")}. Não foi enviada.)` : "\n\n(Não foi enviada — copie e envie.)"}`;
    }
    return { text };
  },
};

const proporCampanha: ToolDef<z.ZodObject<{ produto: z.ZodString; mes: z.ZodString; foco: z.ZodString }>> = {
  name: "propor_campanha",
  description: "PROPÕE (não cria) uma campanha comercial para o mês: nome, período, público, metas, canais e mensagem principal. O usuário confirma na interface para criar em /campanhas.",
  schema: z.object({ produto: z.string(), mes: z.string(), foco: z.string() }),
  jsonSchema: obj({ produto: str("plano_saude, dental, vida, seguro, consorcio, beneficios"), mes: str("Mês AAAA-MM (vazio = mês atual)"), foco: str("empresarial | pme | pf") }),
  async run({ produto, mes, foco }, user) {
    if (!can(user.role, "campaign:write")) return { text: "Seu perfil não permite criar campanhas. Peça ao seu gestor." };
    const month = /^\d{4}-\d{2}$/.test(mes) ? mes : todayISO().slice(0, 7);
    const product = (PRODUCTS as readonly string[]).includes(produto) ? (produto as Product) : "plano_saude";
    const f = foco === "pme" || foco === "pf" ? foco : "empresarial";
    const c = suggestCampaign(product, month, f);
    const { channelsLabel, ...payload } = c;
    const [a] = await db
      .insert(assistantActions)
      .values({ userId: user.id, kind: "create_campaign", description: `Criar campanha “${c.name}” (${formatDateBR(c.startDate)} a ${formatDateBR(c.endDate)})`, payload: { campaign: payload } })
      .returning();
    return {
      text: [
        `Campanha sugerida (aguardando sua confirmação):`,
        `• Nome: ${c.name}`,
        `• Período: ${formatDateBR(c.startDate)} a ${formatDateBR(c.endDate)}`,
        `• Público-alvo: ${c.audience}`,
        `• Metas: ${c.goalLeads} leads e ${c.goalSales} vendas`,
        `• Canais: ${channelsLabel}`,
        `• Mensagem principal: ${c.mainMessage}`,
        `Ao confirmar, ela é criada como “planejada” com lembretes automáticos (início, meio, últimos dias e resultado).`,
      ].join("\n"),
      actionId: a.id,
    };
  },
};

async function dailyText(user: CurrentUser, days: number) {
  const scope = await getScope(user);
  const today = todayISO();
  const ov = await getCommercialOverview(SCOPED_ROLES.includes(user.role) ? scope : { all: false, ownerIds: [user.id] }, today);
  const end = addDays(today, days);
  const [evts, due] = await Promise.all([
    db
      .select()
      .from(calendarEvents)
      .where(and(isNull(calendarEvents.deletedAt), eq(calendarEvents.ownerId, user.id), sql`${calendarEvents.status} <> 'cancelado'`, gte(calendarEvents.startsAt, localToUtc(today, "00:00")), lt(calendarEvents.startsAt, localToUtc(end, "00:00"))))
      .orderBy(asc(calendarEvents.startsAt)),
    db
      .select()
      .from(tasks)
      .where(and(isNull(tasks.deletedAt), eq(tasks.ownerId, user.id), inArray(tasks.status, ["a_fazer", "em_andamento", "aguardando_terceiro"]), sql`coalesce(${tasks.dueDate}, ${tasks.scheduledDate}) < ${end}`))
      .orderBy(asc(sql`coalesce(${tasks.dueDate}, ${tasks.scheduledDate})`))
      .limit(25),
  ]);
  const k = ov.kpis;
  return [
    `Compromissos (${evts.length}):${evts.length ? "" : " nenhum"}`,
    ...evts.map((e) => `  • ${e.allDay ? formatDateBR(e.startsAt) : formatDateTimeBR(e.startsAt)} — ${e.title}${e.clientName ? ` (${e.clientName})` : ""}`),
    `Tarefas a fazer (${due.length}):${due.length ? "" : " nenhuma"}`,
    ...due.map((t) => `  • ${t.title}${t.dueDate ? ` — prazo ${formatDateBR(t.dueDate)}${t.dueDate < today ? " (ATRASADA)" : ""}` : ""}`),
    `Follow-ups de vendas atrasados (${ov.overdueFollowups.length}):${ov.overdueFollowups.length ? "" : " nenhum"}`,
    ...ov.overdueFollowups.slice(0, 10).map(({ o }) => `  • ${o.clientName} — desde ${formatDateBR(o.nextFollowupAt)}${o.nextStep ? ` → ${o.nextStep}` : ""}`),
    `Indicadores: ${k.totalLeads} leads · ${k.proposalsSent} proposta(s) enviada(s) · ${k.salesClosedMonth} venda(s) no mês (${formatMoney(k.salesValueMonth)}/mês) · em negociação ${formatMoney(k.negotiationValue)} · conversão ${k.conversionRate === null ? "—" : formatPct(k.conversionRate)}`,
    ov.activeCampaigns.length ? `Campanhas ativas: ${ov.activeCampaigns.map(({ c, leads }) => `${c.name} (${leads} lead(s), até ${formatDateBR(c.endDate)})`).join("; ")}` : "Nenhuma campanha ativa.",
    ov.alerts.length ? `Alertas: ${ov.alerts.map((a) => a.text).join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const resumoDiario: ToolDef<z.ZodObject<Record<string, never>>> = {
  name: "resumo_diario",
  description: "Resumo do dia do usuário: compromissos, tarefas, follow-ups de vendas atrasados, indicadores comerciais, campanhas e alertas.",
  schema: z.object({}),
  jsonSchema: obj({}),
  scopeSafe: true,
  async run(_, user) {
    return { text: `RESUMO DO DIA — ${formatDateBR(todayISO())}\n${await dailyText(user, 1)}` };
  },
};

const resumoSemanal: ToolDef<z.ZodObject<Record<string, never>>> = {
  name: "resumo_semanal",
  description: "Resumo dos próximos 7 dias e da semana comercial: agenda, tarefas, follow-ups, vendas fechadas e indicadores.",
  schema: z.object({}),
  jsonSchema: obj({}),
  scopeSafe: true,
  async run(_, user) {
    const scope = await getScope(user);
    const today = todayISO();
    const rep = await getCommercialReports({ from: addDays(today, -7), to: today }, scope);
    return {
      text: `RESUMO SEMANAL — ${formatDateBR(addDays(today, -7))} a ${formatDateBR(addDays(today, 7))}\nÚltimos 7 dias: ${rep.totals.sales} venda(s) (${formatMoney(rep.totals.value)}/mês) · ${rep.totals.meetingsHeld} reunião(ões) realizada(s) · ${rep.totals.noFollowup} cliente(s) sem follow-up em dia\n\nPróximos 7 dias:\n${await dailyText(user, 7)}`,
    };
  },
};

const relatorioVendas: ToolDef<z.ZodObject<{ de: z.ZodString; ate: z.ZodString }>> = {
  name: "relatorio_vendas",
  description: "Relatório de vendas (CRM) no período: total, valor, ticket médio, conversão, por corretor, por produto e por origem. Datas AAAA-MM-DD (vazias = últimos 30 dias).",
  schema: z.object({ de: z.string(), ate: z.string() }),
  jsonSchema: obj({ de: str("Início AAAA-MM-DD ou vazio"), ate: str("Fim AAAA-MM-DD ou vazio") }),
  scopeSafe: true,
  async run({ de, ate }, user) {
    const today = todayISO();
    const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    const r = await getCommercialReports({ from: valid(de) ? de : addDays(today, -30), to: valid(ate) ? ate : today }, await getScope(user));
    return {
      text: [
        `RELATÓRIO DE VENDAS — ${formatDateBR(r.period.from)} a ${formatDateBR(r.period.to)}`,
        `Vendas: ${r.totals.sales} · Valor: ${formatMoney(r.totals.value)}/mês · Ticket médio: ${formatMoney(r.totals.ticket)} · Conversão: ${r.totals.conversion === null ? "—" : formatPct(r.totals.conversion)}`,
        r.salesByBroker.length ? `Por corretor:\n${r.salesByBroker.map((x) => `  • ${x.broker}: ${x.n} (${formatMoney(x.value)})`).join("\n")}` : "Nenhuma venda no período.",
        r.salesByProduct.length ? `Por produto:\n${r.salesByProduct.map((x) => `  • ${PRODUCT_LABELS[x.product]}: ${x.n} (${formatMoney(x.value)})`).join("\n")}` : "",
        r.bySource.length ? `Leads por origem:\n${r.bySource.map((x) => `  • ${LEAD_SOURCE_LABELS[x.source as LeadSource] ?? x.source}: ${x.n}`).join("\n")}` : "",
        r.lostReasons.length ? `Motivos de perda: ${r.lostReasons.map((x) => `${x.reason} (${x.n})`).join(", ")}` : "",
        `Detalhes e exportação CSV/PDF em /relatorios.`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
};

const calendarioEditorial: ToolDef<z.ZodObject<{ mes: z.ZodString; plataforma: z.ZodString; frequencia: z.ZodString; semana_lancamento: z.ZodNumber; produto: z.ZodString; publico: z.ZodString }>> = {
  name: "calendario_editorial",
  description:
    "Gera um calendário editorial de 30 dias para redes sociais (planos de saúde): dia, dia da semana, pilar (50% educativo, 20% conexão, 15% venda, 15% engajamento), formato, tema, resumo da legenda e CTA, mais resumo semanal, 5 ideias de Stories, 3 de Reels e dicas de horário. mes AAAA-MM (vazio = próximo mês); plataforma instagram | linkedin | tiktok | facebook | youtube; frequencia diaria | 5x_semana | 3x_semana; semana_lancamento 0 a 4 (0 = sem lançamento).",
  schema: z.object({ mes: z.string(), plataforma: z.string(), frequencia: z.string(), semana_lancamento: z.number().int(), produto: z.string(), publico: z.string() }),
  jsonSchema: obj({
    mes: str("Mês AAAA-MM ou vazio"),
    plataforma: str("instagram | linkedin | tiktok | facebook | youtube"),
    frequencia: str("diaria | 5x_semana | 3x_semana"),
    semana_lancamento: int("Semana do lançamento (1 a 4) ou 0"),
    produto: str("Produto/serviço dos posts de venda ou vazio"),
    publico: str("Público-alvo ou vazio"),
  }),
  scopeSafe: true,
  async run({ mes, plataforma, frequencia, semana_lancamento, produto, publico }) {
    const startDate = isValidISODate(`${mes}-01`) ? `${mes}-01` : defaultEditorialStart(todayISO());
    const platform: EditorialPlatform = (EDITORIAL_PLATFORMS as readonly string[]).includes(plataforma) ? (plataforma as EditorialPlatform) : "instagram";
    const niche = "Planos de saúde (corretora)";
    const cal = buildEditorialCalendar({
      startDate,
      niche,
      platform,
      audience: publico.trim() || "Sócios, RH e gestores de empresas e famílias que querem pagar menos sem perder rede",
      frequency: (POSTING_FREQUENCIES as readonly string[]).includes(frequencia) ? (frequencia as PostingFrequency) : "5x_semana",
      pillars: null,
      objectives: null,
      product: produto.trim() || null,
      launchWeek: semana_lancamento >= 1 && semana_lancamento <= 4 ? semana_lancamento : 0,
      importantDates: suggestImportantDates(startDate, niche),
    });
    return { text: `${editorialMarkdown(cal, platform)}\n\nPersonalize nicho, objetivos e datas e exporte em CSV em /calendario-editorial.` };
  },
};

export const COMMERCIAL_TOOLS = [listarOportunidades, resumoOportunidade, mensagemFollowup, resumirReuniao, roteiroReuniao, checklistDocumentos, proporCampanha, resumoDiario, resumoSemanal, relatorioVendas, calendarioEditorial] as ToolDef<z.ZodTypeAny>[];

