import { z } from "zod";
import {
  ACCOMMODATIONS,
  COVERAGE_AREAS,
  CONTRIBUTION_TYPES,
  COPAY_PROCEDURES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  EVENT_STATUSES,
  EVENT_TYPES,
  INSURER_KINDS,
  INSURER_QUOTE_STATUSES,
  MANUAL_INTERACTION_TYPES,
  MODALITIES,
  PENDENCY_CATEGORIES,
  PENDENCY_STATUSES,
  PRIORITIES,
  PROCESS_TYPES,
  QUOTATION_STATUSES,
  RECURRENCES,
  RENEWAL_STATUSES,
  ROLES,
  TASK_CATEGORIES,
  TASK_STATUSES,
  UFS,
  CHECKLIST_STATUSES,
} from "@/lib/domain/constants";
import { EDITORIAL_PLATFORMS, POSTING_FREQUENCIES } from "@/lib/domain/editorial-calendar";
import {
  CAROUSEL_ACCENTS,
  CAROUSEL_DEFAULT_SLIDES,
  CAROUSEL_LIMITS,
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_MIN_SLIDES,
  CAROUSEL_PALETTES,
  CAROUSEL_PHOTO_MAX_CHARS,
  SLIDE_KINDS,
  normalizeHandle,
  normalizeKeyword,
} from "@/lib/domain/instagram-carousel";
import { SPECIAL_CASE_KINDS } from "@/lib/domain/special-cases";
import {
  ANSWER_STATUSES,
  ANSWER_TOPICS,
  CAMPAIGN_STATUSES,
  CHANNELS,
  LEAD_SOURCES,
  LIBRARY_KINDS,
  MEETING_STATUSES,
  MESSAGE_CATEGORIES,
  MESSAGE_CHANNELS,
  OPPORTUNITY_STAGES,
  PRODUCTS,
} from "@/lib/domain/commercial";
import { enumOf, optBool, optCnpj, optDate, optEmail, optEnum, optNum, optStr, optUuid, reqCnpj, reqDate, reqNum, reqStr, uuid } from "./fields";

// ─── Empresas ───
export const companySchema = z.object({
  legalName: reqStr("Razão social"),
  tradeName: optStr(200),
  mainCnpj: optCnpj("CNPJ principal"),
  economicGroup: optStr(200),
  segment: optStr(120),
  estimatedLives: optNum({ min: 0, max: 1_000_000, int: true, label: "Vidas estimadas" }),
  address: optStr(300),
  city: optStr(120),
  uf: optEnum(UFS),
  ownerId: optUuid(),
  origin: optStr(120),
  notes: optStr(5000),
  isClient: optBool().transform((v) => v ?? false),
});
export type CompanyInput = z.input<typeof companySchema>;

export const companyCnpjSchema = z.object({
  companyId: uuid(),
  cnpj: reqCnpj(),
  legalName: optStr(200),
  isMain: optBool().transform((v) => v ?? false),
  notes: optStr(500),
});

export const contactSchema = z.object({
  companyId: uuid(),
  name: reqStr("Nome"),
  roleTitle: optStr(120),
  email: optEmail(),
  phone: optStr(40),
  whatsapp: optStr(40),
  isPrimary: optBool().transform((v) => v ?? false),
  notes: optStr(2000),
});

export const contractPlanSchema = z.object({
  id: optUuid(),
  planName: reqStr("Nome do plano"),
  lives: optNum({ min: 0, int: true, label: "Vidas" }),
  monthlyCost: optNum({ min: 0, label: "Custo mensal" }),
  costPerLife: optNum({ min: 0, label: "Custo por vida" }),
  consultationReimbursement: optNum({ min: 0, label: "Reembolso de consulta" }),
  notes: optStr(500),
});

