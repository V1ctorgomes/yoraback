import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductImageDto {
  @IsUrl({ require_protocol: true }, { message: 'imageUrl deve ser uma URL válida' })
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  altText?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
