import { Module } from '@nestjs/common';
import { AdminImagesController, AdminProductImagesController } from './admin-product-images.controller';
import { AdminProductVariantsController, AdminVariantsController } from './admin-product-variants.controller';
import { AdminProductsController } from './admin-products.controller';
import { ProductImagesService } from './product-images.service';
import { ProductVariantsService } from './product-variants.service';
import { PublicProductsController } from './public-products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [
    PublicProductsController,
    AdminProductsController,
    AdminProductVariantsController,
    AdminVariantsController,
    AdminProductImagesController,
    AdminImagesController,
  ],
  providers: [ProductsService, ProductVariantsService, ProductImagesService],
  exports: [ProductsService, ProductVariantsService, ProductImagesService],
})
export class ProductsModule {}
