import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { IsCpf } from '../../common/validators/is-cpf.decorator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsCpf()
  cpf!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^(\+55\s?)?(\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}$/, {
    message: 'Telefone inválido',
  })
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}
