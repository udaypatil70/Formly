CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."template_category" AS ENUM('feedback', 'sales', 'education', 'health', 'events', 'product', 'careers', 'community', 'it');--> statement-breakpoint
CREATE TABLE "domain_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"domain" varchar(255) NOT NULL,
	"token" varchar(64) NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_checked_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "domain_verifications_form_id_unique" UNIQUE("form_id")
);
--> statement-breakpoint
-- template_category was unconstrained varchar; null out anything that is not a
-- known category so the enum conversion below cannot fail on legacy rows.
UPDATE "forms" SET "template_category" = NULL
WHERE "template_category" IS NOT NULL
  AND "template_category" NOT IN ('feedback','sales','education','health','events','product','careers','community','it');--> statement-breakpoint
ALTER TABLE "forms" ALTER COLUMN "template_category" SET DATA TYPE "public"."template_category" USING "template_category"::"public"."template_category";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp;--> statement-breakpoint
-- Existing custom domains land on 'pending' (the column default) with a NULL
-- verified_at and must earn proof of control again. This is the intended
-- effect: an unverified domain was never proven to belong to the form owner.
ALTER TABLE "forms" ADD COLUMN "custom_domain_status" "domain_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "custom_domain_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "domain_verifications" ADD CONSTRAINT "domain_verifications_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_verifications_domain_idx" ON "domain_verifications" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "domain_verifications_status_idx" ON "domain_verifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "forms_custom_domain_status_idx" ON "forms" USING btree ("custom_domain_status");