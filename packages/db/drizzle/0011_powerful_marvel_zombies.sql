ALTER TYPE "public"."field_type" ADD VALUE 'phone';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'url';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'time';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'scale';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'file_upload';--> statement-breakpoint
CREATE TABLE "form_file_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"stored_name" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "form_file_uploads_stored_name_unique" UNIQUE("stored_name")
);
--> statement-breakpoint
CREATE TABLE "form_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"events" jsonb DEFAULT '["response.created"]'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_status" integer,
	"last_error" text,
	"last_triggered_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "form_file_uploads" ADD CONSTRAINT "form_file_uploads_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_webhooks" ADD CONSTRAINT "form_webhooks_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_file_uploads_form_id_idx" ON "form_file_uploads" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "form_webhooks_form_id_idx" ON "form_webhooks" USING btree ("form_id");