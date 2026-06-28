-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "is_guest" BOOLEAN NOT NULL DEFAULT true,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- Customers from registered users
INSERT INTO "customers" ("id", "name", "email", "phone", "is_guest", "user_id", "created_at", "updated_at")
SELECT
    md5(random()::text || clock_timestamp()::text || u.id)::uuid::text,
    u.name,
    LOWER(u.email),
    COALESCE(u.phone, ''),
    false,
    u.id,
    u.created_at,
    u.updated_at
FROM "users" u
WHERE u.role = 'CUSTOMER';

-- Guest customers from order emails not yet registered
INSERT INTO "customers" ("id", "name", "email", "phone", "is_guest", "user_id", "created_at", "updated_at")
SELECT
    md5(random()::text || clock_timestamp()::text || src.email)::uuid::text,
    src.name,
    src.email,
    src.phone,
    true,
    NULL,
    src.created_at,
    NOW()
FROM (
    SELECT DISTINCT ON (LOWER(o.customer_email))
        LOWER(o.customer_email) AS email,
        o.customer_name AS name,
        o.customer_phone AS phone,
        o.created_at
    FROM "orders" o
    WHERE NOT EXISTS (
        SELECT 1 FROM "customers" c WHERE c.email = LOWER(o.customer_email)
    )
    ORDER BY LOWER(o.customer_email), o.created_at ASC
) src;

-- Remap orders.customer_id from user ids to customer ids
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_customer_id_fkey";

UPDATE "orders" o
SET "customer_id" = c.id
FROM "customers" c
WHERE o.customer_id IS NOT NULL
  AND c.user_id = o.customer_id;

UPDATE "orders" o
SET "customer_id" = c.id
FROM "customers" c
WHERE o.customer_id IS NULL
  AND c.email = LOWER(o.customer_email);

UPDATE "orders" o
SET "customer_id" = c.id
FROM "customers" c
WHERE o.customer_id IS NOT NULL
  AND o.customer_id NOT IN (SELECT id FROM "customers")
  AND c.email = LOWER(o.customer_email);

-- Fallback: create missing customers for orphan orders
INSERT INTO "customers" ("id", "name", "email", "phone", "is_guest", "user_id", "created_at", "updated_at")
SELECT
    md5(random()::text || clock_timestamp()::text || o.id)::uuid::text,
    o.customer_name,
    LOWER(o.customer_email),
    o.customer_phone,
    true,
    NULL,
    o.created_at,
    NOW()
FROM "orders" o
WHERE o.customer_id IS NULL
   OR o.customer_id NOT IN (SELECT id FROM "customers");

UPDATE "orders" o
SET "customer_id" = c.id
FROM "customers" c
WHERE o.customer_id IS NULL
  AND c.email = LOWER(o.customer_email);

UPDATE "orders" o
SET "customer_id" = c.id
FROM "customers" c
WHERE o.customer_id NOT IN (SELECT id FROM "customers")
  AND c.email = LOWER(o.customer_email);

ALTER TABLE "orders" ALTER COLUMN "customer_id" SET NOT NULL;

ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate customer addresses to customer_id
ALTER TABLE "customer_addresses" ADD COLUMN "customer_id" TEXT;

UPDATE "customer_addresses" ca
SET "customer_id" = c.id
FROM "customers" c
WHERE c.user_id = ca.user_id;

ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_user_id_fkey";
DROP INDEX IF EXISTS "customer_addresses_user_id_idx";
ALTER TABLE "customer_addresses" DROP COLUMN "user_id";
ALTER TABLE "customer_addresses" ALTER COLUMN "customer_id" SET NOT NULL;

CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses"("customer_id");

ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
