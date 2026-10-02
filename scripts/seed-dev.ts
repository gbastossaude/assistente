/**
 * SEED DE DESENVOLVIMENTO — dados fictícios para demonstração. Recusa rodar em produção.
 * Uso: npm run db:seed-dev   (após db:migrate e db:bootstrap)
 * Usuários criados (senha: Besmart@2026): head@besmart.local, analista@…, comercial@…, leitura@…
 */
import "dotenv/config";
import { eq, inArray, sql } from "drizzle-orm";
import { addDays, todayISO } from "../src/lib/domain/dates";
import { campaignSchema, meetingSchema, opportunitySchema, companySchema, contractSchema, eventSchema, quotationStep1Schema, quotationStep2Schema, quotationStep3Schema, taskSchema } from "../src/lib/validation/schemas";
import type { CurrentUser } from "../src/server/auth";
import { db } from "../src/server/db";
import { companies, insurers, opportunities, users } from "../src/server/db/schema";
import { defaultQuestions } from "../src/lib/domain/meetings";
import { saveCampaign } from "../src/server/services/campaigns";
import { generateMeetingOutputs, saveMeeting } from "../src/server/services/meetings";
import { createOpportunity } from "../src/server/services/opportunities";
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
    console.log("Já existem empresas — dados de cotações ignorados.");
    await seedCommercial();
    console.log("Rotina de automações:", await runSweep());
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
  await saveEvent(null, eventSchema.parse({ title: "Apresentação de propostas — Horizonte", type: "apresentacao", date: addDays(T, 3), startTime: "10:00", endTime: "11:30", allDay: false, location: "Teams", description: null, companyId: c1.id, quotationId: q1.id, insurerId: null, taskId: null, ownerId: head.id }), head);
  await saveEvent(null, eventSchema.parse({ title: "Reunião com Amil — revisão comercial", type: "reuniao_operadora", date: T, startTime: "15:00", endTime: "16:00", allDay: false, location: null, description: null, companyId: c1.id, quotationId: q1.id, insurerId: id("Amil"), taskId: null, ownerId: head.id }), head);
  await createTask(taskSchema.parse({ title: "Cobrar maiores usuários e picos — Horizonte", companyId: c1.id, quotationId: q1.id, priority: "alta", dueDate: addDays(T, -1), category: "documentacao" }), head);
  await createTask(taskSchema.parse({ title: "Preparar comparativo para apresentação", companyId: c1.id, quotationId: q1.id, priority: "alta", dueDate: T, category: "cotacao", checklist: [{ text: "Consolidar propostas", done: true }, { text: "Simular contribuição", done: false }] }), head);
  await createTask(taskSchema.parse({ title: "Status semanal da carteira", priority: "media", dueDate: addDays(T, 2), category: "interna", recurrence: "semanal" }), head);

  await seedCommercial();
  console.log("Rotina de automações:", await runSweep());
  console.log("Seed de desenvolvimento concluído. Senha dos usuários de demonstração: Besmart@2026");
  process.exit(0);
}

