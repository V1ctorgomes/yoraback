import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryProductsDto } from './dto/query-products.dto';
import {
  SearchProductsDto,
  SearchSuggestionsDto,
} from './dto/search-products.dto';
import { ProductSearchService } from './product-search.service';
import { ProductVariantsService } from './product-variants.service';
import { ProductsService } from './products.service';

@Controller('products')
export class PublicProductsController {
  constructor(
    private productsService: ProductsService,
    private variantsService: ProductVariantsService,
    private productSearchService: ProductSearchService,
  ) {}

  @Get()
  findActive(@Query() query: QueryProductsDto) {
    return this.productsService.findActive(query);
  }

  @Get('search')
  search(@Query() query: SearchProductsDto) {
    return this.productSearchService.search(query);
  }

  @Get('search/suggestions')
  suggestions(@Query() query: SearchSuggestionsDto) {
    return this.productSearchService.suggestions(query);
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
