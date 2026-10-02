import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { activityLogs, calendarEvents, campaigns, interactions, meetings, notifications, opportunities, opportunityStageHistory, tasks, users } from "@/server/db/schema";
import { campaignSchema, companySchema, libraryItemSchema, meetingSchema, opportunitySchema, quotationStep1Schema, taskSchema } from "@/lib/validation/schemas";
import { defaultQuestions } from "@/lib/domain/meetings";
import { addDays, todayISO } from "@/lib/domain/dates";
import type { CurrentUser } from "@/server/auth";
import { guardCompany, guardQuotation, guardTask } from "@/server/access";
import { getScope } from "@/server/scope";
import { askAssistant, decideAction } from "@/server/assistant";
import { runSweep } from "@/server/automation/engine";
import { campaignOptions, getCampaign, runCampaignReminders, saveCampaign } from "@/server/services/campaigns";
import { getCommercialOverview } from "@/server/services/commercial";
import { getCommercialReports } from "@/server/services/commercial-reports";
import { createCompany, listCompanies } from "@/server/services/companies";
import { anonymizeSubject, findDataSubject } from "@/server/services/lgpd";
import { duplicateLibraryItem, listLibrary, restoreLibraryDefault, saveLibraryItem } from "@/server/services/library";
import { generateMeetingOutputs, getMeeting, listMeetings, saveMeeting } from "@/server/services/meetings";
import { changeOpportunityStage, createOpportunity, getOpportunity, listOpportunities, updateOpportunity } from "@/server/services/opportunities";
import { createQuotation, listQuotations } from "@/server/services/quotations";
import { getQuotationGaps } from "@/server/services/quotation-gaps";
import { globalSearch } from "@/server/services/search";
import { createTask } from "@/server/services/tasks";
import { hasTestDb, makeUser, resetTestDb } from "../helpers/db";

const T = todayISO();

