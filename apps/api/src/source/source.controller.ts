import { Body, Controller, Get, HttpCode, Logger, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { SyncDto } from './dto/sync.dto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('source')
export class SourceController {
  private readonly logger = new Logger(SourceController.name);
  private readonly runningTenants = new Set<string>();
  private readonly lastSyncByTenant = new Map<string, string>();

  constructor(
    private readonly syncService: SyncService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('sync')
  @HttpCode(202)
  @Roles('ADMIN')
  async syncAll(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: SyncDto,
  ) {
    if (this.runningTenants.has(user.tenantId)) {
      return { status: 'running' };
    }
    const today = new Date().toISOString().slice(0, 10);
    const from =
      dto.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = dto.to ?? today;
    const tenantExternalId = dto.tenantExternalId ?? user.tenantId;
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 1000;

    this.runningTenants.add(user.tenantId);
    setImmediate(async () => {
      try {
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

        for (
          let cursor = new Date(safeFrom);
          cursor <= safeTo;
          cursor.setDate(cursor.getDate() + 1)
        ) {
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

        this.logger.log(
          `Sync completed for ${user.tenantId}: customers=${customers.synced}, invoices=${invoicesSynced}, payments=${paymentsSynced}, errors=${errors.length}`,
        );
        this.lastSyncByTenant.set(user.tenantId, new Date().toISOString());
      } catch (error) {
        this.logger.error(
          `Sync failed for ${user.tenantId}: ${(error as Error).message ?? 'Unknown error'}`,
          error as Error,
        );
      } finally {
        this.runningTenants.delete(user.tenantId);
      }
    });

    return { status: 'started', from, to, page, pageSize };
  }

  @Get('sync/status')
  @Roles('ADMIN')
  getSyncStatus(@CurrentUser() user: { tenantId: string }) {
    return {
      running: this.runningTenants.has(user.tenantId),
      lastSyncedAt: this.lastSyncByTenant.get(user.tenantId) ?? null,
    };
  }
}
