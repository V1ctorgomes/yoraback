ALTER TABLE "email_settings"
ADD COLUMN IF NOT EXISTS "resend_segment_id" TEXT,
ADD COLUMN IF NOT EXISTS "resend_sync_enabled" BOOLEAN NOT NULL DEFAULT false;