export const contractSchema = z
  .object({
    companyId: uuid(),
    insurerId: optUuid(),
    insurerName: optStr(200),
    contractNumber: optStr(80),
    startDate: optDate("Início da vigência"),
    endDate: optDate("Fim da vigência"),
    anniversaryDate: optDate("Data de aniversário"),
    contractingType: optStr(120),
    modality: optEnum(MODALITIES),
    paymentMethod: optStr(200),
    remission: optStr(500),
    upgradeDowngradeRules: optStr(2000),
    adjustmentIndex: optStr(200),
    breakEven: optNum({ min: 0, max: 200, label: "Break-even" }),
    commissionPct: optNum({ min: 0, max: 100, label: "Comissão" }),
    lossRatioPct: optNum({ min: 0, max: 1000, label: "Sinistralidade" }),
    notes: optStr(2000),
    plans: z.array(contractPlanSchema).max(50).default([]),
  })
  .refine((v) => !!v.insurerId || !!v.insurerName, { message: "Informe a operadora/seguradora", path: ["insurerName"] })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { message: "Fim da vigência anterior ao início", path: ["endDate"] });
export type ContractInput = z.input<typeof contractSchema>;

// ─── Cotações ───
export const quotationStep1Schema = z
  .object({
    companyId: uuid(),
    processType: enumOf(PROCESS_TYPES, "Tipo do processo"),
    stipulantName: optStr(200),
    cnpjs: z.array(reqCnpj()).max(200).default([]),
    estimatedLives: reqNum("Número estimado de vidas", { min: 1, max: 1_000_000, int: true }),
    reason: optStr(2000),
    openedAt: reqDate("Data de abertura"),
    targetDate: optDate("Data-alvo"),
    renewalDate: optDate("Data de renovação"),
    ownerId: optUuid(),
    priority: enumOf(PRIORITIES, "Prioridade"),
  })
  .refine((v) => !v.targetDate || v.targetDate >= v.openedAt, { message: "Data-alvo anterior à abertura", path: ["targetDate"] });
export type QuotationStep1Input = z.input<typeof quotationStep1Schema>;

export const quotationStep2Schema = z
  .object({
    modality: optEnum(MODALITIES),
    takeover: optBool(),
    fgts100: optBool(),
    dependents100: optBool(),
    paymentMethod: optStr(200),
    remission: optStr(500),
    adjustmentIndex: optStr(200),
    breakEven: optNum({ min: 0, max: 200, label: "Break-even" }),
    upgradeDowngradeRules: optStr(2000),
    commissionPct: optNum({ min: 0, max: 100, label: "Comissão" }),
    designChange: optBool(),
    designChangeDetails: optStr(3000),
    accommodation: optEnum(ACCOMMODATIONS),
    coverageArea: optEnum(COVERAGE_AREAS),
    holdersCount: optNum({ min: 0, max: 1_000_000, int: true, label: "Titulares" }),
    dependentsCount: optNum({ min: 0, max: 1_000_000, int: true, label: "Dependentes" }),
    desiredStartDate: optDate("Data desejada para início"),
    clientDeadline: optDate("Prazo esperado pelo cliente"),
  })
  .refine((v) => v.designChange !== true || !!v.designChangeDetails, {
    message: "Detalhe a alteração do desenho atual",
    path: ["designChangeDetails"],
  });
export type QuotationStep2Input = z.input<typeof quotationStep2Schema>;

