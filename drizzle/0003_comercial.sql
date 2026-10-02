CREATE TYPE "public"."campaign_status" AS ENUM('planejada', 'ativa', 'pausada', 'finalizada');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('agendado', 'realizado', 'remarcado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('agendada', 'realizada', 'remarcada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('lead_novo', 'primeiro_contato', 'diagnostico', 'documentos_pendentes', 'cotacao_em_andamento', 'proposta_enviada', 'em_negociacao', 'aprovado', 'fechado', 'implantado', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."product" AS ENUM('plano_saude', 'dental', 'vida', 'seguro', 'consorcio', 'beneficios');--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'ligacao' BEFORE 'follow_up';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'envio_cotacao' BEFORE 'apresentacao';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'retorno_operadora' BEFORE 'apresentacao';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'pos_venda' BEFORE 'tarefa_interna';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'campanha' BEFORE 'tarefa_interna';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'supervisor' BEFORE 'analista';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'corretor' BEFORE 'leitura';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'assistente' BEFORE 'leitura';--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"product" "product" DEFAULT 'plano_saude' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"audience" text,
	"goal" text,
	"goal_leads" integer,
	"goal_sales" integer,
	"goal_value" numeric(14, 2),
	"main_message" text,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_id" uuid,
	"responsibles" text,
	"status" "campaign_status" DEFAULT 'planejada' NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"results" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source_key" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "library_items_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"opportunity_id" uuid,
	"company_id" uuid,
	"quotation_id" uuid,
	"client_name" text,
	"company_name" text,
	"advisor_name" text,
	"sales_rep_name" text,
	"owner_id" uuid,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"participants" text,
	"location" text,
	"objective" text,
	"summary" text,
	"status" "meeting_status" DEFAULT 'agendada' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"minutes" text,
	"followup_message" text,
	"minutes_generated_at" timestamp with time zone,
	"calendar_event_id" uuid,
	"followup_task_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" text NOT NULL,
	"company_id" uuid,
	"document" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"product" "product" DEFAULT 'plano_saude' NOT NULL,
	"lives" integer,
	"estimated_value" numeric(14, 2),
	"current_insurer" text,
	"quoted_insurers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"broker_id" uuid,
	"advisor_name" text,
	"sales_rep_name" text,
	"source" text DEFAULT 'outro' NOT NULL,
	"campaign_id" uuid,
	"stage" "opportunity_stage" DEFAULT 'lead_novo' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_step" text,
	"next_followup_at" date,
	"lost_reason" text,
	"quotation_id" uuid,
	"closed_at" timestamp with time zone,
	"notes" text,
	"anonymized_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "opportunity_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"from_stage" "opportunity_stage",
	"to_stage" "opportunity_stage" NOT NULL,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "status" "event_status" DEFAULT 'agendado' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "advisor_name" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "sales_rep_name" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "reminder_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "accommodation" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "coverage_area" text;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "holders_count" integer;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "dependents_count" integer;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "desired_start_date" date;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "client_deadline" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "meeting_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "supervisor_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_broker_id_users_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_period_idx" ON "campaigns" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "library_items_kind_idx" ON "library_items" USING btree ("kind","category");--> statement-breakpoint
CREATE INDEX "meetings_date_idx" ON "meetings" USING btree ("date");--> statement-breakpoint
CREATE INDEX "meetings_owner_idx" ON "meetings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "meetings_opportunity_idx" ON "meetings" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "opportunities_stage_idx" ON "opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "opportunities_broker_idx" ON "opportunities" USING btree ("broker_id");--> statement-breakpoint
CREATE INDEX "opportunities_followup_idx" ON "opportunities" USING btree ("next_followup_at");--> statement-breakpoint
CREATE INDEX "opportunities_campaign_idx" ON "opportunities" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "opportunity_stage_history_idx" ON "opportunity_stage_history" USING btree ("opportunity_id","created_at");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interactions_opportunity_idx" ON "interactions" USING btree ("opportunity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "tasks_opportunity_idx" ON "tasks" USING btree ("opportunity_id");