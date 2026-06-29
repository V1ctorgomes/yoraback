import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class PromotionCartItemDto {
  @IsUUID()
  productVariantId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class ValidatePromotionDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PromotionCartItemDto)
  cartItems!: PromotionCartItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingPrice?: number;
}
