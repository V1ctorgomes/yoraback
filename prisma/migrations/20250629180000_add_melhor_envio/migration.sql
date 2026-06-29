-- CreateEnum
CREATE TYPE "LogisticStatus" AS ENUM ('PENDING', 'LABEL_PENDING', 'LABEL_CREATED', 'POSTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MelhorEnvioEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "shipping_label_id" TEXT,
ADD COLUMN "shipping_label_url" TEXT,
ADD COLUMN "logistic_status" "LogisticStatus";

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "weight_kg" DECIMAL(6,3),
ADD COLUMN "length_cm" DECIMAL(6,2),
ADD COLUMN "width_cm" DECIMAL(6,2),
ADD COLUMN "height_cm" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "melhor_envio_configs" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "client_id" TEXT,
    "client_secret_encrypted" TEXT,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "environment" "MelhorEnvioEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "melhor_envio_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_senders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "document" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "zip_code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "length_cm" DECIMAL(6,2) NOT NULL,
    "width_cm" DECIMAL(6,2) NOT NULL,
    "height_cm" DECIMAL(6,2) NOT NULL,
    "max_weight_kg" DECIMAL(6,3) NOT NULL,
    "package_weight_kg" DECIMAL(6,3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipping_events_order_id_event_date_idx" ON "shipping_events"("order_id", "event_date");

-- CreateIndex
CREATE INDEX "shipping_webhook_events_provider_created_at_idx" ON "shipping_webhook_events"("provider", "created_at");

-- AddForeignKey
ALTER TABLE "shipping_events" ADD CONSTRAINT "shipping_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default package
INSERT INTO "shipping_packages" (
    "id", "name", "length_cm", "width_cm", "height_cm", "max_weight_kg", "package_weight_kg", "updated_at"
) VALUES (
    'default-package', 'Caixa Padrão', 30, 20, 10, 5, 0.2, CURRENT_TIMESTAMP
);

-- Seed default Melhor Envio config row
INSERT INTO "melhor_envio_configs" ("id", "updated_at") VALUES ('default', CURRENT_TIMESTAMP);
