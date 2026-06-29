import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { MelhorEnvioEnvironment } from '@prisma/client';

export class UpdateMelhorEnvioConfigDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsEnum(MelhorEnvioEnvironment)
  environment?: MelhorEnvioEnvironment;

  @IsOptional()
  @IsBoolean()
  isConnected?: boolean;
}
