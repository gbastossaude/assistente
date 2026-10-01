/**
 * SEED DE DESENVOLVIMENTO — dados fictícios para demonstração. Recusa rodar em produção.
 * Uso: npm run db:seed-dev   (após db:migrate e db:bootstrap)
 * Usuários criados (senha: Besmart@2026): head@besmart.local, analista@…, comercial@…, leitura@…
 */
import "dotenv/config";
import { eq, inArray, sql } from "drizzle-orm";
import { addDays, todayISO } from "../src/lib/domain/dates";
import { companySchema, contractSchema, quotationStep1Schema, quotationStep2Schema, quotationStep3Schema, taskSchema } from "../src/lib/validation/schemas";
import type { CurrentUser } from "../src/server/auth";
import { db } from "../src/server/db";
import { companies, insurers, users } from "../src/server/db/schema";
import { runSweep } from "../src/server/automation/engine";
import { createCompany, saveContact, saveContract } from "../src/server/services/companies";
import { uploadDocument } from "../src/server/services/documents";
import { addInsurersToQuotation, listQuotationInsurers, saveProposal, sendToInsurer } from "../src/server/services/insurers";
import { confirmImport, previewImport } from "../src/server/services/lives";
import { changeQuotationStatus, createQuotation, updateQuotationStep2, updateQuotationStep3 } from "../src/server/services/quotations";
import { saveRenewal } from "../src/server/services/renewals";
import { declareRemainingAsNo, saveSpecialEntry, saveSpecialSummary } from "../src/server/services/special-cases";
import { createTask } from "../src/server/services/tasks";
import { hashPassword } from "../src/server/services/users";
import { saveEvent } from "../src/server/services/calendar";
import { buildBaseWorkbook, sampleLivesRows, syntheticCnpj } from "./sample-data";

if (process.env.NODE_ENV === "production") {
  console.error("seed-dev não pode ser executado em produção.");
  process.exit(1);
}

