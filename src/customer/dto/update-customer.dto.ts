import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { IsCpf } from '../../common/validators/is-cpf.decorator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+55\s?)?(\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}$/, {
    message: 'Telefone inválido',
  })
  phone?: string;

  @IsOptional()
  @IsCpf()
  cpf?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Data de nascimento inválida',
  })
  birthDate?: string;
}
