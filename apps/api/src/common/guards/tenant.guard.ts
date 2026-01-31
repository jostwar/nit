import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { tenantId?: string };
    if (user?.tenantId) {
      request.tenantId = user.tenantId;
    }
    return true;
  }
}
