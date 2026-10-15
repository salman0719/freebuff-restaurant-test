ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_action_allowed";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "custom_domain_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "custom_domain_verify_token" text;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_action_allowed" CHECK ("audit_events"."action" in ('tenant.created', 'tenant.owner_granted', 'staff.granted'));--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_custom_domain_status_allowed" CHECK ("tenants"."custom_domain_status" in ('none', 'pending', 'verified'));--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_custom_domain_claim_present" CHECK (("tenants"."custom_domain_status" = 'none') = ("tenants"."custom_domain" is null));--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_custom_domain_token_present" CHECK ("tenants"."custom_domain_status" = 'none' or "tenants"."custom_domain_verify_token" is not null);