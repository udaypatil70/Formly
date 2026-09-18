CREATE TABLE IF NOT EXISTS "form_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"resume_token" varchar(128) NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb,
	"current_step" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "form_drafts" ADD CONSTRAINT "form_drafts_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "form_drafts" ADD CONSTRAINT "form_drafts_resume_token_unique" UNIQUE("resume_token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_drafts_form_id_idx" ON "form_drafts" USING btree ("form_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_drafts_resume_token_idx" ON "form_drafts" USING btree ("resume_token");
