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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { ProductImagesService } from './product-images.service';

@Controller('admin/products/:productId/images')
@UseGuards(JwtAuthGuard)
export class AdminProductImagesController {
  constructor(private imagesService: ProductImagesService) {}

  @Post()
  create(
    @Param('productId') productId: string,
    @Body() dto: CreateProductImageDto,
  ) {
    return this.imagesService.create(productId, dto);
  }

  @Get()
  findAll(@Param('productId') productId: string) {
    return this.imagesService.findAllByProductId(productId);
  }
}

@Controller('admin/images')
@UseGuards(JwtAuthGuard)
export class AdminImagesController {
  constructor(private imagesService: ProductImagesService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductImageDto) {
    return this.imagesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.imagesService.remove(id);
  }
}
