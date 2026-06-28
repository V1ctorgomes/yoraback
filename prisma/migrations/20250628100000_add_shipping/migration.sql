-- CreateTable
CREATE TABLE "shipping_methods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "service_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipping_methods_provider_service_code_key" ON "shipping_methods"("provider", "service_code");

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "shipping_method_id" TEXT,
ADD COLUMN "shipping_provider" TEXT,
ADD COLUMN "shipping_service" TEXT,
ADD COLUMN "shipping_deadline_days" INTEGER,
ADD COLUMN "tracking_code" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_method_id_fkey" FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default shipping methods
INSERT INTO "shipping_methods" ("id", "name", "provider", "service_code", "is_active", "display_order", "created_at", "updated_at")
VALUES
    (gen_random_uuid()::text, 'PAC', 'Correios', 'pac', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'SEDEX', 'Correios', 'sedex', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Retirada na Loja', 'RetiradaLoja', 'pickup', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
