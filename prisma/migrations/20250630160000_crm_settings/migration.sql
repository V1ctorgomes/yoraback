-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN "crm_vip_threshold" DECIMAL(10,2) NOT NULL DEFAULT 3000;
ALTER TABLE "store_settings" ADD COLUMN "crm_inactive_days" INTEGER NOT NULL DEFAULT 90;

-- CreateTable
CREATE TABLE "crm_access_logs" (
    "id" TEXT NOT NULL,
    "admin_email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "customer_id" TEXT,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_access_logs_accessed_at_idx" ON "crm_access_logs"("accessed_at");
