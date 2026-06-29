import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateShippingPackageDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(1)
  lengthCm!: number;

  @IsNumber()
  @Min(1)
  widthCm!: number;

  @IsNumber()
  @Min(1)
  heightCm!: number;

  @IsNumber()
  @Min(0.01)
  maxWeightKg!: number;

  @IsNumber()
  @Min(0)
  packageWeightKg!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateShippingPackageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  lengthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  widthCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  maxWeightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  packageWeightKg?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
