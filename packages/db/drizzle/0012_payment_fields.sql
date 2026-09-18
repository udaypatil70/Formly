ALTER TYPE "field_type" ADD VALUE 'payment';
--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'paid', 'failed', 'refunded');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "form_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"response_id" uuid,
	"razorpay_order_id" varchar(255) NOT NULL,
	"razorpay_payment_id" varchar(255),
	"amount_paise" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "form_payments" ADD CONSTRAINT "form_payments_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "form_payments" ADD CONSTRAINT "form_payments_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "form_payments" ADD CONSTRAINT "form_payments_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "form_payments" ADD CONSTRAINT "form_payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_payments_form_id_idx" ON "form_payments" USING btree ("form_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_payments_field_id_idx" ON "form_payments" USING btree ("field_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_payments_order_id_idx" ON "form_payments" USING btree ("razorpay_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_payments_status_idx" ON "form_payments" USING btree ("status");