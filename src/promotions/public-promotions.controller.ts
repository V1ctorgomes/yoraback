import { Body, Controller, Post } from '@nestjs/common';
import { ValidatePromotionDto } from './dto/validate-promotion.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
export class PublicPromotionsController {
  constructor(private promotionsService: PromotionsService) {}

  @Post('validate')
  validate(@Body() dto: ValidatePromotionDto) {
    return this.promotionsService.validate(dto);
  }
}
