import { Controller, Get } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  getCurrent(@TenantId() tenantId: string) {
    return this.tenantsService.getTenant(tenantId);
  }
}
