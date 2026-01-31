import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthUser = {
  id: string;
  tenantId: string;
  email: string;
  role: 'ADMIN' | 'ANALYST';
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);
