import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { calendarEvents, insurers, pendencies, quotationChecklistItems, quotations, tasks } from "@/server/db/schema";
import { companySchema, contractSchema, quotationStep1Schema, quotationStep2Schema, quotationStep3Schema } from "@/lib/validation/schemas";
import { createCompany, saveContract, getCompanyDetail } from "@/server/services/companies";
import { changeQuotationStatus, createQuotation, getQuotationDetail, updateQuotationStep2, updateQuotationStep3, listQuotations } from "@/server/services/quotations";
import { saveSpecialEntry, saveSpecialSummary, declareRemainingAsNo } from "@/server/services/special-cases";
import { uploadDocument, updateDocument } from "@/server/services/documents";
import { confirmImport, previewImport } from "@/server/services/lives";
import { addInsurersToQuotation, listQuotationInsurers, saveProposal, sendToInsurer, getComparison } from "@/server/services/insurers";
import { saveRenewal } from "@/server/services/renewals";
import { completeTask, createTask } from "@/server/services/tasks";
import { generateMessage } from "@/server/services/messages";
import { globalSearch } from "@/server/services/search";
import { getMyDay } from "@/server/services/dashboard";
import { getReports } from "@/server/services/reports";
import { runSweep } from "@/server/automation/engine";
import { addDays, todayISO } from "@/lib/domain/dates";
import type { CurrentUser } from "@/server/auth";
import { hasTestDb, makeUser, resetTestDb } from "../helpers/db";
import { buildWorkbook, toXlsm } from "../helpers/workbook";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const CNPJ = "11222333000181";

