ALTER TABLE "form_views" ADD COLUMN "device" varchar(20);--> statement-breakpoint
ALTER TABLE "form_views" ADD COLUMN "browser" varchar(20);--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "device" varchar(20);--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "browser" varchar(20);