export const quotationStep3Schema = z
  .object({
    employeeContributionType: optEnum(CONTRIBUTION_TYPES),
    employeeContributionValue: optNum({ min: 0, label: "Contribuição do funcionário" }),
    dependentContributionType: optEnum(CONTRIBUTION_TYPES),
    dependentContributionValue: optNum({ min: 0, label: "Contribuição do dependente" }),
    hasCopay: optBool(),
    copayPct: optNum({ min: 0, max: 100, label: "Percentual de coparticipação" }),
    copayProcedures: z.array(z.enum(COPAY_PROCEDURES)).default([]),
    copayOther: optStr(500),
    copayNotes: optStr(3000),
  })
  .refine((v) => v.employeeContributionType !== "percentual" || v.employeeContributionValue === null || v.employeeContributionValue <= 100, {
    message: "Contribuição percentual deve estar entre 0% e 100%",
    path: ["employeeContributionValue"],
  })
  .refine((v) => v.dependentContributionType !== "percentual" || v.dependentContributionValue === null || v.dependentContributionValue <= 100, {
    message: "Contribuição percentual deve estar entre 0% e 100%",
    path: ["dependentContributionValue"],
  })
  .refine((v) => v.hasCopay !== true || v.copayPct !== null, { message: "Informe o percentual de coparticipação", path: ["copayPct"] })
  .refine((v) => v.hasCopay !== true || v.copayProcedures.length > 0, {
    message: "Selecione ao menos um procedimento com coparticipação",
    path: ["copayProcedures"],
  })
  .refine((v) => !v.copayProcedures.includes("outros") || !!v.copayOther, { message: "Descreva os outros procedimentos", path: ["copayOther"] });
export type QuotationStep3Input = z.input<typeof quotationStep3Schema>;

export const quotationHeaderSchema = z.object({
  stipulantName: optStr(200),
  estimatedLives: reqNum("Número estimado de vidas", { min: 1, max: 1_000_000, int: true }),
  reason: optStr(2000),
  targetDate: optDate("Data-alvo"),
  renewalDate: optDate("Data de renovação"),
  ownerId: optUuid(),
  priority: enumOf(PRIORITIES, "Prioridade"),
  notes: optStr(5000),
});

export const statusChangeSchema = z.object({
  quotationId: uuid(),
  toStatus: enumOf(QUOTATION_STATUSES, "Status"),
  note: optStr(2000),
  overrideReason: optStr(2000),
  lostReason: optStr(2000),
});

export const checklistItemUpdateSchema = z.object({
  id: uuid(),
  status: enumOf(CHECKLIST_STATUSES, "Status"),
  sentBy: optStr(200),
  notes: optStr(2000),
  documentId: optUuid(),
  requestedAt: optDate("Data da solicitação"),
  receivedAt: optDate("Data de recebimento"),
});

export const specialCaseSummarySchema = z.object({
  quotationId: uuid(),
  kind: z.enum(SPECIAL_CASE_KINDS),
  has: optBool(),
  quantity: optNum({ min: 0, max: 100_000, int: true, label: "Quantidade" }),
  details: z.record(z.string(), z.unknown()).default({}),
  notes: optStr(3000),
});

// ─── Documentos ───
export const documentMetaSchema = z.object({
  quotationId: optUuid(),
  companyId: optUuid(),
  taskId: optUuid(),
  docType: enumOf(DOCUMENT_TYPES, "Tipo de documento"),
  referenceDate: optDate("Data de referência"),
  sender: optStr(200),
  status: enumOf(DOCUMENT_STATUSES, "Status").default("recebido"),
  notes: optStr(2000),
});

export const documentUpdateSchema = z.object({
  id: uuid(),
  docType: enumOf(DOCUMENT_TYPES, "Tipo de documento"),
  referenceDate: optDate("Data de referência"),
  sender: optStr(200),
  status: enumOf(DOCUMENT_STATUSES, "Status"),
  notes: optStr(2000),
});

// ─── Operadoras e propostas ───
export const insurerSchema = z.object({
  name: reqStr("Nome"),
  kind: enumOf(INSURER_KINDS, "Tipo"),
  ansCode: optStr(20),
  contactName: optStr(200),
  email: optEmail(),
  phone: optStr(40),
  followupDays: optNum({ min: 1, max: 60, int: true, label: "Prazo de follow-up" }),
  active: optBool().transform((v) => v ?? true),
  notes: optStr(2000),
});

