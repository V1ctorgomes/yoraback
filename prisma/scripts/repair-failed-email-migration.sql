-- Execute no PostgreSQL (console do EasyPanel) antes de redeployar o backend.
-- Limpa restos da migration 20250704160000_email_marketing_resend que falhou no meio.

DROP TABLE IF EXISTS "email_logs" CASCADE;
DROP TABLE IF EXISTS "email_campaigns" CASCADE;
DROP TABLE IF EXISTS "email_templates" CASCADE;
DROP TABLE IF EXISTS "email_settings" CASCADE;

DROP TYPE IF EXISTS "EmailRecipientType";
DROP TYPE IF EXISTS "EmailLogStatus";
DROP TYPE IF EXISTS "EmailCampaignStatus";

DELETE FROM "_prisma_migrations"
WHERE migration_name = '20250704160000_email_marketing_resend';
