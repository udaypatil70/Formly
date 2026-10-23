DROP INDEX IF EXISTS "forms_slug_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "form_drafts_resume_token_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "form_payments_order_id_idx";--> statement-breakpoint
UPDATE "form_versions"
SET "theme_id" = NULL
WHERE "theme_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "themes" WHERE "themes"."id" = "form_versions"."theme_id"
  );--> statement-breakpoint
ALTER TABLE "form_versions"
ADD CONSTRAINT "form_versions_theme_id_themes_id_fk"
FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;
