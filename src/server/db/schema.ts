/**
 * Modelo relacional (PostgreSQL). Documentação: docs/DATA_MODEL.md.
 * Convenções: uuid como PK, created_at/updated_at em toda entidade relevante,
 * created_by/updated_by onde há autoria, deleted_at para soft delete de registros comerciais.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  CHECKLIST_STATUSES,
  CONTRIBUTION_TYPES,
  DOCUMENT_STATUSES,
  EVENT_TYPES,
  INSURER_KINDS,
  INSURER_QUOTE_STATUSES,
  INTERACTION_TYPES,
  MODALITIES,
  PENDENCY_CATEGORIES,
  PENDENCY_STATUSES,
  PRIORITIES,
  PROCESS_TYPES,
  QUOTATION_STATUSES,
  RECURRENCES,
  RENEWAL_STATUSES,
  ROLES,
  TASK_STATUSES,
} from "@/lib/domain/constants";
import { SPECIAL_CASE_KINDS } from "@/lib/domain/special-cases";

export const roleEnum = pgEnum("user_role", ROLES);
export const processTypeEnum = pgEnum("process_type", PROCESS_TYPES);
export const priorityEnum = pgEnum("priority", PRIORITIES);
export const quotationStatusEnum = pgEnum("quotation_status", QUOTATION_STATUSES);
export const insurerQuoteStatusEnum = pgEnum("insurer_quote_status", INSURER_QUOTE_STATUSES);
export const checklistStatusEnum = pgEnum("checklist_status", CHECKLIST_STATUSES);
export const documentStatusEnum = pgEnum("document_status", DOCUMENT_STATUSES);
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const recurrenceEnum = pgEnum("recurrence", RECURRENCES);
export const eventTypeEnum = pgEnum("event_type", EVENT_TYPES);
export const interactionTypeEnum = pgEnum("interaction_type", INTERACTION_TYPES);
export const pendencyCategoryEnum = pgEnum("pendency_category", PENDENCY_CATEGORIES);
export const pendencyStatusEnum = pgEnum("pendency_status", PENDENCY_STATUSES);
export const renewalStatusEnum = pgEnum("renewal_status", RENEWAL_STATUSES);
export const modalityEnum = pgEnum("modality", MODALITIES);
export const contributionTypeEnum = pgEnum("contribution_type", CONTRIBUTION_TYPES);
export const insurerKindEnum = pgEnum("insurer_kind", INSURER_KINDS);
export const specialCaseKindEnum = pgEnum("special_case_kind", SPECIAL_CASE_KINDS);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const deletedAt = () => timestamp("deleted_at", { withTimezone: true });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const day = (name: string) => date(name, { mode: "string" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const pct = (name: string) => numeric(name, { precision: 7, scale: 3, mode: "number" });

// ───────────────────────────── Usuários e configuração ─────────────────────────────

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("analista"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Parâmetros configuráveis do sistema (faixas ANS, prazos, pesos, limites). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

// ───────────────────────────── Empresas ─────────────────────────────

export const companies = pgTable(
  "companies",
  {
    id: id(),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    mainCnpj: text("main_cnpj"),
    economicGroup: text("economic_group"),
    segment: text("segment"),
    estimatedLives: integer("estimated_lives"),
    city: text("city"),
    uf: text("uf"),
    ownerId: uuid("owner_id").references(() => users.id),
    origin: text("origin"),
    notes: text("notes"),
    isClient: boolean("is_client").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("companies_legal_name_idx").on(t.legalName), index("companies_main_cnpj_idx").on(t.mainCnpj)],
);

export const companyCnpjs = pgTable(
  "company_cnpjs",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    cnpj: text("cnpj").notNull(),
    legalName: text("legal_name"),
    isMain: boolean("is_main").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("company_cnpjs_company_cnpj_uq").on(t.companyId, t.cnpj), index("company_cnpjs_cnpj_idx").on(t.cnpj)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    roleTitle: text("role_title"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("contacts_company_idx").on(t.companyId)],
);

export const insurers = pgTable("insurers", {
  id: id(),
  name: text("name").notNull().unique(),
  kind: insurerKindEnum("kind").notNull().default("operadora"),
  ansCode: text("ans_code"),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  followupDays: integer("followup_days"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const currentContracts = pgTable(
  "current_contracts",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    insurerId: uuid("insurer_id").references(() => insurers.id),
    insurerName: text("insurer_name"),
    contractNumber: text("contract_number"),
    startDate: day("start_date"),
    endDate: day("end_date"),
    anniversaryDate: day("anniversary_date"),
    contractingType: text("contracting_type"),
    modality: modalityEnum("modality"),
    paymentMethod: text("payment_method"),
    remission: text("remission"),
    upgradeDowngradeRules: text("upgrade_downgrade_rules"),
    adjustmentIndex: text("adjustment_index"),
    breakEven: pct("break_even"),
    commissionPct: pct("commission_pct"),
    lossRatioPct: pct("loss_ratio_pct"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("current_contracts_company_idx").on(t.companyId), index("current_contracts_anniv_idx").on(t.anniversaryDate)],
);

export const currentContractPlans = pgTable("current_contract_plans", {
  id: id(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => currentContracts.id, { onDelete: "cascade" }),
  planName: text("plan_name").notNull(),
  lives: integer("lives"),
  monthlyCost: money("monthly_cost"),
  costPerLife: money("cost_per_life"),
  consultationReimbursement: money("consultation_reimbursement"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────────── Cotações ─────────────────────────────

export const quotations = pgTable(
  "quotations",
  {
    id: id(),
    code: text("code").notNull().unique(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    processType: processTypeEnum("process_type").notNull(),
    stipulantName: text("stipulant_name"),
    estimatedLives: integer("estimated_lives").notNull(),
    reason: text("reason"),
    openedAt: day("opened_at").notNull(),
    targetDate: day("target_date"),
    renewalDate: day("renewal_date"),
    ownerId: uuid("owner_id").references(() => users.id),
    priority: priorityEnum("priority").notNull().default("media"),
    status: quotationStatusEnum("status").notNull().default("oportunidade"),
    statusChangedAt: ts("status_changed_at").notNull().defaultNow(),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
    wizardStep: integer("wizard_step").notNull().default(1),
    // Etapa 2 — contrato / condições
    modality: modalityEnum("modality"),
    takeover: boolean("takeover"),
    fgts100: boolean("fgts_100"),
    dependents100: boolean("dependents_100"),
    paymentMethod: text("payment_method"),
    remission: text("remission"),
    adjustmentIndex: text("adjustment_index"),
    breakEven: pct("break_even"),
    upgradeDowngradeRules: text("upgrade_downgrade_rules"),
    commissionPct: pct("commission_pct"),
    designChange: boolean("design_change"),
    designChangeDetails: text("design_change_details"),
    // Etapa 3 — contribuição e coparticipação
    employeeContributionType: contributionTypeEnum("employee_contribution_type"),
    employeeContributionValue: numeric("employee_contribution_value", { precision: 14, scale: 2, mode: "number" }),
    dependentContributionType: contributionTypeEnum("dependent_contribution_type"),
    dependentContributionValue: numeric("dependent_contribution_value", { precision: 14, scale: 2, mode: "number" }),
    hasCopay: boolean("has_copay"),
    copayPct: pct("copay_pct"),
    copayProcedures: jsonb("copay_procedures").$type<string[]>().notNull().default([]),
    copayOther: text("copay_other"),
    copayNotes: text("copay_notes"),
    // Prontidão
    readyOverrideReason: text("ready_override_reason"),
    readyOverrideBy: uuid("ready_override_by").references(() => users.id),
    readyOverrideAt: ts("ready_override_at"),
    lostReason: text("lost_reason"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("quotations_company_idx").on(t.companyId),
    index("quotations_status_idx").on(t.status),
    index("quotations_owner_idx").on(t.ownerId),
  ],
);

export const quotationCnpjs = pgTable(
  "quotation_cnpjs",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    cnpj: text("cnpj").notNull(),
    legalName: text("legal_name"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("quotation_cnpjs_uq").on(t.quotationId, t.cnpj)],
);

export const quotationStatusHistory = pgTable(
  "quotation_status_history",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    fromStatus: quotationStatusEnum("from_status"),
    toStatus: quotationStatusEnum("to_status").notNull(),
    note: text("note"),
    changedBy: uuid("changed_by").references(() => users.id),
    changedAt: ts("changed_at").notNull().defaultNow(),
  },
  (t) => [index("qsh_quotation_idx").on(t.quotationId)],
);

export const checklistTemplates = pgTable(
  "checklist_templates",
  {
    id: id(),
    processType: processTypeEnum("process_type").notNull(),
    itemKey: text("item_key").notNull(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    required: boolean("required").notNull().default(true),
    condition: text("condition").notNull().default("always"),
    autoSource: text("auto_source"),
    documentType: text("document_type"),
    requestText: text("request_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("checklist_templates_uq").on(t.processType, t.itemKey)],
);

export const quotationChecklistItems = pgTable(
  "quotation_checklist_items",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    required: boolean("required").notNull(),
    condition: text("condition").notNull().default("always"),
    autoSource: text("auto_source"),
    documentType: text("document_type"),
    requestText: text("request_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    applicable: boolean("applicable").notNull().default(true),
    status: checklistStatusEnum("status").notNull().default("pendente"),
    autoFilled: boolean("auto_filled").notNull().default(false),
    requestedBy: uuid("requested_by").references(() => users.id),
    requestedAt: ts("requested_at"),
    sentBy: text("sent_by"),
    receivedAt: ts("received_at"),
    notes: text("notes"),
    documentId: uuid("document_id"),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("qci_quotation_key_uq").on(t.quotationId, t.itemKey)],
);

export const quotationDocuments = pgTable(
  "quotation_documents",
  {
    id: id(),
    quotationId: uuid("quotation_id").references(() => quotations.id),
    companyId: uuid("company_id").references(() => companies.id),
    taskId: uuid("task_id"),
    docType: text("doc_type").notNull(),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    referenceDate: day("reference_date"),
    sender: text("sender"),
    status: documentStatusEnum("status").notNull().default("recebido"),
    sensitive: boolean("sensitive").notNull().default(false),
    notes: text("notes"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("qdocs_quotation_idx").on(t.quotationId), index("qdocs_company_idx").on(t.companyId)],
);

// ───────────────────────────── Base de vidas ─────────────────────────────

export const lifeImports = pgTable(
  "life_imports",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => quotationDocuments.id),
    fileName: text("file_name").notNull(),
    sheetName: text("sheet_name").notNull(),
    mapping: jsonb("mapping").notNull(),
    totalRows: integer("total_rows").notNull(),
    validRows: integer("valid_rows").notNull(),
    errorRows: integer("error_rows").notNull(),
    warningRows: integer("warning_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    summary: jsonb("summary").notNull(),
    active: boolean("active").notNull().default(true),
    importedBy: uuid("imported_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("life_imports_quotation_idx").on(t.quotationId)],
);

export const lives = pgTable(
  "lives",
  {
    id: id(),
    importId: uuid("import_id")
      .notNull()
      .references(() => lifeImports.id, { onDelete: "cascade" }),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    companyName: text("company_name"),
    cnpj: text("cnpj"),
    birthDate: day("birth_date"),
    age: integer("age"),
    ageBand: text("age_band"),
    holderType: text("holder_type"),
    kinship: text("kinship"),
    situation: text("situation"),
    cid: text("cid"),
    city: text("city"),
    uf: text("uf"),
    insurer: text("insurer"),
    plan: text("plan"),
    issues: jsonb("issues").$type<{ field: string; level: "error" | "warning"; message: string }[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("lives_import_idx").on(t.importId), index("lives_quotation_idx").on(t.quotationId)],
);

// ───────────────────────────── Situações especiais ─────────────────────────────

export const specialCases = pgTable(
  "special_cases",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    kind: specialCaseKindEnum("kind").notNull(),
    has: boolean("has"),
    quantity: integer("quantity"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    notes: text("notes"),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("special_cases_uq").on(t.quotationId, t.kind)],
);

/**
 * Registros individuais de situações especiais. As entidades home_care_cases, injunction_cases e
 * dismissed_retired_cases são VIEWs tipadas sobre esta tabela (ver migration 0001_views.sql).
 */
