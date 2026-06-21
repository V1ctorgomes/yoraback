import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCollectionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug deve conter apenas letras minúsculas, números e hífens',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsUrl({ require_protocol: true }, { message: 'bannerImageUrl deve ser uma URL válida' })
  bannerImageUrl!: string;

  @IsUrl(
    { require_protocol: true },
    { message: 'thumbnailImageUrl deve ser uma URL válida' },
  )
  thumbnailImageUrl!: string;

  @IsDateString({}, { message: 'launchDate deve ser uma data válida' })
  launchDate!: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate deve ser uma data válida' })
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
