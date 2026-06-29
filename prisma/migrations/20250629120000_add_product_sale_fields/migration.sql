-- AlterTable
ALTER TABLE "products" ADD COLUMN "is_on_sale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "compare_at_price" DECIMAL(10,2);
