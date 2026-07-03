-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_query_logs" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "term_normalized" TEXT NOT NULL,
    "results_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_is_active_subscribed_at_idx" ON "newsletter_subscribers"("is_active", "subscribed_at");

-- CreateIndex
CREATE INDEX "search_query_logs_term_normalized_created_at_idx" ON "search_query_logs"("term_normalized", "created_at");

-- CreateIndex
CREATE INDEX "search_query_logs_created_at_idx" ON "search_query_logs"("created_at");

-- CreateIndex
CREATE INDEX "products_is_active_created_at_idx" ON "products"("is_active", "created_at");

-- CreateIndex
CREATE INDEX "products_is_active_base_price_idx" ON "products"("is_active", "base_price");

-- CreateIndex
CREATE INDEX "products_is_active_is_on_sale_idx" ON "products"("is_active", "is_on_sale");

-- CreateIndex
CREATE INDEX "products_is_active_is_new_idx" ON "products"("is_active", "is_new");

-- CreateIndex
CREATE INDEX "product_variants_color_idx" ON "product_variants"("color");

-- CreateIndex
CREATE INDEX "product_variants_size_idx" ON "product_variants"("size");
