import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateCustomerAddressDto {
  @IsString()
  @MinLength(2)
  recipient!: string;

  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido' })
  zipCode!: string;

  @IsString()
  @MinLength(2)
  street!: string;

  @IsString()
  @MinLength(1)
  number!: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  @MinLength(2)
  district!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsString()
  @MinLength(2)
  state!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  isPrimary?: boolean;
}
