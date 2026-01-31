import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { SyncDto } from './dto/sync.dto';

@Controller('source')
export class SourceController {
  constructor(private readonly syncService: SyncService) {}

  @Post('sync')
  @Roles('ADMIN')
  async syncAll(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: SyncDto,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const from =
      dto.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = dto.to ?? today;
    const tenantExternalId = dto.tenantExternalId ?? user.tenantId;
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 1000;

    const customers = await this.syncService.syncCustomers(
      user.tenantId,
      tenantExternalId,
      page,
      pageSize,
    );
    const invoices = await this.syncService.syncInvoices(user.tenantId, tenantExternalId, from, to);
    const payments = await this.syncService.syncPayments(user.tenantId, tenantExternalId, from, to);

    return { customers, invoices, payments };
  }
}
