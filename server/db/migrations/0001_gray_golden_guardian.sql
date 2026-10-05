ALTER TABLE "oauth_clients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD COLUMN "resource" text NOT NULL;