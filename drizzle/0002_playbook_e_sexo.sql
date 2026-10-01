CREATE TABLE "playbook_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"objective" text,
	"kind" text DEFAULT 'texto' NOT NULL,
	"body" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lives" ADD COLUMN "sex" text;--> statement-breakpoint
ALTER TABLE "playbook_entries" ADD CONSTRAINT "playbook_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_entries_uq" ON "playbook_entries" USING btree ("section","key");