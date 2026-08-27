CREATE TYPE "public"."field_type" AS ENUM('short_text', 'long_text', 'email', 'number', 'single_select', 'multi_select', 'checkbox', 'rating', 'date');--> statement-breakpoint
CREATE TYPE "public"."form_status" AS ENUM('draft', 'published', 'unpublished');--> statement-breakpoint
CREATE TYPE "public"."form_visibility" AS ENUM('public', 'unlisted');--> statement-breakpoint
CREATE TYPE "public"."theme_category" AS ENUM('movies', 'anime', 'games', 'startups', 'tech', 'os', 'events', 'community');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false,
	"image" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "field_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_id" uuid NOT NULL,
	"label" varchar(255) NOT NULL,
	"value" varchar(255) NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"type" "field_type" NOT NULL,
	"label" varchar(255) NOT NULL,
	"placeholder" varchar(255),
	"help_text" varchar(500),
	"required" boolean DEFAULT false NOT NULL,
	"order" integer NOT NULL,
	"validation_rules" jsonb DEFAULT '{}'::jsonb,
	"conditional_logic" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "form_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"slug" varchar(255) NOT NULL,
	"status" "form_status" DEFAULT 'draft' NOT NULL,
	"visibility" "form_visibility" DEFAULT 'public' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"theme_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "forms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"ip_hash" varchar(64),
	"completed_in_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" "theme_category" NOT NULL,
	"colors" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_options" ADD CONSTRAINT "field_options_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_views" ADD CONSTRAINT "form_views_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answers_response_id_idx" ON "answers" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "answers_field_id_idx" ON "answers" USING btree ("field_id");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_response_field_idx" ON "answers" USING btree ("response_id","field_id");--> statement-breakpoint
CREATE INDEX "field_options_field_id_idx" ON "field_options" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "field_options_field_id_order_idx" ON "field_options" USING btree ("field_id","order");--> statement-breakpoint
CREATE INDEX "fields_form_id_idx" ON "fields" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "fields_form_id_order_idx" ON "fields" USING btree ("form_id","order");--> statement-breakpoint
CREATE INDEX "form_views_form_id_idx" ON "form_views" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "form_views_viewed_at_idx" ON "form_views" USING btree ("viewed_at");--> statement-breakpoint
CREATE INDEX "forms_owner_id_idx" ON "forms" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "forms_status_idx" ON "forms" USING btree ("status");--> statement-breakpoint
CREATE INDEX "forms_slug_idx" ON "forms" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "responses_form_id_idx" ON "responses" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX "responses_submitted_at_idx" ON "responses" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "responses_ip_hash_idx" ON "responses" USING btree ("ip_hash");