import { Module } from '@nestjs/common';
import { AdminImagesController, AdminProductImagesController } from './admin-product-images.controller';
import { AdminProductVariantsController, AdminVariantsController } from './admin-product-variants.controller';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductSearchController } from './admin-product-search.controller';
import { ProductImagesService } from './product-images.service';
import { ProductSearchService } from './product-search.service';
import { ProductVariantsService } from './product-variants.service';
import { PublicProductsController } from './public-products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [
    PublicProductsController,
    AdminProductsController,
    AdminProductSearchController,
    AdminProductVariantsController,
    AdminVariantsController,
    AdminProductImagesController,
    AdminImagesController,
  ],
  providers: [
    ProductsService,
    ProductVariantsService,
    ProductImagesService,
    ProductSearchService,
  ],
  exports: [
    ProductsService,
    ProductVariantsService,
    ProductImagesService,
    ProductSearchService,
  ],
})
export class ProductsModule {}
