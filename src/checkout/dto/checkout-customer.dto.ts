import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsCpf } from '../../common/validators/is-cpf.decorator';

export class CheckoutCustomerDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsCpf()
  cpf!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsEmail()
  email?: string;

  @IsString()
  @Matches(/^(\+55\s?)?(\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}$/, {
    message: 'Telefone inválido',
  })
  phone!: string;
}
