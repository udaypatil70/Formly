CREATE TYPE "public"."razorpay_webhook_event_status" AS ENUM('processing', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TABLE "razorpay_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"event" varchar(100) NOT NULL,
	"status" "razorpay_webhook_event_status" DEFAULT 'processing' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"updated_at" timestamp,
	CONSTRAINT "razorpay_webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "form_payments" ADD COLUMN "refunded_amount_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "form_payments" ADD COLUMN "razorpay_refund_id" varchar(255);--> statement-breakpoint
ALTER TABLE "form_payments" ADD COLUMN "refunded_at" timestamp;--> statement-breakpoint
CREATE INDEX "razorpay_webhook_events_status_idx" ON "razorpay_webhook_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "razorpay_webhook_events_received_at_idx" ON "razorpay_webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "form_payments_payment_id_idx" ON "form_payments" USING btree ("razorpay_payment_id");