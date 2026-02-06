import { Body, Controller, Get, HttpCode, Logger, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { SyncDto } from './dto/sync.dto';
import { PrismaService } from '../prisma/prisma.service';

function* dayChunks(
  from: Date,
  to: Date,
): Generator<[string, string]> {
  const cursor = new Date(from);
  while (cursor <= to) {
    const day = cursor.toISOString().slice(0, 10);
    yield [day, day];
    cursor.setDate(cursor.getDate() + 1);
  }
}

function* monthChunks(
  from: Date,
  to: Date,
): Generator<[string, string]> {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const rangeFrom = monthStart < from ? from : monthStart;
    const rangeTo = monthEnd > to ? to : monthEnd;
    const fromStr = rangeFrom.toISOString().slice(0, 10);
    const toStr = rangeTo.toISOString().slice(0, 10);
    yield [fromStr, toStr];
  }
}

@Controller('source')
export class SourceController {
  private readonly logger = new Logger(SourceController.name);
  private readonly runningTenants = new Set<string>();

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
    this.logger.log(`[sync] Iniciando para tenant ${user.tenantId} | rango ${from} → ${to}`);

    setImmediate(async () => {
      try {
        const customers = await this.syncService.syncCustomers(
          user.tenantId,
          tenantExternalId,
          page,
          pageSize,
        );
        this.logger.log(`[sync] Clientes sincronizados: ${customers.synced}`);

        const fromDate = new Date(from);
        const toDate = new Date(to);
        const safeFrom = Number.isNaN(fromDate.getTime()) ? new Date(today) : fromDate;
        const safeTo = Number.isNaN(toDate.getTime()) ? new Date(today) : toDate;

        const rangeDays =
          Math.ceil((safeTo.getTime() - safeFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        const byMonth = rangeDays > 31;

        let invoicesSynced = 0;
        let paymentsSynced = 0;
        const errors: Array<{ date: string; stage: 'invoices' | 'payments'; message: string }> = [];

        const iterate = byMonth ? monthChunks(safeFrom, safeTo) : dayChunks(safeFrom, safeTo);
        for (const [rangeFrom, rangeTo] of iterate) {
          const label = `${rangeFrom} → ${rangeTo}`;
          let countInvoices = 0;
          let countPayments = 0;
          try {
            const result = await this.syncService.syncInvoices(
              user.tenantId,
              tenantExternalId,
              rangeFrom,
              rangeTo,
            );
            countInvoices = result.synced;
            invoicesSynced += result.synced;
          } catch (error) {
            const msg = (error as Error).message ?? 'Error sincronizando ventas';
            errors.push({ date: label, stage: 'invoices', message: msg });
            this.logger.warn(`[sync] ${label} ventas: ${msg}`);
          }
          try {
            const result = await this.syncService.syncPayments(
              user.tenantId,
              tenantExternalId,
              rangeFrom,
              rangeTo,
            );
            countPayments = result.synced;
            paymentsSynced += result.synced;
          } catch (error) {
            const msg = (error as Error).message ?? 'Error sincronizando cartera';
            errors.push({ date: label, stage: 'payments', message: msg });
            this.logger.warn(`[sync] ${label} cartera: ${msg}`);
          }
          if (countInvoices > 0 || countPayments > 0) {
            this.logger.log(`[sync]   ${label}  ventas=${countInvoices}  cartera=${countPayments}`);
          }
        }

        this.logger.log(
          `[sync] Listo ${user.tenantId}: clientes=${customers.synced}, ventas=${invoicesSynced}, cartera=${paymentsSynced}, errores=${errors.length}`,
        );
        await this.prisma.tenant.update({
          where: { id: user.tenantId },
          data: { lastSyncAt: new Date() },
        });
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
  async getSyncStatus(@CurrentUser() user: { tenantId: string }) {
    const [tenant, minMax] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { lastSyncAt: true },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId: user.tenantId },
        _min: { issuedAt: true },
        _max: { issuedAt: true },
        _count: { _all: true },
      }),
    ]);
    const minDate = minMax._min?.issuedAt;
    const maxDate = minMax._max?.issuedAt;
    return {
      running: this.runningTenants.has(user.tenantId),
      lastSyncedAt: tenant?.lastSyncAt?.toISOString() ?? null,
      dataCoverage: {
        earliestDate: minDate?.toISOString().slice(0, 10) ?? null,
        latestDate: maxDate?.toISOString().slice(0, 10) ?? null,
        totalInvoices: minMax._count?._all ?? 0,
      },
    };
  }
}