export const quotationInsurerSchema = z.object({
  id: uuid(),
  status: enumOf(INSURER_QUOTE_STATUSES, "Status"),
  protocol: optStr(120),
  insurerContact: optStr(200),
  insurerEmail: optEmail(),
  expectedReturnAt: optDate("Data prevista de retorno"),
  pendingNotes: optStr(3000),
  nextFollowupAt: optDate("Próximo follow-up"),
  filesSent: optStr(2000),
  commissionPct: optNum({ min: 0, max: 100, label: "Comissão" }),
  adminFeePct: optNum({ min: 0, max: 100, label: "Taxa administrativa" }),
  specialConditions: optStr(3000),
  declineReason: optStr(2000),
  notes: optStr(3000),
});

export const sendToInsurerSchema = z.object({
  id: uuid(),
  sentAt: reqDate("Data de envio"),
  protocol: optStr(120),
  expectedReturnAt: optDate("Data prevista de retorno"),
  filesSent: optStr(2000),
});

export const followupSchema = z.object({
  quotationInsurerId: uuid(),
  channel: enumOf(["email", "telefone", "whatsapp", "reuniao", "portal"] as const, "Canal"),
  notes: optStr(2000),
  nextFollowupAt: optDate("Próximo follow-up"),
});

export const proposalPlanSchema = z.object({
  productName: reqStr("Produto/plano"),
  network: optStr(500),
  coverage: optStr(200),
  accommodation: optStr(100),
  copay: optStr(300),
  reimbursement: optNum({ min: 0, label: "Reembolso" }),
  monthlyValue: optNum({ min: 0, label: "Valor mensal" }),
  currentCost: optNum({ min: 0, label: "Custo atual" }),
  lives: optNum({ min: 0, int: true, label: "Vidas" }),
  waitingPeriods: optStr(500),
  commercialConditions: optStr(1000),
  notes: optStr(1000),
});

export const proposalSchema = z
  .object({
    id: optUuid(),
    quotationInsurerId: uuid(),
    receivedAt: reqDate("Data da proposta"),
    validUntil: optDate("Validade"),
    commissionPct: optNum({ min: 0, max: 100, label: "Comissão" }),
    adminFeePct: optNum({ min: 0, max: 100, label: "Taxa administrativa" }),
    commercialConditions: optStr(3000),
    notes: optStr(3000),
    documentId: optUuid(),
    plans: z.array(proposalPlanSchema).min(1, "Inclua ao menos um produto/plano").max(30),
  })
  .refine((v) => !v.validUntil || v.validUntil >= v.receivedAt, { message: "Validade anterior à data da proposta", path: ["validUntil"] });
export type ProposalInput = z.input<typeof proposalSchema>;

// ─── Produtividade ───
export const taskSchema = z
  .object({
    title: reqStr("Título", 300),
    description: optStr(5000),
    companyId: optUuid(),
    quotationId: optUuid(),
    insurerId: optUuid(),
    opportunityId: optUuid(),
    meetingId: optUuid(),
    campaignId: optUuid(),
    ownerId: optUuid(),
    priority: enumOf(PRIORITIES, "Prioridade"),
    scheduledDate: optDate("Data"),
    scheduledTime: z
      .union([z.string(), z.null()])
    .optional()
      .transform((v) => (v && v.trim() ? v.trim().slice(0, 5) : null))
      .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), { message: "Hora inválida" }),
    dueDate: optDate("Prazo"),
    status: enumOf(TASK_STATUSES, "Status").default("a_fazer"),
    category: enumOf(TASK_CATEGORIES, "Categoria"),
    checklist: z.array(z.object({ text: z.string().trim().min(1).max(300), done: z.boolean() })).max(50).default([]),
    notes: optStr(5000),
    recurrence: enumOf(RECURRENCES, "Recorrência").default("nenhuma"),
    recurrenceUntil: optDate("Repetir até"),
    reminderAt: z
      .union([z.string(), z.null()])
    .optional()
      .transform((v) => (v && v.trim() ? v.trim() : null))
      .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { message: "Lembrete inválido" }),
  })
  .refine((v) => v.recurrence === "nenhuma" || !!v.dueDate || !!v.scheduledDate, {
    message: "Tarefas recorrentes precisam de data ou prazo",
    path: ["dueDate"],
  });
