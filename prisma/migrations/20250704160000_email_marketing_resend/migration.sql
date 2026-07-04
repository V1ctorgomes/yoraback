-- Migration idempotente: segura para reexecução após falha parcial (P3009).

DO $$ BEGIN
  CREATE TYPE "EmailCampaignStatus" AS ENUM (
    'DRAFT',
    'SCHEDULED',
    'SENDING',
    'SENT',
    'CANCELLED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmailLogStatus" AS ENUM (
    'SENT',
    'DELIVERED',
    'FAILED',
    'REJECTED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmailRecipientType" AS ENUM (
    'ALL',
    'ACTIVE_ONLY',
    'SELECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "email_settings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "api_key" TEXT,
    "domain" TEXT,
    "from_name" TEXT,
    "from_email" TEXT,
    "reply_to" TEXT,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "from_name" TEXT,
    "from_email" TEXT,
    "reply_to" TEXT,
    "html" TEXT NOT NULL,
    "text" TEXT,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "recipient_type" "EmailRecipientType" NOT NULL DEFAULT 'ACTIVE_ONLY',
    "recipient_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "template_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_logs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "recipient" TEXT NOT NULL,
    "status" "EmailLogStatus" NOT NULL,
    "provider_id" TEXT,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_campaigns_status_scheduled_at_idx"
  ON "email_campaigns"("status", "scheduled_at");

CREATE INDEX IF NOT EXISTS "email_logs_campaign_id_created_at_idx"
  ON "email_logs"("campaign_id", "created_at");

CREATE INDEX IF NOT EXISTS "email_logs_status_created_at_idx"
  ON "email_logs"("status", "created_at");

DO $$ BEGIN
  ALTER TABLE "email_campaigns"
    ADD CONSTRAINT "email_campaigns_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "email_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "email_logs"
    ADD CONSTRAINT "email_logs_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
