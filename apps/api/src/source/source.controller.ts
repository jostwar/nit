import { Body, Controller, Get, HttpCode, Inject, Logger, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SyncService } from './sync.service';
import { SyncDto } from './dto/sync.dto';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryDirectoryService } from './inventory-directory.service';
import type { SourceApiClient } from './source-api.client';
import { SOURCE_API_CLIENT } from './source.constants';

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

type SyncProgress = {
  percent: number;
  stage: string;
  current: number;
  total: number;
};

@Controller('source')
export class SourceController {
  private readonly logger = new Logger(SourceController.name);
  private readonly runningTenants = new Set<string>();
  private readonly syncProgress = new Map<string, SyncProgress>();
  private readonly syncCancelRequested = new Set<string>();

  constructor(
    private readonly syncService: SyncService,
    private readonly prisma: PrismaService,
    private readonly inventoryDirectory: InventoryDirectoryService,
    @Inject(SOURCE_API_CLIENT) private readonly sourceApi: SourceApiClient,
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
    this.syncProgress.set(user.tenantId, { percent: 0, stage: 'Clientes', current: 0, total: 1 });
    this.logger.log(`[sync] Iniciando para tenant ${user.tenantId} | rango ${from} → ${to}`);

    const syncStartedAt = Date.now();
    setImmediate(async () => {
      try {
        const customers = await this.syncService.syncCustomers(
          user.tenantId,
          tenantExternalId,
          page,
          pageSize,
        );
        this.logger.log(`[sync] Clientes sincronizados: ${customers.synced}`);
        if (this.syncCancelRequested.has(user.tenantId)) {
          this.syncCancelRequested.delete(user.tenantId);
          return;
        }

        const fromDate = new Date(from);
        const toDate = new Date(to);
        const safeFrom = Number.isNaN(fromDate.getTime()) ? new Date(today) : fromDate;
        const safeTo = Number.isNaN(toDate.getTime()) ? new Date(today) : toDate;

        const rangeDays =
          Math.ceil((safeTo.getTime() - safeFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1;
        const byMonth = rangeDays > 31;

        const [brandRows, classRows] = await Promise.all([
          this.prisma.productBrand.findMany({
            where: { tenantId: user.tenantId },
            select: { code: true, name: true },
          }),
          this.prisma.productClass.findMany({
            where: { tenantId: user.tenantId },
            select: { code: true, name: true },
          }),
        ]);
        const brandCodeToName = new Map(brandRows.map((b) => [b.code, b.name]));
        const classCodeToName = new Map(classRows.map((c) => [c.code.trim(), c.name]));

        let invoicesSynced = 0;
        let paymentsSynced = 0;
        let totalUnmappedRefs = 0;
        const errors: Array<{ date: string; stage: 'invoices' | 'payments'; message: string }> = [];

        const chunks = [...(byMonth ? monthChunks(safeFrom, safeTo) : dayChunks(safeFrom, safeTo))];
        const totalChunks = chunks.length;
        this.syncProgress.set(user.tenantId, {
          percent: 5,
          stage: 'Ventas y cartera',
          current: 0,
          total: totalChunks,
        });
        // Un solo día (ej. "Actualizar hoy"): una sola llamada de ventas, sin iterar por cliente.
        const fullRange = byMonth || from === to;
        let chunkIndex = 0;
        for (const [rangeFrom, rangeTo] of chunks) {
          if (this.syncCancelRequested.has(user.tenantId)) {
            this.logger.log(`[sync] Cancelado por usuario en ${user.tenantId}`);
            this.syncCancelRequested.delete(user.tenantId);
            break;
          }
          chunkIndex++;
          const label = `${rangeFrom} → ${rangeTo}`;
          let countInvoices = 0;
          let countPayments = 0;
          try {
            const result = await this.syncService.syncInvoices(
              user.tenantId,
              tenantExternalId,
              rangeFrom,
              rangeTo,
              { fullRange, brandCodeToName, classCodeToName },
            );
            countInvoices = result.synced;
            invoicesSynced += result.synced;
            totalUnmappedRefs += result.unmappedRefsCount ?? 0;
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
              { fullRange },
            );
            countPayments = result.synced;
            paymentsSynced += result.synced;
          } catch (error) {
            const msg = (error as Error).message ?? 'Error sincronizando cartera';
            errors.push({ date: label, stage: 'payments', message: msg });
            this.logger.warn(`[sync] ${label} cartera: ${msg}`);
          }
          this.syncProgress.set(user.tenantId, {
            percent: 5 + Math.round((95 * chunkIndex) / totalChunks),
            stage: label,
            current: chunkIndex,
            total: totalChunks,
          });
          if (countInvoices > 0 || countPayments > 0) {
            this.logger.log(`[sync]   ${label}  ventas=${countInvoices}  cartera=${countPayments}`);
          }
        }

        const syncDurationMs = Date.now() - syncStartedAt;
        this.logger.log(
          `[sync] Listo ${user.tenantId}: clientes=${customers.synced}, ventas=${invoicesSynced}, cartera=${paymentsSynced}, unmappedRefs=${totalUnmappedRefs}, duración=${syncDurationMs}ms, errores=${errors.length}`,
        );
        await this.prisma.tenant.update({
          where: { id: user.tenantId },
          data: {
            lastSyncAt: new Date(),
            lastSyncDurationMs: syncDurationMs,
            lastUnmappedRefsCount: totalUnmappedRefs,
            lastSyncError: errors.length > 0 ? errors.map((e) => e.message).join('; ') : null,
          },
        });
      } catch (error) {
        const errMsg = (error as Error).message ?? 'Unknown error';
        this.logger.error(`Sync failed for ${user.tenantId}: ${errMsg}`, error as Error);
        await this.prisma.tenant.update({
          where: { id: user.tenantId },
          data: {
            lastSyncAt: new Date(),
            lastSyncDurationMs: Date.now() - syncStartedAt,
            lastSyncError: errMsg,
          },
        }).catch(() => {});
      } finally {
        this.runningTenants.delete(user.tenantId);
        this.syncProgress.delete(user.tenantId);
        this.syncCancelRequested.delete(user.tenantId);
      }
    });

    return { status: 'started', from, to, page, pageSize };
  }

  @Post('sync/cancel')
  @HttpCode(202)
  @Roles('ADMIN')
  async cancelSync(@CurrentUser() user: { tenantId: string }) {
    if (this.runningTenants.has(user.tenantId)) {
      this.syncCancelRequested.add(user.tenantId);
      this.logger.log(`[sync] Solicitud de cancelación para tenant ${user.tenantId}`);
    }
    return { status: 'cancel_requested' };
  }

  @Get('sync/status')
  @Roles('ADMIN')
  async getSyncStatus(@CurrentUser() user: { tenantId: string }) {
    const [tenant, minMax, totalItems] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: {
          lastSyncAt: true,
          lastSyncDurationMs: true,
          lastUnmappedRefsCount: true,
          lastSyncError: true,
        },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId: user.tenantId },
        _min: { issuedAt: true },
        _max: { issuedAt: true },
        _count: { _all: true },
      }),
      this.prisma.invoiceItem.count({ where: { tenantId: user.tenantId } }),
    ]);
    const minDate = minMax._min?.issuedAt;
    const maxDate = minMax._max?.issuedAt;
    const running = this.runningTenants.has(user.tenantId);
    const progress = running ? this.syncProgress.get(user.tenantId) ?? null : null;
    const unmappedPercent =
      totalItems > 0 && (tenant?.lastUnmappedRefsCount ?? 0) > 0
        ? Math.round(((tenant?.lastUnmappedRefsCount ?? 0) / totalItems) * 1000) / 10
        : null;
    return {
      running,
      lastSyncedAt: tenant?.lastSyncAt?.toISOString() ?? null,
      lastSyncDurationMs: tenant?.lastSyncDurationMs ?? null,
      lastUnmappedRefsCount: tenant?.lastUnmappedRefsCount ?? null,
      lastSyncError: tenant?.lastSyncError ?? null,
      unmappedRefsPercent: unmappedPercent,
      dataCoverage: {
        earliestDate: minDate?.toISOString().slice(0, 10) ?? null,
        latestDate: maxDate?.toISOString().slice(0, 10) ?? null,
        totalInvoices: minMax._count?._all ?? 0,
      },
      progress: progress
        ? {
            percent: progress.percent,
            stage: progress.stage,
            current: progress.current,
            total: progress.total,
          }
        : null,
    };
  }

  @Get('inventory-brands')
  @Roles('ADMIN', 'ANALYST')
  async getInventoryBrands(@CurrentUser() user: { tenantId: string }) {
    const brands =
      (await this.sourceApi.getInventoryBrandNames?.(user.tenantId)) ?? [];
    return { brands };
  }

  @Get('class-mapping')
  @Roles('ADMIN', 'ANALYST')
  async getClassMapping(@CurrentUser() user: { tenantId: string }) {
    const rows = await this.prisma.productClass.findMany({
      where: { tenantId: user.tenantId },
      select: { code: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { mappings: rows };
  }

  @Put('class-mapping')
  @Roles('ADMIN')
  async setClassMapping(
    @CurrentUser() user: { tenantId: string },
    @Body() body: { mappings: Array<{ code: string; name: string }> },
  ) {
    const tenantId = user.tenantId;
    for (const { code, name } of body.mappings ?? []) {
      const c = String(code ?? '').trim();
      const n = String(name ?? '').trim();
      if (!c) continue;
      await this.prisma.productClass.upsert({
        where: {
          tenantId_code: { tenantId, code: c },
        },
        update: { name: n },
        create: { tenantId, code: c, name: n || c },
      });
    }
    const rows = await this.prisma.productClass.findMany({
      where: { tenantId },
      select: { code: true, name: true },
    });
    return { mappings: rows };
  }

  @Get('brand-mapping')
  @Roles('ADMIN', 'ANALYST')
  async getBrandMapping(@CurrentUser() user: { tenantId: string }) {
    const rows = await this.prisma.productBrand.findMany({
      where: { tenantId: user.tenantId },
      select: { code: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { mappings: rows };
  }

  @Put('brand-mapping')
  @Roles('ADMIN')
  async setBrandMapping(
    @CurrentUser() user: { tenantId: string },
    @Body() body: { mappings: Array<{ code: string; name: string }> },
  ) {
    const tenantId = user.tenantId;
    for (const { code, name } of body.mappings ?? []) {
      const c = String(code ?? '').trim();
      const n = String(name ?? '').trim();
      if (!c) continue;
      await this.prisma.productBrand.upsert({
        where: {
          tenantId_code: { tenantId, code: c },
        },
        update: { name: n },
        create: { tenantId, code: c, name: n || c },
      });
    }
    const rows = await this.prisma.productBrand.findMany({
      where: { tenantId },
      select: { code: true, name: true },
    });
    return { mappings: rows };
  }

  /** Directorio de inventario: REFER → MARCA, CLASE. Cruce con ítems de GenerarInfoVentas. */
  @Get('inventory-directory')
  @Roles('ADMIN', 'ANALYST')
  async getInventoryDirectory(
    @CurrentUser() user: { tenantId: string },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.inventoryDirectory.list(user.tenantId, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return result;
  }

  /** Carga o actualiza directorio (referencia, marca, clase). reference = REFER del producto. */
  @Put('inventory-directory')
  @Roles('ADMIN')
  async putInventoryDirectory(
    @CurrentUser() user: { tenantId: string },
    @Body() body: { items: Array<{ reference: string; brand?: string; classCode?: string; className?: string }> },
  ) {
    const items = body.items ?? [];
    const result = await this.inventoryDirectory.upsertBulk(user.tenantId, items);
    return { count: result.count, duplicateRefsLogged: result.duplicateRefsLogged };
  }

  /** Carga directorio desde CSV (columnas REFER, MARCA, CLASE). Última fila gana en duplicados. */
  @Post('inventory-directory/upload')
  @HttpCode(200)
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  async uploadInventoryDirectoryCsv(
    @CurrentUser() user: { tenantId: string },
    @UploadedFile() file: { buffer?: Buffer } | undefined,
  ) {
    if (!file) {
      return { error: 'No se recibió archivo. Envía multipart con campo "file".' };
    }
    const buffer = file.buffer;
    const content = buffer ? buffer.toString('utf-8') : '';
    if (!content?.trim()) {
      return { error: 'El archivo está vacío.' };
    }
    const { items } = this.inventoryDirectory.parseCsvToDirectoryRows(content);
    const result = await this.inventoryDirectory.upsertBulk(user.tenantId, items);
    this.logger.log(
      `[inventory-directory] CSV upload tenant=${user.tenantId} rows=${items.length} upserted=${result.count} duplicateRefsLogged=${result.duplicateRefsLogged}`,
    );
    return {
      count: result.count,
      duplicateRefsLogged: result.duplicateRefsLogged,
      message: 'Catálogo actualizado. Las ventas se enriquecerán con MARCA/CLASE en el próximo sync.',
    };
  }
}