export type TaskInput = z.input<typeof taskSchema>;

export const completeTaskSchema = z.object({
  id: uuid(),
  nextAction: optStr(300),
  nextActionDate: optDate("Data da próxima ação"),
  nextActionOwnerId: optUuid(),
});

export const eventSchema = z
  .object({
    title: reqStr("Título", 300),
    type: enumOf(EVENT_TYPES, "Tipo"),
    date: reqDate("Data"),
    startTime: optStr(5),
    endTime: optStr(5),
    allDay: optBool().transform((v) => v ?? false),
    location: optStr(300),
    description: optStr(3000),
    companyId: optUuid(),
    quotationId: optUuid(),
    insurerId: optUuid(),
    taskId: optUuid(),
    ownerId: optUuid(),
    opportunityId: optUuid(),
    status: enumOf(EVENT_STATUSES, "Status").default("agendado"),
    clientName: optStr(200),
    advisorName: optStr(150),
    salesRepName: optStr(150),
    reminderMinutes: optNum({ min: 0, max: 10080, int: true, label: "Lembrete" }).transform((v) => v ?? 0),
  })
  .refine((v) => v.allDay || (!!v.startTime && /^\d{2}:\d{2}$/.test(v.startTime)), { message: "Informe o horário de início", path: ["startTime"] })
  .refine((v) => v.allDay || !v.endTime || !v.startTime || v.endTime >= v.startTime, { message: "Término antes do início", path: ["endTime"] });
export type EventInput = z.input<typeof eventSchema>;

export const renewalSchema = z.object({
  companyId: uuid(),
  contractId: optUuid(),
  insurerId: optUuid(),
  insurerName: optStr(200),
  lives: optNum({ min: 0, int: true, label: "Vidas" }),
  anniversaryDate: reqDate("Data de aniversário"),
  adjustmentReceivedPct: optNum({ min: -100, max: 500, label: "Reajuste recebido" }),
  lossRatioPct: optNum({ min: 0, max: 1000, label: "Sinistralidade" }),
  status: enumOf(RENEWAL_STATUSES, "Status").default("a_iniciar"),
  ownerId: optUuid(),
  quotationId: optUuid(),
  notes: optStr(3000),
});
export type RenewalInput = z.input<typeof renewalSchema>;

export const pendencySchema = z.object({
  category: enumOf(PENDENCY_CATEGORIES, "Categoria"),
  title: reqStr("Título", 300),
  description: optStr(3000),
  companyId: optUuid(),
  quotationId: optUuid(),
  ownerId: optUuid(),
  dueDate: optDate("Prazo"),
  priority: enumOf(PRIORITIES, "Prioridade"),
  status: enumOf(PENDENCY_STATUSES, "Status").default("aberta"),
  nextAction: optStr(500),
});

export const interactionSchema = z.object({
  companyId: optUuid(),
  quotationId: optUuid(),
  type: z.enum(MANUAL_INTERACTION_TYPES as unknown as [string, ...string[]], { error: "Tipo inválido" }),
  occurredAt: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { message: "Data/hora inválida" }),
  description: reqStr("Descrição", 5000),
  nextAction: optStr(300),
  nextActionAt: optDate("Data da próxima ação"),
  createTask: optBool(),
});

