CREATE TYPE "public"."user_plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" "user_plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_id" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_status" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" varchar(120);--> statement-breakpoint