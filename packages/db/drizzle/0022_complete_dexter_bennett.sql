CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	"domain_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" varchar(120) NOT NULL,
	"resource_type" varchar(80) NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" varchar(64),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sso_provider_provider_id_unique" ON "sso_provider" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sso_provider_domain_unique" ON "sso_provider" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "audit_logs_owner_created_idx" ON "audit_logs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_formly_analytics_changed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('formly_analytics', OLD.form_id::text);
    RETURN OLD;
  END IF;
  PERFORM pg_notify('formly_analytics', NEW.form_id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER responses_analytics_notify
AFTER INSERT OR UPDATE OR DELETE ON responses
FOR EACH ROW EXECUTE FUNCTION notify_formly_analytics_changed();--> statement-breakpoint
CREATE TRIGGER form_views_analytics_notify
AFTER INSERT ON form_views
FOR EACH ROW EXECUTE FUNCTION notify_formly_analytics_changed();--> statement-breakpoint
UPDATE plans SET features = '["Everything in Pro","SSO / SAML authentication","Custom domain","Audit logs with 90-day retention","60+ curated and community themes"]'::jsonb WHERE key = 'enterprise';--> statement-breakpoint
UPDATE plans SET features = '["Unlimited forms & responses","60+ curated and community themes","Conditional logic & multi-page forms","Real-time analytics dashboard","Email notifications","Embed anywhere + custom slug"]'::jsonb, entitlements = jsonb_set(entitlements, '{prioritySupport}', 'false'::jsonb) WHERE key = 'pro';--> statement-breakpoint
UPDATE plans SET entitlements = jsonb_set(entitlements, '{prioritySupport}', 'false'::jsonb) WHERE key = 'enterprise';