// ─── Administração ───
export const userSchema = z.object({
  id: optUuid(),
  name: reqStr("Nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: enumOf(ROLES, "Papel"),
  supervisorId: optUuid(),
  active: optBool().transform((v) => v ?? true),
  password: optStr(200).refine((v) => v === null || v.length >= 10, { message: "A senha deve ter ao menos 10 caracteres" }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export const templateSchema = z.object({
  id: uuid(),
  name: reqStr("Nome"),
  subject: optStr(300),
  body: reqStr("Corpo", 10000),
  active: optBool().transform((v) => v ?? true),
});

export const checklistTemplateSchema = z.object({
  id: optUuid(),
  processType: enumOf(PROCESS_TYPES, "Tipo"),
  itemKey: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{2,60}$/, "Chave: use letras minúsculas, números e _"),
  label: reqStr("Rótulo", 300),
  category: reqStr("Categoria", 60),
  required: optBool().transform((v) => v ?? false),
  condition: z.string().trim().default("always"),
  autoSource: optStr(200),
  documentType: optStr(60),
  requestText: optStr(1000),
  sortOrder: optNum({ int: true, label: "Ordem" }).transform((v) => v ?? 0),
  active: optBool().transform((v) => v ?? true),
});

export const playbookEntrySchema = z.object({
  id: uuid(),
  title: reqStr("Título", 200),
  subtitle: optStr(300),
  objective: optStr(1000),
  body: reqStr("Conteúdo", 20000),
  active: optBool().transform((v) => v ?? true),
});

// ─── Comercial: CRM, reuniões, campanhas, biblioteca ───
const timeHHMM = (label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().slice(0, 5) : null))
    .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), { message: `${label} inválida` });

const nameList = (max = 20) =>
  z
    .union([z.array(z.string()), z.string(), z.null()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : (v ?? "").split(/[,;\n]/)).map((s) => s.trim()).filter(Boolean).slice(0, max));

export const opportunitySchema = z.object({
  clientName: reqStr("Nome do cliente ou empresa", 200),
  companyId: optUuid(),
  document: optStr(30).refine((v) => v === null || /^[\d./-]{11,20}$/.test(v), { message: "CPF/CNPJ: use apenas números, ponto, barra e hífen" }),
  contactName: optStr(150),
  phone: optStr(40),
  email: optEmail(),
  product: enumOf(PRODUCTS, "Produto"),
  lives: optNum({ min: 0, max: 1_000_000, int: true, label: "Quantidade de vidas" }),
  estimatedValue: optNum({ min: 0, max: 1_000_000_000, label: "Valor estimado" }),
  currentInsurer: optStr(150),
  quotedInsurers: nameList(),
  brokerId: optUuid(),
  advisorName: optStr(150),
  salesRepName: optStr(150),
  source: enumOf(LEAD_SOURCES, "Origem do lead"),
  campaignId: optUuid(),
  stage: enumOf(OPPORTUNITY_STAGES, "Etapa").default("lead_novo"),
  nextStep: optStr(500),
  nextFollowupAt: optDate("Data do próximo follow-up"),
  lostReason: optStr(500),
  quotationId: optUuid(),
  notes: optStr(5000),
});
export type OpportunityInput = z.input<typeof opportunitySchema>;

export const opportunityStageSchema = z.object({
  id: uuid(),
  stage: enumOf(OPPORTUNITY_STAGES, "Etapa"),
  note: optStr(1000),
  lostReason: optStr(500),
  nextFollowupAt: optDate("Data do próximo follow-up"),
});

export const opportunityFollowupSchema = z.object({
  id: uuid(),
  nextStep: optStr(500),
  nextFollowupAt: optDate("Data do próximo follow-up"),
});

const meetingQuestionSchema = z.object({
  key: z.string().trim().min(1).max(60),
  text: z.string().trim().min(1, "Pergunta vazia").max(300),
  asked: z.boolean(),
  status: z.enum(ANSWER_STATUSES),
  answer: z.string().max(2000).default(""),
  note: z.string().max(1000).default(""),
});
const meetingActionSchema = z.object({
  text: z.string().trim().min(1, "Descreva a ação").max(300),
  owner: z.string().trim().max(150).default(""),
  dueDate: optDate("Prazo da ação"),
  done: z.boolean().default(false),
});

