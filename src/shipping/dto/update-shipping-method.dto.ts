import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateShippingMethodDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
