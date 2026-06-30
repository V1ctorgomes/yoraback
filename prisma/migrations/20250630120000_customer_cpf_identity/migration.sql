-- Customer identity by CPF (PRD-018)

ALTER TABLE "customers" ADD COLUMN "cpf" TEXT;
ALTER TABLE "customers" ADD COLUMN "cpf_normalized" TEXT;
ALTER TABLE "customers" ADD COLUMN "birth_date" DATE;
ALTER TABLE "customers" ADD COLUMN "cpf_pending" BOOLEAN NOT NULL DEFAULT true;

UPDATE "customers" SET "cpf_pending" = true;

DROP INDEX IF EXISTS "customers_email_key";

CREATE UNIQUE INDEX "customers_cpf_normalized_key" ON "customers"("cpf_normalized");

ALTER TABLE "orders" ADD COLUMN "customer_cpf" TEXT;

ALTER TABLE "addresses" ADD COLUMN "reference" TEXT;

ALTER TABLE "customer_addresses" ADD COLUMN "reference" TEXT;
