-- AlterTable
ALTER TABLE "orders" ADD COLUMN "payment_expires_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "stock_restored" BOOLEAN NOT NULL DEFAULT false;

UPDATE "orders"
SET "payment_expires_at" = "created_at" + INTERVAL '10 minutes'
WHERE "payment_expires_at" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "payment_expires_at" SET NOT NULL;
