import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBannerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  subtitle?: string;

  @IsUrl({ require_protocol: true }, { message: 'imageUrl deve ser uma URL válida' })
  imageUrl!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'mobileImageUrl deve ser uma URL válida' })
  mobileImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  buttonText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  buttonLink?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
