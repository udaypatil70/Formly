CREATE TABLE "rate_limit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"hits_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_log_key_hits_at_idx" ON "rate_limit_log" USING btree ("key","hits_at");--> statement-breakpoint
CREATE INDEX "rate_limit_log_hits_at_idx" ON "rate_limit_log" USING btree ("hits_at");