import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthAdmin {
  id: string;
  email: string;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthAdmin => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthAdmin }>();
    return request.user;
  },
);