describe.skipIf(!hasTestDb)("fluxo Grandes Contas +99 (integração com PostgreSQL)", () => {
  let head: CurrentUser;
  let analista: CurrentUser;
  let companyId: string;
  let quotationId: string;

  beforeAll(async () => {
    await resetTestDb();
    head = await makeUser("head", "Head Teste");
    analista = await makeUser("analista", "Analista Teste");
  });

  it("cadastra empresa com CNPJ e contrato atual", async () => {
    const c = await createCompany(companySchema.parse({ legalName: "Indústria Exemplo S.A.", tradeName: "Exemplo", mainCnpj: "11.222.333/0001-81", estimatedLives: 350, uf: "SP", city: "São Paulo" }), head);
    companyId = c.id;
    await expect(createCompany(companySchema.parse({ legalName: "Duplicada", mainCnpj: CNPJ }), head)).rejects.toThrow(/já cadastrado/);
    const detail = await getCompanyDetail(companyId);
    expect(detail?.cnpjs.map((x) => x.cnpj)).toEqual([CNPJ]);
  });

  it("cria cotação RENEW com checklist automático e itens condicionais dispensados", async () => {
    const q = await createQuotation(
      quotationStep1Schema.parse({ companyId, processType: "RENEW", estimatedLives: 350, openedAt: todayISO(), targetDate: addDays(todayISO(), 20), renewalDate: addDays(todayISO(), 75), priority: "alta", reason: "Reajuste elevado" }),
      head,
    );
    quotationId = q.id;
    expect(q.code).toMatch(/^COT-\d{4}-0001$/);
    const items = await db.select().from(quotationChecklistItems).where(eq(quotationChecklistItems.quotationId, q.id));
    expect(items.length).toBeGreaterThan(30);
    const byKey = Object.fromEntries(items.map((i) => [i.itemKey, i]));
    expect(byKey.cnpj.status).toBe("recebido"); // CNPJ principal herdado da empresa
    expect(byKey.cnpj.autoFilled).toBe(true);
    expect(byKey.estipulante.status).toBe("recebido");
    expect(byKey.motivo_cotacao.status).toBe("recebido");
    expect(byKey.sinistralidade).toMatchObject({ required: true, status: "pendente" }); // RENEW exige
    expect(byKey.afastados_cid).toMatchObject({ applicable: false, status: "dispensado" });
    const pend = await db.select().from(pendencies).where(eq(pendencies.quotationId, q.id));
    expect(pend.some((p) => p.title.startsWith("Sinistralidade"))).toBe(true);
  });

  it("bloqueia 'Pronta para mercado' com obrigatório pendente; override exige justificativa e papel", async () => {
    await expect(changeQuotationStatus({ quotationId, toStatus: "pronta_para_mercado", note: null, overrideReason: null, lostReason: null }, head)).rejects.toThrow(/obrigatório/);
    await expect(changeQuotationStatus({ quotationId, toStatus: "pronta_para_mercado", note: null, overrideReason: "Cliente autorizou envio parcial", lostReason: null }, analista)).rejects.toThrow(/Head/);
  });

  it("dados das etapas 2/3, contratos e situações especiais atualizam o checklist", async () => {
    await saveContract(
      null,
      contractSchema.parse({
        companyId,
        insurerName: "Operadora Atual",
        startDate: "2023-01-01",
        anniversaryDate: "2024-12-01",
        plans: [{ planName: "Plano Enfermaria", lives: 200, monthlyCost: "120.000,00", consultationReimbursement: 150 }, { planName: "Plano Apartamento", lives: 150, monthlyCost: 180000, consultationReimbursement: 250 }],
      }),
      head,
    );
    await updateQuotationStep2(
      quotationId,
      quotationStep2Schema.parse({ modality: "compulsorio", fgts100: true, paymentMethod: "Boleto", remission: "Não", adjustmentIndex: "VCMH", breakEven: 70, upgradeDowngradeRules: "Upgrade no aniversário", commissionPct: 2, designChange: false }),
      head,
    );
    await expect(updateQuotationStep3(quotationId, quotationStep3Schema.parse({ hasCopay: true, copayPct: 40, copayProcedures: ["consultas"] }), head)).rejects.toThrow(/limite/);
    await updateQuotationStep3(quotationId, quotationStep3Schema.parse({ employeeContributionType: "percentual", employeeContributionValue: 0, hasCopay: true, copayPct: 30, copayProcedures: ["consultas", "exames_tipo_a"] }), head);

    await saveSpecialSummary({ quotationId, kind: "home_care", has: true, quantity: 1, details: {}, notes: null }, head);
    await saveSpecialEntry({ quotationId, kind: "home_care", data: { identificacao: "J.S.", gasto_mensal: "12.000,00" } }, head);
    let pend = await db.select().from(pendencies).where(and(eq(pendencies.quotationId, quotationId), eq(pendencies.status, "aberta")));
    expect(pend.some((p) => /Home Care.*relatório médico/i.test(p.title))).toBe(true);
    const n = await declareRemainingAsNo(quotationId, head);
    expect(n).toBe(8);

    const report = await uploadDocument({ name: "relatorio home care.pdf", buffer: PDF }, { quotationId, companyId: null, taskId: null, docType: "relatorio_home_care", referenceDate: null, sender: "RH", status: "recebido", notes: null }, head);
    const protocol = await uploadDocument({ name: "protocolo.pdf", buffer: PDF }, { quotationId, companyId: null, taskId: null, docType: "protocolo_medico", referenceDate: null, sender: "RH", status: "recebido", notes: null }, head);
    const [entry] = (await getQuotationDetail(quotationId))!.specialEntries;
    await saveSpecialEntry({ id: entry.id, quotationId, kind: "home_care", data: { ...entry.data, relatorio_medico: report.id, protocolo: protocol.id } }, head);
    pend = await db.select().from(pendencies).where(and(eq(pendencies.quotationId, quotationId), eq(pendencies.status, "aberta")));
    expect(pend.some((p) => /Home Care/.test(p.title))).toBe(false);

    const detail = (await getQuotationDetail(quotationId))!;
    const byKey = Object.fromEntries(detail.checklist.map((i) => [i.itemKey, i.status]));
    expect(byKey).toMatchObject({ planos_vidas: "recebido", custos_planos: "recebido", reembolsos: "recebido", coparticipacao: "recebido", home_care: "recebido", situacoes_declaradas: "recebido", encampacao: "dispensado" });
  });

  it("documento inválido gera pendência e reabre o item; validado conclui", async () => {
    const fatura = await uploadDocument({ name: "fatura.pdf", buffer: PDF }, { quotationId, companyId: null, taskId: null, docType: "fatura", referenceDate: todayISO(), sender: "Financeiro", status: "recebido", notes: null }, head);
    let item = (await db.select().from(quotationChecklistItems).where(and(eq(quotationChecklistItems.quotationId, quotationId), eq(quotationChecklistItems.itemKey, "fatura"))))[0];
    expect(item.status).toBe("recebido");
    expect(item.documentId).toBe(fatura.id);
    await updateDocument({ id: fatura.id, docType: "fatura", referenceDate: null, sender: null, status: "desatualizado", notes: "Competência antiga" }, head);
    item = (await db.select().from(quotationChecklistItems).where(eq(quotationChecklistItems.id, item.id)))[0];
    expect(item.status).toBe("pendente");
    const p = await db.select().from(pendencies).where(eq(pendencies.sourceKey, `doc:${fatura.id}`));
    expect(p[0]?.status).toBe("aberta");
    await updateDocument({ id: fatura.id, docType: "fatura", referenceDate: null, sender: null, status: "validado", notes: null }, head);
    item = (await db.select().from(quotationChecklistItems).where(eq(quotationChecklistItems.id, item.id)))[0];
    expect(item.status).toBe("validado");
    expect((await db.select().from(pendencies).where(eq(pendencies.sourceKey, `doc:${fatura.id}`)))[0].status).toBe("resolvida");
  });

  it("importa base de vidas XLSM com preview, mapeamento e confirmação", async () => {
    const rows = [
      ["Exemplo", CNPJ, "10/05/1985", "", "", "TITULAR", "", "ATIVO", "", "São Paulo", "SP", "Operadora Atual", "Plano Enfermaria"],
      ["Exemplo", CNPJ, "10/05/2015", "", "", "DEPENDENTE", "FILHO", "ATIVO", "", "São Paulo", "SP", "Operadora Atual", "Plano Enfermaria"],
      ["Exemplo", CNPJ, "01/01/1960", "", "", "TITULAR", "", "AFASTADO", "M54", "Campinas", "SP", "Operadora Atual", "Plano Apartamento"],
      ["Exemplo", "999", "01/01/1990", "", "", "XPTO", "", "", "", "", "", "", ""],
    ];
    const file = await toXlsm(await buildWorkbook(rows));
    const preview = await previewImport(quotationId, { file: { name: "EXEMPLO BASE 1.xlsm", buffer: file } });
    expect(preview.sheetName).toBe("BASE SAÚDE");
    expect(preview.totals).toMatchObject({ rows: 4, valid: 3, withErrors: 1 });
    expect(preview.missingRequired).toEqual([]);
    expect(preview.issues.filter((i) => i.row === 5).length).toBeGreaterThan(3);
    // Reprocessa a partir do arquivo temporário (fluxo de correção de mapeamento)
    const again = await previewImport(quotationId, { tempKey: preview.tempKey, fileName: preview.fileName, sheet: preview.sheetName, mapping: { ...preview.mapping, empresa: null } });
    expect(again.totals.rows).toBe(4);
    const importId = await confirmImport(quotationId, { tempKey: preview.tempKey, fileName: preview.fileName, sheet: preview.sheetName, mapping: preview.mapping, mode: "todas" }, head);
    expect(importId).toBeTruthy();
    const d = (await getQuotationDetail(quotationId))!;
    expect(d.activeImport).toMatchObject({ totalRows: 4, errorRows: 1 });
    expect(d.checklist.find((i) => i.itemKey === "base_vidas")?.status).toBe("recebido");
    const p = await db.select().from(pendencies).where(eq(pendencies.sourceKey, `lives:${quotationId}`));
    expect(p[0].title).toMatch(/1 registro/);
    expect(d.readiness.components[1].ratio).toBeCloseTo(0.75);
  });

  it("override registra justificativa; operadoras, follow-up automático e proposta cancelando cobrança", async () => {
    await changeQuotationStatus({ quotationId, toStatus: "pronta_para_mercado", note: null, overrideReason: "Sinistralidade será enviada direto à operadora", lostReason: null }, head);
    const [q] = await db.select().from(quotations).where(eq(quotations.id, quotationId));
    expect(q.readyOverrideReason).toMatch(/Sinistralidade/);

    const all = await db.select().from(insurers);
    const two = all.filter((i) => ["Amil", "Bradesco Saúde"].includes(i.name)).map((i) => i.id);
    await addInsurersToQuotation(quotationId, two, head);
    let qis = await listQuotationInsurers(quotationId);
    expect(qis).toHaveLength(2);
    const amil = qis.find((x) => x.insurer.name === "Amil")!;
    await sendToInsurer({ id: amil.qi.id, sentAt: todayISO(), protocol: "P-123", expectedReturnAt: addDays(todayISO(), -1), filesSent: "Base + fatura" }, head);
    const fu = await db.select().from(tasks).where(eq(tasks.quotationInsurerId, amil.qi.id));
    expect(fu).toHaveLength(1);
    expect(fu[0].dueDate).toBe(addDays(todayISO(), 5));

    await runSweep();
    const noResp = await db.select().from(pendencies).where(eq(pendencies.sourceKey, `qi:${amil.qi.id}:noresp`));
    expect(noResp[0]?.status).toBe("aberta");

    await saveProposal(
      {
        id: null,
        quotationInsurerId: amil.qi.id,
        receivedAt: todayISO(),
        validUntil: addDays(todayISO(), 3),
        commissionPct: 2,
        adminFeePct: null,
        commercialConditions: null,
        notes: null,
        documentId: null,
        plans: [{ productName: "Amil S450", network: null, coverage: "Nacional", accommodation: "Apartamento", copay: "30%", reimbursement: 200, monthlyValue: 280000, currentCost: 300000, lives: 350, waitingPeriods: "Isenção", commercialConditions: null, notes: null }],
      },
      head,
    );
    const after = await db.select().from(tasks).where(eq(tasks.quotationInsurerId, amil.qi.id));
    expect(after[0].status).toBe("cancelada");
    qis = await listQuotationInsurers(quotationId);
    expect(qis.find((x) => x.insurer.name === "Amil")!.qi.status).toBe("cotacao_recebida");
    expect((await db.select().from(pendencies).where(eq(pendencies.sourceKey, `qi:${amil.qi.id}:noresp`)))[0].status).toBe("resolvida");

    const cmp = await getComparison(quotationId);
    expect(cmp.proposals[0].variationPct).toBeCloseTo(-6.67, 1);
    expect(cmp.currentMonthlyCost).toBe(300000);
  });

  it("renovação gera marcos 120/90/60/30 e evento de agenda", async () => {
    const id = await saveRenewal(null, { companyId, contractId: null, insurerId: null, insurerName: "Operadora Atual", lives: 350, anniversaryDate: addDays(todayISO(), 200), adjustmentReceivedPct: null, lossRatioPct: null, status: "a_iniciar", ownerId: null, quotationId: null, notes: null }, head);
    const ts = await db.select().from(tasks).where(eq(tasks.renewalId, id));
    expect(ts.map((t) => t.dueDate).sort()).toEqual([addDays(todayISO(), 80), addDays(todayISO(), 110), addDays(todayISO(), 140), addDays(todayISO(), 170)]);
    const ev = await db.select().from(calendarEvents).where(eq(calendarEvents.automationKey, `ren:${id}:event`));
    expect(ev).toHaveLength(1);
    // alterar data reprograma as tarefas abertas
    await saveRenewal(id, { companyId, contractId: null, insurerId: null, insurerName: "Operadora Atual", lives: 350, anniversaryDate: addDays(todayISO(), 210), adjustmentReceivedPct: null, lossRatioPct: null, status: "em_preparacao", ownerId: null, quotationId: null, notes: null }, head);
    const ts2 = await db.select().from(tasks).where(eq(tasks.renewalId, id));
    expect(ts2).toHaveLength(4);
    expect(ts2.map((t) => t.dueDate).sort()[0]).toBe(addDays(todayISO(), 90));
  });

  it("tarefa recorrente gera próxima ocorrência e próxima ação ao concluir", async () => {
    const t = await createTask(
      { title: "Relatório semanal", description: null, companyId, quotationId: null, insurerId: null, ownerId: null, priority: "media", scheduledDate: null, scheduledTime: null, dueDate: todayISO(), status: "a_fazer", category: "interna", checklist: [], notes: null, recurrence: "semanal", recurrenceUntil: null, reminderAt: null },
      head,
    );
    await completeTask({ id: t.id, nextAction: "Ligar para o RH", nextActionDate: addDays(todayISO(), 1), nextActionOwnerId: null }, head);
    const children = await db.select().from(tasks).where(eq(tasks.parentTaskId, t.id));
    expect(children.map((c) => c.title).sort()).toEqual(["Ligar para o RH", "Relatório semanal"]);
    expect(children.find((c) => c.title === "Relatório semanal")!.dueDate).toBe(addDays(todayISO(), 7));
  });

  it("mensagem ao cliente lista só pendências reais e não inventa dados", async () => {
    const m = await generateMessage({ quotationId, templateKey: "cliente_solicitacao_inicial_email" }, "Head Teste");
    expect(m.items).toContain("Relatório de sinistralidade completo dos últimos 12 meses");
    expect(m.items).not.toContain("Fatura do plano atual"); // validada
    expect(m.body).toContain("[informar nome do contato do cliente]");
    expect(m.missing).toContain("contato");
  });

  it("busca global, dashboard, relatórios e listagem", async () => {
    const hits = await globalSearch("Exemplo");
    expect(hits.some((h) => h.kind === "empresa")).toBe(true);
    expect(hits.some((h) => h.kind === "cotacao")).toBe(true);
    expect((await globalSearch("P-123")).some((h) => h.kind === "protocolo")).toBe(true);
    expect((await globalSearch("11.222.333")).some((h) => h.kind === "cnpj")).toBe(true);
    const day = await getMyDay(head.id);
    expect(day.largeAccounts.length).toBe(1);
    expect(day.proposalsToReview.length).toBe(1);
    const rep = await getReports({});
    expect(rep.totals.open).toBe(1);
    expect(rep.insurerResponse.find((r) => r.insurer === "Amil")?.responded).toBe(1);
    const list = await listQuotations({ minLives: 100 });
    expect(list[0].insurersTotal).toBe(2);
  });

  it("apresentação ao cliente agenda a cadência D1/D3/D5/D7 do Playbook; negociação encerra a cadência", async () => {
    await changeQuotationStatus({ quotationId, toStatus: "apresentacao_cliente", note: null, overrideReason: null, lostReason: null }, head);
    const cad = (await db.select().from(tasks).where(eq(tasks.quotationId, quotationId))).filter((t) => t.automationKey?.startsWith(`cad:${quotationId}:`));
    expect(cad.map((t) => t.dueDate).sort()).toEqual([1, 3, 5, 7].map((d) => addDays(todayISO(), d)));
    expect(cad.every((t) => t.category === "follow_up" && t.status === "a_fazer")).toBe(true);
    expect(cad.find((t) => t.automationKey!.endsWith(":d3"))!.title).toMatch(/^D3 Objeção silenciosa/);
    const msg = await generateMessage({ quotationId, templateKey: "cliente_cadencia_d3" }, "Head Teste");
    expect(msg.body).toMatch(/preço e qualidade/);

    await changeQuotationStatus({ quotationId, toStatus: "negociacao", note: null, overrideReason: null, lostReason: null }, head);
    const after = (await db.select().from(tasks).where(eq(tasks.quotationId, quotationId))).filter((t) => t.automationKey?.startsWith(`cad:${quotationId}:`));
    expect(after.every((t) => t.status === "cancelada")).toBe(true);
  });

  it("fechar como perdida exige motivo e cancela automações", async () => {
    await expect(changeQuotationStatus({ quotationId, toStatus: "fechada_perdida", note: null, overrideReason: null, lostReason: null }, head)).rejects.toThrow(/motivo/);
    await changeQuotationStatus({ quotationId, toStatus: "fechada_perdida", note: null, overrideReason: null, lostReason: "Preço" }, head);
    const open = await db.select().from(pendencies).where(and(eq(pendencies.quotationId, quotationId), eq(pendencies.status, "aberta")));
    expect(open).toHaveLength(0);
  });
});
