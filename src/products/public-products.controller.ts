import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryProductsDto } from './dto/query-products.dto';
import { ProductVariantsService } from './product-variants.service';
import { ProductsService } from './products.service';

@Controller('products')
export class PublicProductsController {
  constructor(
    private productsService: ProductsService,
    private variantsService: ProductVariantsService,
  ) {}

  @Get()
  findActive(@Query() query: QueryProductsDto) {
    return this.productsService.findActive(query);
  }

  @Get(':slug/variants')
  findVariants(@Param('slug') slug: string) {
    return this.variantsService.findActiveByProductSlug(slug);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }
}