export const specialCaseEntries = pgTable(
  "special_case_entries",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    kind: specialCaseKindEnum("kind").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sce_quotation_idx").on(t.quotationId, t.kind)],
);

// ───────────────────────────── Operadoras e propostas ─────────────────────────────

export const quotationInsurers = pgTable(
  "quotation_insurers",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    insurerId: uuid("insurer_id")
      .notNull()
      .references(() => insurers.id),
    status: insurerQuoteStatusEnum("status").notNull().default("nao_enviada"),
    sentAt: ts("sent_at"),
    protocol: text("protocol"),
    insurerContact: text("insurer_contact"),
    insurerEmail: text("insurer_email"),
    expectedReturnAt: day("expected_return_at"),
    pendingNotes: text("pending_notes"),
    lastFollowupAt: ts("last_followup_at"),
    nextFollowupAt: day("next_followup_at"),
    filesSent: text("files_sent"),
    commissionPct: pct("commission_pct"),
    adminFeePct: pct("admin_fee_pct"),
    specialConditions: text("special_conditions"),
    declineReason: text("decline_reason"),
    firstResponseAt: ts("first_response_at"),
    notes: text("notes"),
    statusChangedAt: ts("status_changed_at").notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("quotation_insurers_uq").on(t.quotationId, t.insurerId)],
);

