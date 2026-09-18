ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "custom_domain" varchar(255);
--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_custom_domain_unique" UNIQUE("custom_domain");
