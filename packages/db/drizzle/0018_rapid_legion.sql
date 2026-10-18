ALTER TABLE "form_file_uploads" ADD COLUMN "field_id" uuid;--> statement-breakpoint
ALTER TABLE "form_file_uploads" ADD COLUMN "response_id" uuid;--> statement-breakpoint
ALTER TABLE "form_file_uploads" ADD COLUMN "uploaded_by_ip_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "form_file_uploads" ADD CONSTRAINT "form_file_uploads_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_file_uploads" ADD CONSTRAINT "form_file_uploads_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_file_uploads_field_id_idx" ON "form_file_uploads" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "form_file_uploads_response_id_idx" ON "form_file_uploads" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "form_file_uploads_created_at_idx" ON "form_file_uploads" USING btree ("created_at");