export const meetingSchema = z
  .object({
    title: reqStr("Título", 200),
    opportunityId: optUuid(),
    companyId: optUuid(),
    quotationId: optUuid(),
    clientName: optStr(150),
    companyName: optStr(200),
    advisorName: optStr(150),
    salesRepName: optStr(150),
    ownerId: optUuid(),
    date: reqDate("Data da reunião"),
    startTime: timeHHMM("Hora de início"),
    endTime: timeHHMM("Hora de término"),
    participants: optStr(1000),
    location: optStr(500),
    objective: optStr(2000),
    summary: optStr(10000),
    status: enumOf(MEETING_STATUSES, "Status").default("agendada"),
    questions: z.array(meetingQuestionSchema).max(60).default([]),
    actions: z.array(meetingActionSchema).max(40).default([]),
    addToAgenda: optBool().transform((v) => v ?? true),
  })
  .refine((v) => !!v.clientName || !!v.companyName || !!v.companyId || !!v.opportunityId, { message: "Informe o cliente ou a empresa", path: ["clientName"] })
  .refine((v) => !v.endTime || !v.startTime || v.endTime >= v.startTime, { message: "Término antes do início", path: ["endTime"] });
export type MeetingInput = z.input<typeof meetingSchema>;

export const campaignSchema = z
  .object({
    name: reqStr("Nome da campanha", 200),
    product: enumOf(PRODUCTS, "Produto"),
    startDate: reqDate("Início"),
    endDate: reqDate("Fim"),
    audience: optStr(1000),
    goal: optStr(1000),
    goalLeads: optNum({ min: 0, max: 100000, int: true, label: "Meta de leads" }),
    goalSales: optNum({ min: 0, max: 100000, int: true, label: "Meta de vendas" }),
    goalValue: optNum({ min: 0, label: "Meta de valor" }),
    mainMessage: optStr(5000),
    channels: z.array(z.enum(CHANNELS)).max(CHANNELS.length).default([]),
    ownerId: optUuid(),
    responsibles: optStr(500),
    status: enumOf(CAMPAIGN_STATUSES, "Status").default("planejada"),
    remindersEnabled: optBool().transform((v) => v ?? true),
    results: optStr(5000),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "O fim deve ser igual ou posterior ao início", path: ["endDate"] });
export type CampaignInput = z.input<typeof campaignSchema>;

export const libraryItemSchema = z
  .object({
    kind: z.enum(LIBRARY_KINDS),
    category: reqStr("Categoria", 60),
    title: reqStr("Título", 200),
    channel: enumOf(MESSAGE_CHANNELS, "Canal").default("whatsapp"),
    subject: optStr(300),
    body: reqStr("Texto", 10000),
    active: optBool().transform((v) => v ?? true),
  })
  .refine((v) => (v.kind === "mensagem" ? (MESSAGE_CATEGORIES as readonly string[]).includes(v.category) : (ANSWER_TOPICS as readonly string[]).includes(v.category)), {
    message: "Categoria inválida",
    path: ["category"],
  });
export type LibraryItemInput = z.input<typeof libraryItemSchema>;

export const opportunityInteractionSchema = z.object({
  opportunityId: uuid(),
  type: z.enum(MANUAL_INTERACTION_TYPES as unknown as [string, ...string[]], { error: "Tipo inválido" }),
  description: reqStr("Descrição", 5000),
  nextAction: optStr(300),
  nextActionAt: optDate("Data da próxima ação"),
});

export const anonymizeSchema = z.object({
  contactIds: z.array(z.string().uuid()).max(200).default([]),
  opportunityIds: z.array(z.string().uuid()).max(200).default([]),
  meetingIds: z.array(z.string().uuid()).max(200).default([]),
});

export const editorialCalendarSchema = z.object({
  startDate: reqDate("Início do calendário"),
  niche: reqStr("Nicho/área", 200),
  platform: enumOf(EDITORIAL_PLATFORMS, "Plataforma"),
  audience: reqStr("Público-alvo", 500),
  frequency: enumOf(POSTING_FREQUENCIES, "Frequência"),
  pillars: optStr(500),
  objectives: optStr(1000),
  product: optStr(300),
  launchWeek: optNum({ min: 0, max: 4, int: true, label: "Semana do lançamento" }).transform((v) => v ?? 0),
  importantDates: optStr(2000),
});
export type EditorialCalendarFormInput = z.input<typeof editorialCalendarSchema>;

