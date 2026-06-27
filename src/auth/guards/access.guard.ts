import { applyDecorators, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

export function AdminGuard() {
  return applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(Role.ADMIN));
}

export function CustomerGuard() {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(Role.CUSTOMER),
  );
}
