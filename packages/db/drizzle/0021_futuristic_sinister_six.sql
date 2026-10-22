ALTER TABLE "form_drafts" ADD COLUMN "ip_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "form_drafts" ADD COLUMN "visitor_id" varchar(64);--> statement-breakpoint
ALTER TABLE "form_drafts" ADD COLUMN "email" varchar(320);--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "edit_token" varchar(128);--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "edit_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "edited_at" timestamp;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "starred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "form_drafts_visitor_id_idx" ON "form_drafts" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "responses_form_id_ip_hash_idx" ON "responses" USING btree ("form_id","ip_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "responses_edit_token_idx" ON "responses" USING btree ("edit_token");