describe.skipIf(!hasTestDb)("módulo comercial: CRM, reuniões, campanhas, biblioteca, hierarquia e LGPD (integração)", () => {
  let head: CurrentUser;
  let supervisor: CurrentUser;
  let bruna: CurrentUser;
  let diego: CurrentUser;
  let outsider: CurrentUser;
  let oppId: string;
  let campaignId: string;

  beforeAll(async () => {
    await resetTestDb();
    head = await makeUser("head", "Head Teste");
    supervisor = await makeUser("supervisor", "Supervisor Teste");
    bruna = await makeUser("corretor", "Bruna Corretora");
    diego = await makeUser("corretor", "Diego Corretor");
    outsider = await makeUser("corretor", "Corretor de Outra Equipe");
    await db.update(users).set({ supervisorId: supervisor.id }).where(eq(users.id, bruna.id));
    await db.update(users).set({ supervisorId: supervisor.id }).where(eq(users.id, diego.id));
  });

  it("bootstrap carrega mensagens prontas e respostas rápidas com variáveis e aviso", async () => {
    const msgs = await listLibrary("mensagem");
    const answers = await listLibrary("resposta");
    expect(msgs.length).toBeGreaterThanOrEqual(22);
    expect(answers.length).toBeGreaterThanOrEqual(16);
    expect(msgs.some((m) => m.body.includes("{{cliente}}"))).toBe(true);
    expect(answers.every((a) => a.body.includes("variar conforme operadora"))).toBe(true);
    expect((await listLibrary("resposta", { q: "carencia" })).length).toBeGreaterThan(0);
  });

  it("biblioteca: criar, editar, duplicar e restaurar original", async () => {
    const id = await saveLibraryItem(null, libraryItemSchema.parse({ kind: "mensagem", category: "fechamento", title: "Minha mensagem", channel: "whatsapp", body: "Olá {{cliente}}!" }), head);
    const copy = await duplicateLibraryItem(id, head);
    expect((await listLibrary("mensagem", { q: "Minha mensagem (cópia)" })).map((x) => x.id)).toContain(copy);
    const [def] = await listLibrary("resposta", { q: "portabilidade de carencias" });
    await saveLibraryItem(def.id, libraryItemSchema.parse({ kind: "resposta", category: def.category, title: def.title, channel: "geral", body: "editado" }), head);
    await restoreLibraryDefault(def.id, head);
    const [back] = await listLibrary("resposta", { q: "portabilidade de carencias" });
    expect(back.body).not.toBe("editado");
    await expect(saveLibraryItem(null, libraryItemSchema.parse({ kind: "resposta", category: "carencia", title: "x", body: "y" }), head)).resolves.toBeTruthy();
    expect(() => libraryItemSchema.parse({ kind: "resposta", category: "fechamento", title: "x", body: "y" })).toThrow();
  });

  it("campanha do mês e oportunidade vinculada; corretor só cria na própria carteira", async () => {
    campaignId = await saveCampaign(null, campaignSchema.parse({ name: "Campanha Teste", product: "plano_saude", startDate: `${T.slice(0, 7)}-01`, endDate: addDays(T, 10), goalLeads: 5, channels: ["whatsapp"], status: "planejada" }), head);
    expect((await campaignOptions()).map((c) => c.id)).toContain(campaignId);
    const o = await createOpportunity(opportunitySchema.parse({ clientName: "Cliente Alfa", contactName: "Maria Souza", phone: "11999990000", product: "plano_saude", lives: 50, estimatedValue: "40.000,00", source: "campanha", campaignId, brokerId: diego.id, nextFollowupAt: addDays(T, -1) }), bruna);
    oppId = o.id;
    // corretor não atribui oportunidade a outro corretor
    expect(o.brokerId).toBe(bruna.id);
    expect(o.estimatedValue).toBe(40000);
    const [h] = await db.select().from(opportunityStageHistory).where(eq(opportunityStageHistory.opportunityId, o.id));
    expect(h.toStage).toBe("lead_novo");
  });

  it("pipeline: avança, volta etapa (histórico) e perder exige motivo", async () => {
    await changeOpportunityStage({ id: oppId, stage: "proposta_enviada", note: null, lostReason: null, nextFollowupAt: addDays(T, 2) }, bruna);
    await changeOpportunityStage({ id: oppId, stage: "diagnostico", note: "Cliente pediu revisão", lostReason: null, nextFollowupAt: null }, bruna);
    await expect(changeOpportunityStage({ id: oppId, stage: "perdido", note: null, lostReason: null, nextFollowupAt: null }, bruna)).rejects.toThrow(/motivo/);
    const d = await getOpportunity(oppId, bruna);
    expect(d.o.stage).toBe("diagnostico");
    expect(d.o.nextFollowupAt).toBe(addDays(T, 2));
    expect(d.history.length).toBe(3);
    expect(d.timeline.some((t) => t.i.description.includes("retorno de etapa"))).toBe(true);
  });

  it("hierarquia: corretor vê só a própria carteira; supervisor vê a equipe; head vê tudo", async () => {
    await createOpportunity(opportunitySchema.parse({ clientName: "Cliente do Diego", product: "dental", source: "site" }), diego);
    await createOpportunity(opportunitySchema.parse({ clientName: "Cliente de fora", product: "vida", source: "site" }), outsider);
    const names = async (u: CurrentUser) => (await listOpportunities({ includeClosed: true }, await getScope(u))).map((r) => r.o.clientName).sort();
    expect(await names(bruna)).toEqual(["Cliente Alfa"]);
    expect(await names(supervisor)).toEqual(["Cliente Alfa", "Cliente do Diego"]);
    expect(await names(head)).toEqual(["Cliente Alfa", "Cliente de fora", "Cliente do Diego"]);
    await expect(getOpportunity(oppId, diego)).rejects.toThrow(/não encontrad/);
    await expect(updateOpportunity(oppId, opportunitySchema.parse({ clientName: "x", product: "vida", source: "site" }), diego)).rejects.toThrow(/não encontrad/);
    // busca global também respeita o escopo
    expect((await globalSearch("Cliente", 10, await getScope(diego))).filter((h) => h.kind === "oportunidade").map((h) => h.title)).toEqual(["Cliente do Diego"]);
  });

  it("escopo vale também para empresas, cotações e tarefas (leitura e escrita por ID)", async () => {
    const mine = await createCompany(companySchema.parse({ legalName: "Empresa da Bruna", ownerId: bruna.id }), head);
    const other = await createCompany(companySchema.parse({ legalName: "Empresa de Outro", ownerId: outsider.id }), head);
    const q = await createQuotation(quotationStep1Schema.parse({ companyId: other.id, processType: "NEW", estimatedLives: 120, openedAt: T, priority: "media", ownerId: outsider.id, cnpjs: [] }), head);
    const scope = await getScope(bruna);
    expect((await listCompanies({ ownerIds: scope.all ? null : scope.ownerIds })).map((r) => r.c.legalName)).toEqual(["Empresa da Bruna"]);
    expect((await listQuotations({ ownerIds: scope.all ? null : scope.ownerIds })).length).toBe(0);
    await expect(guardCompany(bruna, other.id)).rejects.toThrow();
    await expect(guardQuotation(bruna, q.id)).rejects.toThrow();
    await expect(guardCompany(bruna, mine.id)).resolves.toBeUndefined();
    await expect(guardQuotation(head, q.id)).resolves.toBeUndefined();
    const t = await createTask(taskSchema.parse({ title: "Tarefa de outro", priority: "media", category: "venda", ownerId: outsider.id }), head);
    await expect(guardTask(bruna, t.id)).rejects.toThrow();
    await expect(guardTask(supervisor, t.id)).rejects.toThrow();
  });

  it("pendências de dados da cotação apontam o que falta antes do envio", async () => {
    const c = await createCompany(companySchema.parse({ legalName: "Gaps S.A." }), head);
    const q = await createQuotation(quotationStep1Schema.parse({ companyId: c.id, processType: "NEW", estimatedLives: 150, openedAt: T, priority: "media", cnpjs: [] }), head);
    const fields = (await getQuotationGaps(q.id)).map((g) => g.field);
    expect(fields).toEqual(expect.arrayContaining(["CNPJ principal", "Endereço", "Acomodação (enfermaria/apartamento)", "Abrangência (regional/estadual/nacional)", "Fatura atual", "Comprovante de endereço"]));
  });

  it("reunião: roteiro, agenda com lembrete, ata, WhatsApp, tarefa de retorno e avanço no CRM", async () => {
    await changeOpportunityStage({ id: oppId, stage: "primeiro_contato", note: null, lostReason: null, nextFollowupAt: null }, bruna);
    const questions = defaultQuestions().map((q) => (q.key === "operadora_atual" ? { ...q, asked: true, status: "recebida" as const, answer: "Amil" } : q.key === "valor_atual" ? { ...q, asked: true, status: "pendente" as const } : q));
    const id = await saveMeeting(null, meetingSchema.parse({ title: "Diagnóstico Alfa", opportunityId: oppId, date: T, startTime: "10:00", endTime: "11:00", advisorName: "Ana", salesRepName: "Bruna", questions, actions: [{ text: "Enviar fatura", owner: "Maria", dueDate: addDays(T, 2) }] }), bruna);
    const { m } = await getMeeting(id, bruna);
    expect(m.companyName).toBe("Cliente Alfa");
    expect(m.clientName).toBe("Maria Souza");
    const [ev] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, m.calendarEventId!));
    expect(ev.type).toBe("reuniao_cliente");
    expect(ev.reminderMinutes).toBe(30);
    expect(ev.opportunityId).toBe(oppId);

    const out = await generateMeetingOutputs(id, { createTask: true }, bruna);
    expect(out.minutes).toMatch(/Qual a operadora atual\? Amil/);
    expect(out.pendencies.join(" ")).toMatch(/valor pago/);
    expect(out.whatsapp).toMatch(/^Olá, Maria!/);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, out.taskId!));
    expect(task.opportunityId).toBe(oppId);
    expect(task.meetingId).toBe(id);
    // segunda geração não duplica a tarefa
    const again = await generateMeetingOutputs(id, { createTask: true }, bruna);
    expect(again.taskId).toBe(out.taskId);
    const after = await getMeeting(id, bruna);
    expect(after.m.status).toBe("realizada");
    const [o] = await db.select().from(opportunities).where(eq(opportunities.id, oppId));
    expect(o.stage).toBe("diagnostico");
    const ata = await db.select().from(interactions).where(and(eq(interactions.opportunityId, oppId), eq(interactions.type, "reuniao")));
    expect(ata.some((i) => i.description.startsWith("Ata da reunião"))).toBe(true);
    expect((await listMeetings({}, await getScope(diego))).length).toBe(0);
    expect((await listMeetings({}, await getScope(supervisor))).length).toBe(1);
  });

  it("indicadores comerciais, relatórios e lembretes de campanha", async () => {
    const won = await createOpportunity(opportunitySchema.parse({ clientName: "Venda Fechada", product: "plano_saude", estimatedValue: 10000, source: "indicacao", stage: "fechado" }), bruna);
    const lost = await createOpportunity(opportunitySchema.parse({ clientName: "Venda Perdida", product: "plano_saude", source: "indicacao", stage: "perdido", lostReason: "Preço" }), bruna);
    expect(won.closedAt).not.toBeNull();
    expect(lost.closedAt).not.toBeNull();
    const ov = await getCommercialOverview(await getScope(bruna));
    expect(ov.kpis.totalLeads).toBe(3);
    expect(ov.kpis.salesClosedMonth).toBe(1);
    expect(ov.kpis.salesValueMonth).toBe(10000);
    expect(ov.kpis.conversionRate).toBe(50);
    expect(ov.kpis.meetingsWeek).toBeGreaterThanOrEqual(1);
    const rep = await getCommercialReports({}, await getScope(bruna));
    expect(rep.totals.sales).toBe(1);
    expect(rep.salesByBroker[0].broker).toBe("Bruna Corretora");
    expect(rep.lostReasons[0]).toEqual({ reason: "Preço", n: 1 });
    expect(rep.bySource.find((x) => x.source === "campanha")?.n).toBe(1);

    const r1 = await runCampaignReminders(T);
    expect(r1.activated).toBe(1);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    expect(c.status).toBe("ativa");
    const before = await db.select().from(notifications).where(and(eq(notifications.userId, head.id), eq(notifications.kind, "campanha")));
    expect(before.length).toBe(1);
    await runCampaignReminders(T);
    const afterN = await db.select().from(notifications).where(and(eq(notifications.userId, head.id), eq(notifications.kind, "campanha")));
    expect(afterN.length).toBe(1); // não duplica o lembrete do mesmo marco
    const camp = await getCampaign(campaignId, await getScope(head));
    expect(camp!.leads).toBe(1);
  });

  it("rotina notifica follow-up atrasado do CRM e lembrete de compromisso", async () => {
    await db.update(opportunities).set({ nextFollowupAt: addDays(T, -3) }).where(eq(opportunities.id, oppId));
    const soon = new Date(Date.now() + 20 * 60_000);
    await db.insert(calendarEvents).values({ title: "Ligação em breve", type: "ligacao", startsAt: soon, ownerId: bruna.id, reminderMinutes: 30 });
    await runSweep();
    const ns = await db.select().from(notifications).where(eq(notifications.userId, bruna.id));
    expect(ns.some((n) => n.title.startsWith("Follow-up atrasado: Cliente Alfa"))).toBe(true);
    expect(ns.some((n) => n.title.includes("Ligação em breve"))).toBe(true);
  });

  it("assistente: comandos comerciais no modo local e campanha só após confirmação", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const fu = await askAssistant("Mostrar vendas com follow-up atrasado", bruna);
      expect(fu.text).toMatch(/Cliente Alfa/);
      const msg = await askAssistant("Criar mensagem de follow-up para o cliente Cliente Alfa", bruna);
      expect(msg.text).toMatch(/Olá, Maria!/);
      expect(msg.text).toMatch(/não foi enviada/i);
      const resumo = await askAssistant("Resumir esta reunião", bruna);
      expect(resumo.text).toMatch(/ATA DE REUNIÃO — Diagnóstico Alfa/);
      const docs = await askAssistant("Gerar mensagem pedindo documentos para o cliente Cliente Alfa", bruna);
      expect(docs.text).toMatch(/Cartão CNPJ/);
      const dia = await askAssistant("Resumo do dia", bruna);
      expect(dia.text).toMatch(/RESUMO DO DIA/);
      // corretor não usa ferramentas de visão global
      const global = await askAssistant("Quais renovações vencem nos próximos 60 dias?", bruna);
      expect(global.text).toMatch(/não está disponível para o seu perfil/);

      const camp = await askAssistant("Criar campanha para planos empresariais este mês", head);
      expect(camp.actionIds).toHaveLength(1);
      const count = async () => (await db.select().from(campaigns)).length;
      const n0 = await count();
      const res = await decideAction(camp.actionIds[0], true, head);
      expect(res.created).toBe(1);
      expect(await count()).toBe(n0 + 1);
      await expect(decideAction(camp.actionIds[0], true, head)).rejects.toThrow(/já foi decidida/);
      const corretorCamp = await askAssistant("Criar campanha para planos empresariais este mês", bruna);
      expect(corretorCamp.text).toMatch(/não está disponível|não permite/);
    } finally {
      if (prev) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it("LGPD: localizar titular e anonimizar mantendo os números", async () => {
    const found = await findDataSubject("Maria Souza");
    expect(found.opportunities.map((o) => o.id)).toContain(oppId);
    const mt = found.meetings.length ? found.meetings : (await findDataSubject("Diagnóstico Alfa")).meetings;
    await anonymizeSubject({ contactIds: [], opportunityIds: [oppId], meetingIds: mt.map((m) => m.id) }, head);
    const [o] = await db.select().from(opportunities).where(eq(opportunities.id, oppId));
    expect(o.clientName).toBe("Titular anonimizado");
    expect(o.phone).toBeNull();
    expect(o.estimatedValue).toBe(40000);
    const [m] = await db.select().from(meetings).where(eq(meetings.id, mt[0].id));
    expect(m.clientName).toBeNull();
    expect(m.minutes).toBeNull();
    const logs = await db.select().from(activityLogs).where(eq(activityLogs.entityType, "lgpd"));
    expect(logs[0].sensitive).toBe(true);
    expect((await findDataSubject("Maria Souza")).opportunities.length).toBe(0);
  });
});
