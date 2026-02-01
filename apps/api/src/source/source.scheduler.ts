import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';

@Injectable()
export class SourceScheduler {
  private readonly logger = new Logger(SourceScheduler.name);
  private running = false;
  private lastCustomerSyncDay: string | null = null;
  private lastBackfillDay: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncDailyWindow() {
    if (process.env.SOURCE_SYNC_ENABLED === 'false') {
      return;
    }
    if (process.env.SOURCE_API_PROVIDER !== 'fomplus' && !process.env.SOURCE_API_URL) {
      return;
    }
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
      const backfillDays = Number(process.env.SOURCE_SYNC_BACKFILL_DAYS ?? 400);
      const shouldBackfill = backfillDays > 0 && this.lastBackfillDay !== today;
      for (const tenant of tenants) {
        if (this.lastCustomerSyncDay !== today) {
          let page = 1;
          while (true) {
            const result = await this.syncService.syncCustomers(tenant.id, tenant.id, page, 1000);
            if (result.synced === 0) break;
            page += 1;
          }
        }
        if (shouldBackfill) {
          const start = new Date();
          start.setDate(start.getDate() - backfillDays);
          for (
            const cursor = new Date(start);
            cursor <= new Date();
            cursor.setDate(cursor.getDate() + 1)
          ) {
            const day = cursor.toISOString().slice(0, 10);
            await this.syncService.syncInvoices(tenant.id, tenant.id, day, day);
            await this.syncService.syncPayments(tenant.id, tenant.id, day, day);
          }
        } else {
          await this.syncService.syncInvoices(tenant.id, tenant.id, today, today);
          await this.syncService.syncPayments(tenant.id, tenant.id, today, today);
        }
      }
      this.lastCustomerSyncDay = today;
      if (shouldBackfill) {
        this.lastBackfillDay = today;
      }
      this.logger.log(`Hourly sync completed for ${tenants.length} tenant(s)`);
    } catch (error) {
      this.logger.error('Hourly sync failed', error as Error);
    } finally {
      this.running = false;
    }
  }
}
