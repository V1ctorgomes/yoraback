-- CreateTable
CREATE TABLE "shipping_carriers" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "custom_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_services" (
    "id" TEXT NOT NULL,
    "carrier_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "custom_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_services_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "melhor_envio_configs" ADD COLUMN "last_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "shipping_service_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "shipping_carriers_provider_external_id_key" ON "shipping_carriers"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_services_carrier_id_external_id_key" ON "shipping_services"("carrier_id", "external_id");

-- AddForeignKey
ALTER TABLE "shipping_services" ADD CONSTRAINT "shipping_services_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "shipping_carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_service_id_fkey" FOREIGN KEY ("shipping_service_id") REFERENCES "shipping_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Desativar métodos mockados legados
UPDATE "shipping_methods"
SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP
WHERE "provider" IN ('Correios', 'RetiradaLoja');
