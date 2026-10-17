CREATE TABLE "plans" (
	"key" "user_plan" PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"tagline" varchar(255),
	"price_monthly" integer,
	"price_yearly_per_month" integer,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entitlements" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"period" varchar(7) NOT NULL,
	"responses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_owner_id_period_unique" ON "usage_counters" USING btree ("owner_id","period");--> statement-breakpoint
INSERT INTO "plans" ("key","name","tagline","price_monthly","price_yearly_per_month","currency","features","entitlements","sort_order","is_active") VALUES
('free','Free','For side projects and first forms',0,0,'USD','["3 active forms","100 responses / month","1 branded theme","Password & expiry protection","CSV export","Bot protection"]','{"maxForms":3,"maxResponsesPerMonth":100,"maxThemes":1,"maxWebhooksPerForm":1,"multiPageAndLogic":false,"analytics":false,"emailNotifications":false,"botProtection":true,"csvExport":true,"passwordAndExpiry":true,"embed":false,"customDomain":false,"webhooks":false,"payments":false,"ssoSaml":false,"prioritySupport":false,"auditLogsAndSla":false}',0,true),
('pro','Pro','For creators and growing teams',1000,800,'USD','["Unlimited forms & responses","All built-in and custom themes","Conditional logic & multi-page forms","Real-time analytics dashboard","Email notifications","Embed anywhere + custom slug","Priority support"]','{"maxForms":null,"maxResponsesPerMonth":null,"maxThemes":null,"maxWebhooksPerForm":10,"multiPageAndLogic":true,"analytics":true,"emailNotifications":true,"botProtection":true,"csvExport":true,"passwordAndExpiry":true,"embed":true,"customDomain":false,"webhooks":true,"payments":true,"ssoSaml":false,"prioritySupport":true,"auditLogsAndSla":false}',1,true),
('enterprise','Enterprise','For organizations at scale',NULL,NULL,'USD','["Everything in Pro","SSO / SAML authentication","Custom domain","Audit logs & data retention","Dedicated success manager","99.9% uptime SLA"]','{"maxForms":null,"maxResponsesPerMonth":null,"maxThemes":null,"maxWebhooksPerForm":null,"multiPageAndLogic":true,"analytics":true,"emailNotifications":true,"botProtection":true,"csvExport":true,"passwordAndExpiry":true,"embed":true,"customDomain":true,"webhooks":true,"payments":true,"ssoSaml":true,"prioritySupport":true,"auditLogsAndSla":true}',2,true)
ON CONFLICT ("key") DO NOTHING;
