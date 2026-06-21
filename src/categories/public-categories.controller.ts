import { Controller, Get, Param } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class PublicCategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  findActive() {
    return this.categoriesService.findActive();
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }
}
