import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { ProductVariantsService } from './product-variants.service';

@Controller('admin/products/:productId/variants')
@AdminGuard()
export class AdminProductVariantsController {
  constructor(private variantsService: ProductVariantsService) {}

  @Post()
  create(
    @Param('productId') productId: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.variantsService.create(productId, dto);
  }

  @Get()
  findAll(@Param('productId') productId: string) {
    return this.variantsService.findAllByProductId(productId);
  }
}

@Controller('admin/variants')
@AdminGuard()
export class AdminVariantsController {
  constructor(private variantsService: ProductVariantsService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductVariantDto) {
    return this.variantsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.variantsService.remove(id);
  }
}
