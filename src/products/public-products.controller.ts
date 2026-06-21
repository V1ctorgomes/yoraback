import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryProductsDto } from './dto/query-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class PublicProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  findActive(@Query() query: QueryProductsDto) {
    return this.productsService.findActive(query);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }
}
