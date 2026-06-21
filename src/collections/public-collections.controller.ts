import { Controller, Get, Param, Query } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { QueryCollectionsDto } from './dto/query-collections.dto';

@Controller('collections')
export class PublicCollectionsController {
  constructor(private collectionsService: CollectionsService) {}

  @Get()
  findActive(@Query() query: QueryCollectionsDto) {
    return this.collectionsService.findActive(query);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.collectionsService.findBySlug(slug);
  }
}
