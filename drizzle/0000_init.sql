CREATE TYPE "public"."checklist_status" AS ENUM('pendente', 'recebido', 'em_validacao', 'validado', 'dispensado');--> statement-breakpoint
CREATE TYPE "public"."contribution_type" AS ENUM('percentual', 'valor');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('recebido', 'pendente', 'invalido', 'desatualizado', 'validado');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('reuniao_cliente', 'reuniao_operadora', 'follow_up', 'apresentacao', 'renovacao', 'prazo_proposta', 'implantacao', 'tarefa_interna', 'outro');--> statement-breakpoint
CREATE TYPE "public"."insurer_kind" AS ENUM('operadora', 'seguradora');--> statement-breakpoint
CREATE TYPE "public"."insurer_quote_status" AS ENUM('nao_enviada', 'enviada', 'recebida_operadora', 'em_analise', 'pendencia', 'declinada', 'cotacao_recebida', 'em_negociacao', 'finalista', 'encerrada');--> statement-breakpoint
CREATE TYPE "public"."interaction_type" AS ENUM('ligacao', 'email', 'whatsapp', 'reuniao', 'nota', 'upload', 'status', 'tarefa', 'documento', 'proposta', 'cobranca', 'responsavel', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."modality" AS ENUM('opcional', 'compulsorio');--> statement-breakpoint
CREATE TYPE "public"."pendency_category" AS ENUM('cliente', 'operadora', 'documento', 'base_vidas', 'interna');--> statement-breakpoint
CREATE TYPE "public"."pendency_status" AS ENUM('aberta', 'em_andamento', 'resolvida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('baixa', 'media', 'alta', 'critica');--> statement-breakpoint
CREATE TYPE "public"."process_type" AS ENUM('NEW', 'RENEW');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('oportunidade', 'coleta_informacoes', 'aguardando_cliente', 'validando_documentacao', 'pendencia_documental', 'base_vidas_validacao', 'pronta_para_mercado', 'enviada_operadoras', 'em_analise_operadoras', 'pendencia_operadora', 'propostas_recebidas', 'montando_comparativo', 'apresentacao_cliente', 'negociacao', 'finalista', 'fechada_ganha', 'fechada_perdida', 'implantacao', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."recurrence" AS ENUM('nenhuma', 'diaria', 'semanal', 'quinzenal', 'mensal');--> statement-breakpoint
CREATE TYPE "public"."renewal_status" AS ENUM('a_iniciar', 'em_preparacao', 'documentacao', 'em_mercado', 'negociacao', 'renovada', 'migrada', 'perdida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'head', 'analista', 'comercial', 'leitura');--> statement-breakpoint
CREATE TYPE "public"."special_case_kind" AS ENUM('prestadores', 'demitidos_aposentados', 'liminares', 'gestantes', 'agregados', 'home_care', 'afastados', 'aposentados_invalidez', 'cronicos');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('a_fazer', 'em_andamento', 'aguardando_terceiro', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"changes" jsonb,
	"sensitive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'proposta' NOT NULL,
	"result" jsonb,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_rules_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"type" "event_type" DEFAULT 'outro' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"description" text,
	"company_id" uuid,
	"quotation_id" uuid,
	"insurer_id" uuid,
	"task_id" uuid,
	"owner_id" uuid,
	"external_provider" text,
	"external_id" text,
	"automation_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "calendar_events_automation_key_unique" UNIQUE("automation_key")
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"process_type" "process_type" NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"condition" text DEFAULT 'always' NOT NULL,
	"auto_source" text,
	"document_type" text,
	"request_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"main_cnpj" text,
	"economic_group" text,
	"segment" text,
	"estimated_lives" integer,
	"city" text,
	"uf" text,
	"owner_id" uuid,
	"origin" text,
	"notes" text,
	"is_client" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "company_cnpjs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"cnpj" text NOT NULL,
	"legal_name" text,
	"is_main" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role_title" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "current_contract_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"plan_name" text NOT NULL,
	"lives" integer,
	"monthly_cost" numeric(14, 2),
	"cost_per_life" numeric(14, 2),
	"consultation_reimbursement" numeric(14, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "current_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"insurer_id" uuid,
	"insurer_name" text,
	"contract_number" text,
	"start_date" date,
	"end_date" date,
	"anniversary_date" date,
	"contracting_type" text,
	"modality" "modality",
	"payment_method" text,
	"remission" text,
	"upgrade_downgrade_rules" text,
	"adjustment_index" text,
	"break_even" numeric(7, 3),
	"commission_pct" numeric(7, 3),
	"loss_ratio_pct" numeric(7, 3),
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "insurer_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_insurer_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"notes" text,
	"next_followup_at" date,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "insurer_kind" DEFAULT 'operadora' NOT NULL,
	"ans_code" text,
	"contact_name" text,
	"email" text,
	"phone" text,
	"followup_days" integer,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "insurers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"quotation_id" uuid,
	"type" "interaction_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"description" text NOT NULL,
	"next_action" text,
	"next_action_at" date,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "life_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"document_id" uuid,
	"file_name" text NOT NULL,
	"sheet_name" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"total_rows" integer NOT NULL,
	"valid_rows" integer NOT NULL,
	"error_rows" integer NOT NULL,
	"warning_rows" integer DEFAULT 0 NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"summary" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"company_name" text,
	"cnpj" text,
	"birth_date" date,
	"age" integer,
	"age_band" text,
	"holder_type" text,
	"kinship" text,
	"situation" text,
	"cid" text,
	"city" text,
	"uf" text,
	"insurer" text,
	"plan" text,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"audience" text NOT NULL,
	"channel" text NOT NULL,
	"tone" text,
	"subject" text,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pendencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "pendency_category" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"origin" text DEFAULT 'manual' NOT NULL,
	"source_key" text,
	"company_id" uuid,
	"quotation_id" uuid,
	"quotation_insurer_id" uuid,
	"document_id" uuid,
	"owner_id" uuid,
	"due_date" date,
	"priority" "priority" DEFAULT 'media' NOT NULL,
	"status" "pendency_status" DEFAULT 'aberta' NOT NULL,
	"next_action" text,
	"resolved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pendencies_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "proposal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"network" text,
	"coverage" text,
	"accommodation" text,
	"copay" text,
	"reimbursement" numeric(14, 2),
	"monthly_value" numeric(14, 2),
	"current_cost" numeric(14, 2),
	"lives" integer,
	"waiting_periods" text,
	"commercial_conditions" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"quotation_insurer_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"received_at" date NOT NULL,
	"valid_until" date,
	"commission_pct" numeric(7, 3),
	"admin_fee_pct" numeric(7, 3),
	"commercial_conditions" text,
	"notes" text,
	"document_id" uuid,
	"selected_for_presentation" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotation_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"required" boolean NOT NULL,
	"condition" text DEFAULT 'always' NOT NULL,
	"auto_source" text,
	"document_type" text,
	"request_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"applicable" boolean DEFAULT true NOT NULL,
	"status" "checklist_status" DEFAULT 'pendente' NOT NULL,
	"auto_filled" boolean DEFAULT false NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone,
	"sent_by" text,
	"received_at" timestamp with time zone,
	"notes" text,
	"document_id" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_cnpjs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"cnpj" text NOT NULL,
	"legal_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid,
	"company_id" uuid,
	"task_id" uuid,
	"doc_type" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text,
	"reference_date" date,
	"sender" text,
	"status" "document_status" DEFAULT 'recebido' NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"notes" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotation_insurers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"insurer_id" uuid NOT NULL,
	"status" "insurer_quote_status" DEFAULT 'nao_enviada' NOT NULL,
	"sent_at" timestamp with time zone,
	"protocol" text,
	"insurer_contact" text,
	"insurer_email" text,
	"expected_return_at" date,
	"pending_notes" text,
	"last_followup_at" timestamp with time zone,
	"next_followup_at" date,
	"files_sent" text,
	"commission_pct" numeric(7, 3),
	"admin_fee_pct" numeric(7, 3),
	"special_conditions" text,
	"decline_reason" text,
	"first_response_at" timestamp with time zone,
	"notes" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"from_status" "quotation_status",
	"to_status" "quotation_status" NOT NULL,
	"note" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"company_id" uuid NOT NULL,
	"process_type" "process_type" NOT NULL,
	"stipulant_name" text,
	"estimated_lives" integer NOT NULL,
	"reason" text,
	"opened_at" date NOT NULL,
	"target_date" date,
	"renewal_date" date,
	"owner_id" uuid,
	"priority" "priority" DEFAULT 'media' NOT NULL,
	"status" "quotation_status" DEFAULT 'oportunidade' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"wizard_step" integer DEFAULT 1 NOT NULL,
	"modality" "modality",
	"takeover" boolean,
	"fgts_100" boolean,
	"dependents_100" boolean,
	"payment_method" text,
	"remission" text,
	"adjustment_index" text,
	"break_even" numeric(7, 3),
	"upgrade_downgrade_rules" text,
	"commission_pct" numeric(7, 3),
	"design_change" boolean,
	"design_change_details" text,
	"employee_contribution_type" "contribution_type",
	"employee_contribution_value" numeric(14, 2),
	"dependent_contribution_type" "contribution_type",
	"dependent_contribution_value" numeric(14, 2),
	"has_copay" boolean,
	"copay_pct" numeric(7, 3),
	"copay_procedures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"copay_other" text,
	"copay_notes" text,
	"ready_override_reason" text,
	"ready_override_by" uuid,
	"ready_override_at" timestamp with time zone,
	"lost_reason" text,
	"notes" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quotations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "renewals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid,
	"insurer_id" uuid,
	"insurer_name" text,
	"lives" integer,
	"anniversary_date" date NOT NULL,
	"recommended_start_date" date,
	"adjustment_received_pct" numeric(7, 3),
	"loss_ratio_pct" numeric(7, 3),
	"status" "renewal_status" DEFAULT 'a_iniciar' NOT NULL,
	"owner_id" uuid,
	"quotation_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_case_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"kind" "special_case_kind" NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"kind" "special_case_kind" NOT NULL,
	"has" boolean,
	"quantity" integer,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"company_id" uuid,
	"quotation_id" uuid,
	"insurer_id" uuid,
	"quotation_insurer_id" uuid,
	"renewal_id" uuid,
	"owner_id" uuid,
	"priority" "priority" DEFAULT 'media' NOT NULL,
	"scheduled_date" date,
	"scheduled_time" time,
	"due_date" date,
	"status" "task_status" DEFAULT 'a_fazer' NOT NULL,
	"category" text DEFAULT 'outro' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"recurrence" "recurrence" DEFAULT 'nenhuma' NOT NULL,
	"recurrence_until" date,
	"reminder_at" timestamp with time zone,
	"reminder_sent_at" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"automation_key" text,
	"parent_task_id" uuid,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_automation_key_unique" UNIQUE("automation_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'analista' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_cnpjs" ADD CONSTRAINT "company_cnpjs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_contract_plans" ADD CONSTRAINT "current_contract_plans_contract_id_current_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."current_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_contracts" ADD CONSTRAINT "current_contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_contracts" ADD CONSTRAINT "current_contracts_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_contracts" ADD CONSTRAINT "current_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurer_followups" ADD CONSTRAINT "insurer_followups_quotation_insurer_id_quotation_insurers_id_fk" FOREIGN KEY ("quotation_insurer_id") REFERENCES "public"."quotation_insurers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurer_followups" ADD CONSTRAINT "insurer_followups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_imports" ADD CONSTRAINT "life_imports_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_imports" ADD CONSTRAINT "life_imports_document_id_quotation_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."quotation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "life_imports" ADD CONSTRAINT "life_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lives" ADD CONSTRAINT "lives_import_id_life_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."life_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lives" ADD CONSTRAINT "lives_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencies" ADD CONSTRAINT "pendencies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencies" ADD CONSTRAINT "pendencies_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencies" ADD CONSTRAINT "pendencies_quotation_insurer_id_quotation_insurers_id_fk" FOREIGN KEY ("quotation_insurer_id") REFERENCES "public"."quotation_insurers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencies" ADD CONSTRAINT "pendencies_document_id_quotation_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."quotation_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencies" ADD CONSTRAINT "pendencies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencies" ADD CONSTRAINT "pendencies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_plans" ADD CONSTRAINT "proposal_plans_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_quotation_insurer_id_quotation_insurers_id_fk" FOREIGN KEY ("quotation_insurer_id") REFERENCES "public"."quotation_insurers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_document_id_quotation_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."quotation_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_checklist_items" ADD CONSTRAINT "quotation_checklist_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_checklist_items" ADD CONSTRAINT "quotation_checklist_items_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_checklist_items" ADD CONSTRAINT "quotation_checklist_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_cnpjs" ADD CONSTRAINT "quotation_cnpjs_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_documents" ADD CONSTRAINT "quotation_documents_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_documents" ADD CONSTRAINT "quotation_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_documents" ADD CONSTRAINT "quotation_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_insurers" ADD CONSTRAINT "quotation_insurers_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_insurers" ADD CONSTRAINT "quotation_insurers_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_insurers" ADD CONSTRAINT "quotation_insurers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_ready_override_by_users_id_fk" FOREIGN KEY ("ready_override_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_contract_id_current_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."current_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_case_entries" ADD CONSTRAINT "special_case_entries_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_case_entries" ADD CONSTRAINT "special_case_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_cases" ADD CONSTRAINT "special_cases_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_cases" ADD CONSTRAINT "special_cases_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_insurer_id_insurers_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_quotation_insurer_id_quotation_insurers_id_fk" FOREIGN KEY ("quotation_insurer_id") REFERENCES "public"."quotation_insurers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_logs_created_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "assistant_messages_user_idx" ON "assistant_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "calendar_events_starts_idx" ON "calendar_events" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_templates_uq" ON "checklist_templates" USING btree ("process_type","item_key");--> statement-breakpoint
CREATE INDEX "companies_legal_name_idx" ON "companies" USING btree ("legal_name");--> statement-breakpoint
CREATE INDEX "companies_main_cnpj_idx" ON "companies" USING btree ("main_cnpj");--> statement-breakpoint
CREATE UNIQUE INDEX "company_cnpjs_company_cnpj_uq" ON "company_cnpjs" USING btree ("company_id","cnpj");--> statement-breakpoint
CREATE INDEX "company_cnpjs_cnpj_idx" ON "company_cnpjs" USING btree ("cnpj");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "current_contracts_company_idx" ON "current_contracts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "current_contracts_anniv_idx" ON "current_contracts" USING btree ("anniversary_date");--> statement-breakpoint
CREATE INDEX "insurer_followups_qi_idx" ON "insurer_followups" USING btree ("quotation_insurer_id");--> statement-breakpoint
CREATE INDEX "interactions_company_idx" ON "interactions" USING btree ("company_id","occurred_at");--> statement-breakpoint
CREATE INDEX "interactions_quotation_idx" ON "interactions" USING btree ("quotation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "life_imports_quotation_idx" ON "life_imports" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "lives_import_idx" ON "lives" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "lives_quotation_idx" ON "lives" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "pendencies_status_idx" ON "pendencies" USING btree ("status","category");--> statement-breakpoint
CREATE INDEX "pendencies_quotation_idx" ON "pendencies" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "proposals_quotation_idx" ON "proposals" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qci_quotation_key_uq" ON "quotation_checklist_items" USING btree ("quotation_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_cnpjs_uq" ON "quotation_cnpjs" USING btree ("quotation_id","cnpj");--> statement-breakpoint
CREATE INDEX "qdocs_quotation_idx" ON "quotation_documents" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "qdocs_company_idx" ON "quotation_documents" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_insurers_uq" ON "quotation_insurers" USING btree ("quotation_id","insurer_id");--> statement-breakpoint
CREATE INDEX "qsh_quotation_idx" ON "quotation_status_history" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "quotations_company_idx" ON "quotations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "quotations_status_idx" ON "quotations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotations_owner_idx" ON "quotations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "renewals_anniv_idx" ON "renewals" USING btree ("anniversary_date");--> statement-breakpoint
CREATE INDEX "sce_quotation_idx" ON "special_case_entries" USING btree ("quotation_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "special_cases_uq" ON "special_cases" USING btree ("quotation_id","kind");--> statement-breakpoint
CREATE INDEX "tasks_owner_status_idx" ON "tasks" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "tasks_due_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_quotation_idx" ON "tasks" USING btree ("quotation_id");