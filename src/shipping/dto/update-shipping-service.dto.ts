import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateShippingServiceDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsString()
  customMessage?: string | null;
}