// ─── Carrossel para Instagram ───
const HANDLE_RE = /^@[\w.]{1,30}$/;
const handleField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => normalizeHandle(v ?? ""))
  .refine((v) => v === "" || HANDLE_RE.test(v), { message: "@ do perfil: use até 30 letras, números, ponto ou _" });
const keywordField = optStr(CAROUSEL_LIMITS.keyword)
  .transform((v) => (v === null ? null : normalizeKeyword(v)))
  .refine((v) => v === null || !/\s/.test(v), { message: "Palavra-chave: use uma palavra só" });

export const carouselBriefSchema = z.object({
  topic: reqStr("Tema", CAROUSEL_LIMITS.topic),
  audience: optStr(CAROUSEL_LIMITS.audience),
  slideCount: optNum({ min: CAROUSEL_MIN_SLIDES, max: CAROUSEL_MAX_SLIDES, int: true, label: "Quantidade de slides" }).transform((v) => v ?? CAROUSEL_DEFAULT_SLIDES),
  keyword: keywordField,
  brand: optStr(CAROUSEL_LIMITS.brand).transform((v) => v ?? ""),
  handle: handleField,
  palette: enumOf(CAROUSEL_PALETTES, "Paleta"),
  accent: enumOf(CAROUSEL_ACCENTS, "Cor de destaque"),
});
export type CarouselBriefInput = z.input<typeof carouselBriefSchema>;

const slideText = (label: string, max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length <= max, { message: `${label}: máximo de ${max} caracteres` });

export const carouselSlideSchema = z.object({
  kind: enumOf(SLIDE_KINDS, "Tipo de slide"),
  eyebrow: slideText("Rótulo", CAROUSEL_LIMITS.eyebrow),
  title: slideText("Título", CAROUSEL_LIMITS.title),
  highlight: slideText("Destaque", CAROUSEL_LIMITS.highlight),
  body: slideText("Texto", CAROUSEL_LIMITS.body),
  bullets: z
    .array(slideText("Item da lista", CAROUSEL_LIMITS.bullet))
    .max(CAROUSEL_LIMITS.bullets, { message: `Lista: máximo de ${CAROUSEL_LIMITS.bullets} itens` })
    .optional()
    .transform((v) => (v ?? []).filter(Boolean)),
  keyword: slideText("Palavra-chave", CAROUSEL_LIMITS.keyword).transform((v) => normalizeKeyword(v)),
});

export const carouselSchema = z.object({
  topic: slideText("Tema", CAROUSEL_LIMITS.topic),
  brand: slideText("Marca", CAROUSEL_LIMITS.brand),
  handle: handleField,
  palette: enumOf(CAROUSEL_PALETTES, "Paleta"),
  accent: enumOf(CAROUSEL_ACCENTS, "Cor de destaque"),
  slides: z
    .array(carouselSlideSchema)
    .min(CAROUSEL_MIN_SLIDES, { message: `O carrossel precisa de pelo menos ${CAROUSEL_MIN_SLIDES} slides` })
    .max(CAROUSEL_MAX_SLIDES, { message: `Máximo de ${CAROUSEL_MAX_SLIDES} slides` }),
  caption: slideText("Legenda", CAROUSEL_LIMITS.caption),
  photo: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || (v.length <= CAROUSEL_PHOTO_MAX_CHARS && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(v)), { message: "Foto da capa inválida ou grande demais" }),
});

export const carouselRenderSchema = z.object({
  carousel: carouselSchema,
  /** Slides a renderizar (vazio/ausente = todos). */
  indexes: z
    .array(z.number().int().min(0).max(CAROUSEL_MAX_SLIDES - 1))
    .max(CAROUSEL_MAX_SLIDES)
    .optional(),
});