/** Módulo comercial: hierarquia (supervisor/corretores/assistente), CRM, reuniões e campanha — fictícios. */
async function seedCommercial() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(opportunities);
  if (n > 0) {
    console.log("Já existem oportunidades — seed comercial ignorado.");
    return;
  }
  const head = await user("head@besmart.local", "Helena Duarte (Head)", "head");
  const supervisor = await user("supervisor@besmart.local", "Sérgio Prado (Supervisor)", "supervisor");
  const bruna = await user("corretor@besmart.local", "Bruna Costa (Corretora)", "corretor");
  const diego = await user("corretor2@besmart.local", "Diego Ramos (Corretor)", "corretor");
  await user("assistente@besmart.local", "Paula Nunes (Assistente)", "assistente");
  await db.update(users).set({ supervisorId: supervisor.id }).where(inArray(users.id, [bruna.id, diego.id]));

  const month = T.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const campId = await saveCampaign(
    null,
    campaignSchema.parse({
      name: `Saúde Empresarial — ${month.split("-").reverse().join("/")} (DEMO)`,
      product: "plano_saude",
      startDate: `${month}-01`,
      endDate: monthEnd,
      audience: "Empresas de 30 a 300 vidas com reajuste nos próximos 90 dias",
      goal: "20 reuniões de diagnóstico e 4 contratos",
      goalLeads: 20,
      goalSales: 4,
      goalValue: 120000,
      mainMessage: "Diagnóstico gratuito do plano de saúde da sua empresa e comparação com as principais operadoras — redução de custo sem perder rede.",
      channels: ["whatsapp", "email", "linkedin"],
      status: "ativa",
      responsibles: "Equipe comercial",
    }),
    head,
  );

  const opp = async (u: CurrentUser, data: Record<string, unknown>, closedDaysAgo?: number) => {
    const o = await createOpportunity(opportunitySchema.parse(data), u);
    if (closedDaysAgo !== undefined) await db.update(opportunities).set({ closedAt: new Date(Date.now() - closedDaysAgo * 86_400_000) }).where(eq(opportunities.id, o.id));
    return o;
  };
  const alfa = await opp(bruna, { clientName: "Construtora Alfa (DEMO)", contactName: "Marcos Lima", phone: "(11) 90000-1001", email: "marcos.lima@exemplo.invalid", product: "plano_saude", lives: 85, estimatedValue: 64000, currentInsurer: "Amil", source: "campanha", campaignId: campId, stage: "primeiro_contato", nextStep: "Reunião de diagnóstico", nextFollowupAt: addDays(T, -2) });
  await opp(bruna, { clientName: "Escritório Beta Advocacia (DEMO)", contactName: "Juliana Reis", phone: "(11) 90000-1002", product: "dental", lives: 14, estimatedValue: 1250, source: "indicacao", stage: "proposta_enviada", quotedInsurers: ["OdontoPrev", "Amil Dental"], nextStep: "Check-in da proposta", nextFollowupAt: T });
  await opp(diego, { clientName: "Família Souza (DEMO)", contactName: "Roberto Souza", phone: "(11) 90000-1003", product: "plano_saude", lives: 4, estimatedValue: 3900, source: "site", stage: "documentos_pendentes", nextStep: "Receber documentos dos dependentes", nextFollowupAt: addDays(T, -5) });
  await opp(diego, { clientName: "Logística Gama Ltda. (DEMO)", contactName: "Fernanda Alves", product: "plano_saude", lives: 140, estimatedValue: 118000, currentInsurer: "Bradesco Saúde", quotedInsurers: ["SulAmérica Saúde", "Porto Saúde", "Amil"], source: "campanha", campaignId: campId, stage: "cotacao_em_andamento", nextStep: "Cobrar retorno das operadoras", nextFollowupAt: addDays(T, 2) });
  await opp(head, { clientName: "Clínica Delta Odonto (DEMO)", contactName: "Dra. Lúcia Prado", product: "vida", lives: 32, estimatedValue: 2100, source: "carteira", stage: "em_negociacao", nextStep: "Ajustar capital segurado", nextFollowupAt: addDays(T, 1) });
  await opp(bruna, { clientName: "Padaria Ômega (DEMO)", contactName: "Sr. Antônio", product: "plano_saude", lives: 6, estimatedValue: 4800, source: "indicacao", stage: "fechado" }, 3);
  await opp(diego, { clientName: "Tech Sigma Software (DEMO)", contactName: "Camila Torres", product: "plano_saude", lives: 48, estimatedValue: 39500, source: "campanha", campaignId: campId, stage: "implantado" }, 40);
  await opp(head, { clientName: "Metalúrgica Épsilon (DEMO)", product: "beneficios", lives: 210, estimatedValue: 9800, source: "prospeccao_ativa", stage: "fechado" }, 70);
  await opp(diego, { clientName: "Comércio Zeta (DEMO)", product: "plano_saude", lives: 22, estimatedValue: 17600, source: "redes_sociais", stage: "perdido", lostReason: "Preço" }, 12);
  await opp(bruna, { clientName: "Startup Kappa (DEMO)", contactName: "Rafael Nogueira", product: "plano_saude", lives: 12, estimatedValue: 9100, source: "site", stage: "lead_novo", nextStep: "Fazer o primeiro contato", nextFollowupAt: T });

  const questions = defaultQuestions().map((q) => {
    const answers: Record<string, [string, "recebida" | "pendente"]> = {
      objetivo: ["Reduzir o custo do plano sem perder o Hospital Albert Einstein", "recebida"],
      possui_plano: ["Sim, empresarial", "recebida"],
      operadora_atual: ["Amil", "recebida"],
      valor_atual: ["", "pendente"],
      vidas: ["85 vidas (60 titulares e 25 dependentes)", "recebida"],
      acomodacao: ["Apartamento para diretoria, enfermaria para os demais", "recebida"],
      prazo_decisao: ["Até o fim do mês", "recebida"],
      decisor: ["Diretor financeiro (Marcos)", "recebida"],
      docs_pendentes: ["Fatura atual e relação de vidas", "pendente"],
    };
    const a = answers[q.key];
    return a ? { ...q, asked: true, status: a[1], answer: a[0] } : q;
  });
  const meetingId = await saveMeeting(
    null,
    meetingSchema.parse({
      title: "Diagnóstico — Construtora Alfa",
      opportunityId: alfa.id,
      clientName: "Marcos Lima",
      companyName: "Construtora Alfa (DEMO)",
      advisorName: "Ana Ribeiro",
      salesRepName: "Bruna Costa",
      ownerId: bruna.id,
      date: addDays(T, -1),
      startTime: "10:00",
      endTime: "11:00",
      participants: "Marcos Lima (Diretor financeiro), Carla (RH)",
      location: "https://meet.exemplo.invalid/alfa",
      objective: "Entender a necessidade e coletar os dados para cotação",
      summary: "Cliente insatisfeito com o último reajuste (22%). Quer manter o Einstein para a diretoria.",
      status: "realizada",
      questions,
      actions: [
        { text: "Enviar fatura atual e relação de vidas", owner: "Marcos (cliente)", dueDate: addDays(T, 2), done: false },
        { text: "Cotar SulAmérica, Porto e Bradesco", owner: "Bruna", dueDate: addDays(T, 5), done: false },
      ],
    }),
    bruna,
  );
  await generateMeetingOutputs(meetingId, { createTask: true }, bruna);
  await saveMeeting(
    null,
    meetingSchema.parse({ title: "Apresentação da proposta — Escritório Beta", clientName: "Juliana Reis", companyName: "Escritório Beta Advocacia (DEMO)", ownerId: bruna.id, date: addDays(T, 1), startTime: "15:00", endTime: "15:45", location: "Presencial — Av. Paulista, 1000", objective: "Apresentar o comparativo de plano dental", questions: defaultQuestions() }),
    bruna,
  );
  await saveEvent(null, eventSchema.parse({ title: "Ligação — Startup Kappa", type: "ligacao", date: T, startTime: "16:30", endTime: "16:45", clientName: "Rafael Nogueira", salesRepName: "Bruna Costa", ownerId: bruna.id, reminderMinutes: 10 }), bruna);
  await createTask(taskSchema.parse({ title: "Divulgar a campanha do mês no LinkedIn", priority: "media", dueDate: addDays(T, 1), category: "campanha", campaignId: campId }), head);
  console.log("Seed comercial concluído (CRM, reuniões, campanha e hierarquia).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
