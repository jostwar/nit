import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';

const LOCK_TTL_MS = 10 * 60 * 1000; // 10 min
const LOCK_ID = 'global';

/**
 * Sincronización automática sin clic manual:
 * - Ventas (GenerarInfoVentas): cada 15 min (solo día actual).
 * - Cartera (EstadoDeCuentaCartera): cada 1 h (solo día actual).
 * - Clientes (ListadoClientes): 1 vez al día (p. ej. 02:00).
 * Lock en BD para evitar ejecuciones paralelas.
 */
@Injectable()
export class SourceScheduler {
  private readonly logger = new Logger(SourceScheduler.name);
  private lastCustomerSyncDay: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
  ) {}

  private async tryAcquireLock(): Promise<boolean> {
    const result = await this.prisma.$executeRaw`
      UPDATE "SyncLock"
      SET "lockedAt" = now(), "lockedBy" = 'scheduler'
      WHERE "id" = ${LOCK_ID}
        AND ("lockedAt" IS NULL OR "lockedAt" < now() - interval '10 minutes')
    `;
    return Number(result) > 0;
  }

  private async releaseLock(): Promise<void> {
    await this.prisma.syncLock.update({
      where: { id: LOCK_ID },
      data: { lockedAt: null, lockedBy: null },
    }).catch(() => {});
  }

  /** Ventas: cada 15 min. Solo día actual (incremental por ventana). */
  @Cron('*/15 * * * *')
  async syncSalesEvery15Min() {
    if (process.env.SOURCE_SYNC_ENABLED === 'false') return;
    if (process.env.SOURCE_API_PROVIDER !== 'fomplus' && !process.env.SOURCE_API_URL) return;
    const ok = await this.tryAcquireLock();
    if (!ok) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
      for (const tenant of tenants) {
        const result = await this.syncService.syncInvoices(tenant.id, tenant.id, today, today);
        await this.prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            lastSyncAt: new Date(),
            lastUnmappedRefsCount: result.unmappedRefsCount,
          },
        });
      }
      this.logger.log(`[scheduler] Ventas (15min) completed for ${tenants.length} tenant(s)`);
    } catch (error) {
      this.logger.error('[scheduler] Ventas (15min) failed', error as Error);
    } finally {
      await this.releaseLock();
    }
  }

  /** Cartera: cada 1 h. Solo día actual. */
  @Cron('0 * * * *')
  async syncPaymentsEveryHour() {
    if (process.env.SOURCE_SYNC_ENABLED === 'false') return;
    if (process.env.SOURCE_API_PROVIDER !== 'fomplus' && !process.env.SOURCE_API_URL) return;
    const ok = await this.tryAcquireLock();
    if (!ok) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
      for (const tenant of tenants) {
        await this.syncService.syncPayments(tenant.id, tenant.id, today, today);
      }
      this.logger.log(`[scheduler] Cartera (1h) completed for ${tenants.length} tenant(s)`);
    } catch (error) {
      this.logger.error('[scheduler] Cartera (1h) failed', error as Error);
    } finally {
      await this.releaseLock();
    }
  }

  /** Clientes: 1 vez al día (02:00). */
  @Cron('0 2 * * *')
  async syncCustomersOnceDaily() {
    if (process.env.SOURCE_SYNC_ENABLED === 'false') return;
    if (process.env.SOURCE_API_PROVIDER !== 'fomplus' && !process.env.SOURCE_API_URL) return;
    const ok = await this.tryAcquireLock();
    if (!ok) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
      for (const tenant of tenants) {
        let page = 1;
        while (true) {
          const result = await this.syncService.syncCustomers(tenant.id, tenant.id, page, 1000);
          if (result.synced === 0) break;
          page += 1;
        }
      }
      this.lastCustomerSyncDay = today;
      this.logger.log(`[scheduler] Clientes (1/día) completed for ${tenants.length} tenant(s)`);
    } catch (error) {
      this.logger.error('[scheduler] Clientes (1/día) failed', error as Error);
    } finally {
      await this.releaseLock();
    }
  }
}
