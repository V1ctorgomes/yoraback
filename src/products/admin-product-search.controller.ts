import { Controller, Get } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { ProductSearchService } from './product-search.service';

@Controller('admin/search')
@AdminGuard()
export class AdminProductSearchController {
  constructor(private productSearchService: ProductSearchService) {}

  @Get('analytics')
  analytics() {
    return this.productSearchService.getSearchAnalytics();
  }
}
