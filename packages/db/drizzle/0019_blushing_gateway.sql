CREATE TABLE "form_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"request_body" jsonb NOT NULL,
	"url" text NOT NULL,
	"response_status" integer,
	"response_body" text,
	"error" text,
	"duration_ms" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "form_webhooks" ADD COLUMN "secret_rotated_at" timestamp;--> statement-breakpoint
ALTER TABLE "form_webhooks" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "form_webhooks" ADD COLUMN "auto_disabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "form_webhooks" ADD COLUMN "auto_disabled_reason" text;--> statement-breakpoint
ALTER TABLE "form_webhook_deliveries" ADD CONSTRAINT "form_webhook_deliveries_webhook_id_form_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."form_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_webhook_deliveries_webhook_id_idx" ON "form_webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "form_webhook_deliveries_created_at_idx" ON "form_webhook_deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "form_webhook_deliveries_pending_idx" ON "form_webhook_deliveries" USING btree ("next_retry_at") WHERE "form_webhook_deliveries"."status" IN ('pending', 'retrying');