const PDF = Buffer.from("%PDF-1.4\n% documento ficticio de demonstracao\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const T = todayISO();

async function user(email: string, name: string, role: CurrentUser["role"]): Promise<CurrentUser> {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return { id: existing.id, name: existing.name, email, role: existing.role };
  const [u] = await db.insert(users).values({ email, name, role, passwordHash: await hashPassword("Besmart@2026") }).returning();
  return { id: u.id, name: u.name, email, role };
}

async function main() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(companies);
  if (n > 0) {
    console.log("Já existem empresas — seed de demonstração ignorado.");
    process.exit(0);
  }
  const head = await user("head@besmart.local", "Helena Duarte (Head)", "head");
  const analista = await user("analista@besmart.local", "André Lima (Analista)", "analista");
  await user("comercial@besmart.local", "Carla Mendes (Comercial)", "comercial");
  await user("leitura@besmart.local", "Leitor Demonstração", "leitura");
  const ins = await db.select().from(insurers).where(inArray(insurers.name, ["Amil", "Bradesco Saúde", "SulAmérica Saúde", "Porto Saúde", "Omint"]));
  const id = (name: string) => ins.find((i) => i.name === name)!.id;

  // ── Empresa 1: grande conta RENEW com processo avançado
  const c1Cnpjs = [syntheticCnpj(11), syntheticCnpj(11, 2)];
  const c1 = await createCompany(companySchema.parse({ legalName: "Metalúrgica Horizonte S.A. (DEMO)", tradeName: "Horizonte (DEMO)", mainCnpj: c1Cnpjs[0], economicGroup: "Grupo Horizonte", segment: "Indústria", estimatedLives: 420, city: "Campinas", uf: "SP", origin: "Carteira", isClient: true }), head);
  await saveContact(null, { companyId: c1.id, name: "Patrícia Rocha", roleTitle: "Gerente de RH", email: "patricia.rocha@exemplo.invalid", phone: "(19) 3000-0000", whatsapp: "+55 19 90000-0000", isPrimary: true, notes: null }, head);
  await saveContract(null, contractSchema.parse({ companyId: c1.id, insurerId: id("Bradesco Saúde"), startDate: "2022-01-01", anniversaryDate: addDays(T, 75), modality: "compulsorio", paymentMethod: "Boleto", adjustmentIndex: "VCMH", breakEven: 70, commissionPct: 2, lossRatioPct: 84, plans: [{ planName: "Nacional Flex Enfermaria", lives: 260, monthlyCost: 182000, consultationReimbursement: 120 }, { planName: "Nacional Flex Apartamento", lives: 160, monthlyCost: 168000, consultationReimbursement: 220 }] }), head);
  const q1 = await createQuotation(quotationStep1Schema.parse({ companyId: c1.id, processType: "RENEW", estimatedLives: 420, openedAt: addDays(T, -20), targetDate: addDays(T, 10), renewalDate: addDays(T, 75), priority: "alta", reason: "Reajuste proposto de 24% pela operadora atual", ownerId: head.id, cnpjs: c1Cnpjs }), head);
  await updateQuotationStep2(q1.id, quotationStep2Schema.parse({ modality: "compulsorio", fgts100: true, dependents100: true, paymentMethod: "Boleto", remission: "Não possui", adjustmentIndex: "VCMH", breakEven: 70, upgradeDowngradeRules: "Upgrade apenas no aniversário", commissionPct: 2, designChange: false }), head);
  await updateQuotationStep3(q1.id, quotationStep3Schema.parse({ employeeContributionType: "percentual", employeeContributionValue: 0, dependentContributionType: "percentual", dependentContributionValue: 50, hasCopay: true, copayPct: 30, copayProcedures: ["consultas", "exames_tipo_a", "pronto_socorro"] }), head);
  await saveSpecialSummary({ quotationId: q1.id, kind: "home_care", has: true, quantity: 1, details: {}, notes: null }, head);
  await saveSpecialEntry({ quotationId: q1.id, kind: "home_care", data: { identificacao: "M.A.S.", gasto_mensal: 18500 } }, head);
  await saveSpecialSummary({ quotationId: q1.id, kind: "afastados", has: true, quantity: 2, details: {}, notes: null }, head);
  await saveSpecialEntry({ quotationId: q1.id, kind: "afastados", data: { cid: "M54.5", data_afastamento: addDays(T, -200), idade: 47, sexo: "M", plano_atual: "Nacional Flex Enfermaria", localidade: "Campinas/SP" } }, head);
  await declareRemainingAsNo(q1.id, head);
  for (const [docType, name] of [["fatura", "fatura-ago-2026.pdf"], ["sinistralidade", "sinistralidade-12m.pdf"], ["evolucao_vidas", "evolucao-vidas.pdf"]] as const) {
    await uploadDocument({ name, buffer: PDF }, { quotationId: q1.id, companyId: null, taskId: null, docType, referenceDate: addDays(T, -15), sender: "Patrícia Rocha (RH)", status: "recebido", notes: null }, analista);
  }
  const base = await buildBaseWorkbook(sampleLivesRows({ companyName: "HORIZONTE", cnpjs: c1Cnpjs, insurer: "BRADESCO SAÚDE", plans: ["NACIONAL FLEX ENFERMARIA", "NACIONAL FLEX APARTAMENTO"], rows: 420, withErrors: true, seed: 7 }));
  const prev = await previewImport(q1.id, { file: { name: "BASE HORIZONTE.xlsm", buffer: base } });
  await confirmImport(q1.id, { tempKey: prev.tempKey, fileName: prev.fileName, sheet: prev.sheetName, mapping: prev.mapping, mode: "todas" }, analista);
  await changeQuotationStatus({ quotationId: q1.id, toStatus: "pronta_para_mercado", note: null, overrideReason: "Maiores usuários e picos serão enviados direto às operadoras pelo RH", lostReason: null }, head);
  await addInsurersToQuotation(q1.id, [id("Amil"), id("SulAmérica Saúde"), id("Porto Saúde")], head);
  const qis = await listQuotationInsurers(q1.id);
  for (const r of qis) await sendToInsurer({ id: r.qi.id, sentAt: addDays(T, -8), protocol: `PRT-${r.insurer.name.slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`, expectedReturnAt: addDays(T, -1), filesSent: "Base de vidas, fatura, sinistralidade" }, head);
  await changeQuotationStatus({ quotationId: q1.id, toStatus: "enviada_operadoras", note: null, overrideReason: null, lostReason: null }, head);
  const amil = qis.find((r) => r.insurer.name === "Amil")!;
  await saveProposal({ id: null, quotationInsurerId: amil.qi.id, receivedAt: addDays(T, -1), validUntil: addDays(T, 6), commissionPct: 2, adminFeePct: 1.5, commercialConditions: "Isenção de carências para toda a massa", notes: null, documentId: null, plans: [{ productName: "Amil S450 Enfermaria", network: "Rede própria + credenciada", coverage: "Nacional", accommodation: "Enfermaria", copay: "30% limitado", reimbursement: 100, monthlyValue: 171000, currentCost: 182000, lives: 260, waitingPeriods: "Isenção", commercialConditions: null, notes: null }, { productName: "Amil S580 Apartamento", network: "Rede ampla", coverage: "Nacional", accommodation: "Apartamento", copay: "30% limitado", reimbursement: 200, monthlyValue: 172500, currentCost: 168000, lives: 160, waitingPeriods: "Isenção", commercialConditions: null, notes: null }] }, head);
  const sula = qis.find((r) => r.insurer.name === "SulAmérica Saúde")!;
  await saveProposal({ id: null, quotationInsurerId: sula.qi.id, receivedAt: T, validUntil: addDays(T, 20), commissionPct: 2.5, adminFeePct: null, commercialConditions: null, notes: null, documentId: null, plans: [{ productName: "Prestige Enfermaria", network: "Referenciada", coverage: "Nacional", accommodation: "Enfermaria", copay: "Sem copart. consultas", reimbursement: 150, monthlyValue: 189000, currentCost: 182000, lives: 260, waitingPeriods: "Isenção", commercialConditions: null, notes: null }] }, head);

  // ── Empresa 2: NEW em coleta, com pendências
  const c2Cnpj = syntheticCnpj(22);
  const c2 = await createCompany(companySchema.parse({ legalName: "Rede Varejista Sol Nascente Ltda. (DEMO)", tradeName: "Sol Nascente (DEMO)", mainCnpj: c2Cnpj, segment: "Varejo", estimatedLives: 1350, city: "São Paulo", uf: "SP", origin: "Indicação" }), head);
  await saveContact(null, { companyId: c2.id, name: "Rodrigo Alves", roleTitle: "Diretor Administrativo", email: "rodrigo.alves@exemplo.invalid", phone: null, whatsapp: "+55 11 90000-0001", isPrimary: true, notes: null }, head);
  const q2 = await createQuotation(quotationStep1Schema.parse({ companyId: c2.id, processType: "NEW", estimatedLives: 1350, openedAt: addDays(T, -5), targetDate: addDays(T, 25), priority: "critica", reason: "Insatisfação com rede credenciada", ownerId: analista.id, cnpjs: [c2Cnpj] }), head);
  await changeQuotationStatus({ quotationId: q2.id, toStatus: "aguardando_cliente", note: "Solicitação de informações enviada", overrideReason: null, lostReason: null }, analista);

  // ── Empresa 3: menor porte, oportunidade
  const c3 = await createCompany(companySchema.parse({ legalName: "Clínica Vida Plena S/S (DEMO)", mainCnpj: syntheticCnpj(33), segment: "Saúde", estimatedLives: 85, city: "Curitiba", uf: "PR", origin: "Prospecção" }), analista);
  await createQuotation(quotationStep1Schema.parse({ companyId: c3.id, processType: "NEW", estimatedLives: 85, openedAt: T, targetDate: addDays(T, 30), priority: "media", ownerId: analista.id, cnpjs: [] }), analista);

  // ── Renovações e agenda
  await saveRenewal(null, { companyId: c1.id, contractId: null, insurerId: id("Bradesco Saúde"), insurerName: null, lives: 420, anniversaryDate: addDays(T, 75), adjustmentReceivedPct: 24, lossRatioPct: 84, status: "em_mercado", ownerId: head.id, quotationId: q1.id, notes: null }, head);
  const c4 = await createCompany(companySchema.parse({ legalName: "Transportes Rota Sul S.A. (DEMO)", mainCnpj: syntheticCnpj(44), estimatedLives: 640, city: "Porto Alegre", uf: "RS", isClient: true }), head);
  await saveContract(null, contractSchema.parse({ companyId: c4.id, insurerId: id("Omint"), startDate: "2021-06-01", anniversaryDate: addDays(T, 110), plans: [{ planName: "Omint Premium", lives: 640, monthlyCost: 512000, consultationReimbursement: 400 }] }), head);
  await saveRenewal(null, { companyId: c4.id, contractId: null, insurerId: id("Omint"), insurerName: null, lives: 640, anniversaryDate: addDays(T, 110), adjustmentReceivedPct: null, lossRatioPct: 71, status: "a_iniciar", ownerId: head.id, quotationId: null, notes: null }, head);
  await saveEvent(null, { title: "Apresentação de propostas — Horizonte", type: "apresentacao", date: addDays(T, 3), startTime: "10:00", endTime: "11:30", allDay: false, location: "Teams", description: null, companyId: c1.id, quotationId: q1.id, insurerId: null, taskId: null, ownerId: head.id }, head);
  await saveEvent(null, { title: "Reunião com Amil — revisão comercial", type: "reuniao_operadora", date: T, startTime: "15:00", endTime: "16:00", allDay: false, location: null, description: null, companyId: c1.id, quotationId: q1.id, insurerId: id("Amil"), taskId: null, ownerId: head.id }, head);
  await createTask(taskSchema.parse({ title: "Cobrar maiores usuários e picos — Horizonte", companyId: c1.id, quotationId: q1.id, priority: "alta", dueDate: addDays(T, -1), category: "documentacao" }), head);
  await createTask(taskSchema.parse({ title: "Preparar comparativo para apresentação", companyId: c1.id, quotationId: q1.id, priority: "alta", dueDate: T, category: "cotacao", checklist: [{ text: "Consolidar propostas", done: true }, { text: "Simular contribuição", done: false }] }), head);
  await createTask(taskSchema.parse({ title: "Status semanal da carteira", priority: "media", dueDate: addDays(T, 2), category: "interna", recurrence: "semanal" }), head);

  console.log("Rotina de automações:", await runSweep());
  console.log("Seed de desenvolvimento concluído. Senha dos usuários de demonstração: Besmart@2026");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
