CREATE TABLE "form_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"label" varchar(255),
	"title" varchar(255) NOT NULL,
	"description" text,
	"theme_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"fields" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_versions_form_id_idx" ON "form_versions" USING btree ("form_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_versions_form_version_idx" ON "form_versions" USING btree ("form_id","version");