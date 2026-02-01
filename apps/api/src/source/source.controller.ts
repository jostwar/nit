import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { SyncDto } from './dto/sync.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('source')
export class SourceController {
  constructor(
    private readonly syncService: SyncService,
    private readonly prisma: PrismaService,
  ) {}

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
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const safeFrom = Number.isNaN(fromDate.getTime()) ? new Date(today) : fromDate;
    const safeTo = Number.isNaN(toDate.getTime()) ? new Date(today) : toDate;

    let invoicesSynced = 0;
    let paymentsSynced = 0;
    const errors: Array<{ date: string; stage: 'invoices' | 'payments'; message: string }> = [];

    for (let cursor = new Date(safeFrom); cursor <= safeTo; cursor.setDate(cursor.getDate() + 1)) {
      const day = cursor.toISOString().slice(0, 10);
      const dayStart = new Date(`${day}T00:00:00.000Z`);
      const dayEnd = new Date(`${day}T23:59:59.999Z`);
      try {
        const existingInvoice = await this.prisma.invoice.findFirst({
          where: {
            tenantId: user.tenantId,
            issuedAt: { gte: dayStart, lte: dayEnd },
          },
          select: { id: true },
        });
        if (!existingInvoice) {
          const result = await this.syncService.syncInvoices(
            user.tenantId,
            tenantExternalId,
            day,
            day,
          );
          invoicesSynced += result.synced;
        }
      } catch (error) {
        errors.push({
          date: day,
          stage: 'invoices',
          message: (error as Error).message ?? 'Error sincronizando ventas',
        });
      }
      try {
        const existingPayment = await this.prisma.payment.findFirst({
          where: {
            tenantId: user.tenantId,
            paidAt: { gte: dayStart, lte: dayEnd },
          },
          select: { id: true },
        });
        if (!existingPayment) {
          const result = await this.syncService.syncPayments(
            user.tenantId,
            tenantExternalId,
            day,
            day,
          );
          paymentsSynced += result.synced;
        }
      } catch (error) {
        errors.push({
          date: day,
          stage: 'payments',
          message: (error as Error).message ?? 'Error sincronizando cartera',
        });
      }
    }

    return {
      customers,
      invoices: { synced: invoicesSynced },
      payments: { synced: paymentsSynced },
      errors,
    };
  }
}
