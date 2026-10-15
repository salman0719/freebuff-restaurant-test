CREATE TABLE "signin_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signin_rate_limits_window_unique" UNIQUE("scope","key_hash","window_start"),
	CONSTRAINT "signin_rate_limits_scope_allowed" CHECK ("signin_rate_limits"."scope" in ('email', 'ip')),
	CONSTRAINT "signin_rate_limits_count_non_negative" CHECK ("signin_rate_limits"."count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "signin_rate_limits_window_start_idx" ON "signin_rate_limits" USING btree ("window_start");