export const insurerFollowups = pgTable(
  "insurer_followups",
  {
    id: id(),
    quotationInsurerId: uuid("quotation_insurer_id")
      .notNull()
      .references(() => quotationInsurers.id, { onDelete: "cascade" }),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    channel: text("channel").notNull().default("email"),
    notes: text("notes"),
    nextFollowupAt: day("next_followup_at"),
    userId: uuid("user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("insurer_followups_qi_idx").on(t.quotationInsurerId)],
);

export const proposals = pgTable(
  "proposals",
  {
    id: id(),
    quotationId: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    quotationInsurerId: uuid("quotation_insurer_id")
      .notNull()
      .references(() => quotationInsurers.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    receivedAt: day("received_at").notNull(),
    validUntil: day("valid_until"),
    commissionPct: pct("commission_pct"),
    adminFeePct: pct("admin_fee_pct"),
    commercialConditions: text("commercial_conditions"),
    notes: text("notes"),
    documentId: uuid("document_id").references(() => quotationDocuments.id),
    selectedForPresentation: boolean("selected_for_presentation").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("proposals_quotation_idx").on(t.quotationId)],
);

export const proposalPlans = pgTable("proposal_plans", {
  id: id(),
  proposalId: uuid("proposal_id")
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  productName: text("product_name").notNull(),
  network: text("network"),
  coverage: text("coverage"),
  accommodation: text("accommodation"),
  copay: text("copay"),
  reimbursement: money("reimbursement"),
  monthlyValue: money("monthly_value"),
  currentCost: money("current_cost"),
  lives: integer("lives"),
  waitingPeriods: text("waiting_periods"),
  commercialConditions: text("commercial_conditions"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ───────────────────────────── CRM / produtividade ─────────────────────────────

export const interactions = pgTable(
  "interactions",
  {
    id: id(),
    companyId: uuid("company_id").references(() => companies.id),
    quotationId: uuid("quotation_id").references(() => quotations.id),
    type: interactionTypeEnum("type").notNull(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    userId: uuid("user_id").references(() => users.id),
    description: text("description").notNull(),
    nextAction: text("next_action"),
    nextActionAt: day("next_action_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("interactions_company_idx").on(t.companyId, t.occurredAt),
    index("interactions_quotation_idx").on(t.quotationId, t.occurredAt),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    companyId: uuid("company_id").references(() => companies.id),
    quotationId: uuid("quotation_id").references(() => quotations.id),
    insurerId: uuid("insurer_id").references(() => insurers.id),
    quotationInsurerId: uuid("quotation_insurer_id").references(() => quotationInsurers.id, { onDelete: "set null" }),
    renewalId: uuid("renewal_id"),
    ownerId: uuid("owner_id").references(() => users.id),
    priority: priorityEnum("priority").notNull().default("media"),
    scheduledDate: day("scheduled_date"),
    scheduledTime: time("scheduled_time"),
    dueDate: day("due_date"),
    status: taskStatusEnum("status").notNull().default("a_fazer"),
    category: text("category").notNull().default("outro"),
    checklist: jsonb("checklist").$type<{ text: string; done: boolean }[]>().notNull().default([]),
    notes: text("notes"),
    recurrence: recurrenceEnum("recurrence").notNull().default("nenhuma"),
    recurrenceUntil: day("recurrence_until"),
    reminderAt: ts("reminder_at"),
    reminderSentAt: ts("reminder_sent_at"),
    source: text("source").notNull().default("manual"),
    automationKey: text("automation_key").unique(),
    parentTaskId: uuid("parent_task_id"),
    completedAt: ts("completed_at"),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index("tasks_owner_status_idx").on(t.ownerId, t.status),
    index("tasks_due_idx").on(t.dueDate),
    index("tasks_quotation_idx").on(t.quotationId),
  ],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: id(),
    title: text("title").notNull(),
    type: eventTypeEnum("type").notNull().default("outro"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at"),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    description: text("description"),
    companyId: uuid("company_id").references(() => companies.id),
    quotationId: uuid("quotation_id").references(() => quotations.id),
    insurerId: uuid("insurer_id").references(() => insurers.id),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id),
    externalProvider: text("external_provider"),
    externalId: text("external_id"),
    automationKey: text("automation_key").unique(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("calendar_events_starts_idx").on(t.startsAt)],
);

export const renewals = pgTable(
  "renewals",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    contractId: uuid("contract_id").references(() => currentContracts.id, { onDelete: "set null" }),
    insurerId: uuid("insurer_id").references(() => insurers.id),
    insurerName: text("insurer_name"),
    lives: integer("lives"),
    anniversaryDate: day("anniversary_date").notNull(),
    recommendedStartDate: day("recommended_start_date"),
    adjustmentReceivedPct: pct("adjustment_received_pct"),
    lossRatioPct: pct("loss_ratio_pct"),
    status: renewalStatusEnum("status").notNull().default("a_iniciar"),
    ownerId: uuid("owner_id").references(() => users.id),
    quotationId: uuid("quotation_id").references(() => quotations.id),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index("renewals_anniv_idx").on(t.anniversaryDate)],
);

export const pendencies = pgTable(
  "pendencies",
  {
    id: id(),
    category: pendencyCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    origin: text("origin").notNull().default("manual"),
    sourceKey: text("source_key").unique(),
    companyId: uuid("company_id").references(() => companies.id),
    quotationId: uuid("quotation_id").references(() => quotations.id, { onDelete: "cascade" }),
    quotationInsurerId: uuid("quotation_insurer_id").references(() => quotationInsurers.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => quotationDocuments.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => users.id),
    dueDate: day("due_date"),
    priority: priorityEnum("priority").notNull().default("media"),
    status: pendencyStatusEnum("status").notNull().default("aberta"),
    nextAction: text("next_action"),
    resolvedAt: ts("resolved_at"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("pendencies_status_idx").on(t.status, t.category), index("pendencies_quotation_idx").on(t.quotationId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.readAt),
    uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey),
  ],
);

/** Auditoria: criação, edição, exclusão lógica, status, downloads sensíveis, importações, lote. */
export const activityLogs = pgTable(
  "activity_logs",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    changes: jsonb("changes").$type<Record<string, unknown>>(),
    sensitive: boolean("sensitive").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("activity_logs_entity_idx").on(t.entityType, t.entityId), index("activity_logs_created_idx").on(t.createdAt)],
);

export const messageTemplates = pgTable("message_templates", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  audience: text("audience").notNull(),
  channel: text("channel").notNull(),
  tone: text("tone"),
  subject: text("subject"),
  body: text("body").notNull(),
  active: boolean("active").notNull().default(true),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const automationRules = pgTable("automation_rules", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  params: jsonb("params").$type<Record<string, number>>().notNull().default({}),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Histórico do assistente: perguntas, respostas e ações propostas/executadas. */
export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("assistant_messages_user_idx").on(t.userId, t.createdAt)],
);

export const assistantActions = pgTable("assistant_actions", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("proposta"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  decidedAt: ts("decided_at"),
  createdAt: createdAt(),
});

