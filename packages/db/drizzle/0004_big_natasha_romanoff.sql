ALTER TABLE "themes" ALTER COLUMN "category" SET DEFAULT 'community';--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "font" varchar(100);--> statement-breakpoint
ALTER TABLE "themes" ADD COLUMN "background" jsonb;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;