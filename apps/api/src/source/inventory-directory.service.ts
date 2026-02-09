import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRefer } from '../common/utils/refer.util';

@Injectable()
export class InventoryDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve mapas referencia → marca y referencia → clase para el tenant.
   * Se usan para cruce con REFER de GenerarInfoVentas.
   */
  async getRefBrandClassMap(
    tenantId: string,
  ): Promise<{ brandMap: Map<string, string>; classMap: Map<string, string> }> {
    const rows = await this.prisma.inventoryDirectory.findMany({
      where: { tenantId },
      select: { reference: true, brand: true, classCode: true },
    });
    const brandMap = new Map<string, string>();
    const classMap = new Map<string, string>();
    for (const row of rows) {
      const ref = normalizeRefer(row.reference);
      if (ref) {
        if (row.brand?.trim()) brandMap.set(ref, row.brand.trim());
        if (row.classCode?.trim()) classMap.set(ref, row.classCode.trim());
      }
    }
    return { brandMap, classMap };
  }

  /**
   * Carga o actualiza el directorio de inventario (referencia → MARCA, CLASE).
   * reference = REFER del producto; se normaliza para cruce con ventas.
   * Si una REFER viene repetida, última fila gana (upsert).
   */
  async upsertBulk(
    tenantId: string,
    items: Array<{ reference: string; brand?: string; classCode?: string }>,
  ): Promise<{ count: number; duplicateRefsLogged: number }> {
    const seenRefs = new Set<string>();
    let duplicateRefsLogged = 0;
    let count = 0;
    for (const item of items) {
      const reference = normalizeRefer(item.reference);
      if (!reference) continue;
      if (seenRefs.has(reference)) duplicateRefsLogged++;
      else seenRefs.add(reference);
      const brand = item.brand?.trim() ?? '';
      const classCode = item.classCode?.trim() ?? '';
      await this.prisma.inventoryDirectory.upsert({
        where: {
          tenantId_reference: { tenantId, reference },
        },
        create: { tenantId, reference, brand, classCode },
        update: { brand, classCode },
      });
      count++;
    }
    return { count, duplicateRefsLogged };
  }

  /**
   * Parsea CSV con columnas REFER, MARCA, CLASE (o nombres similares).
   * Detecta cabecera; columnas extra se ignoran. Última fila gana para duplicados.
   */
  parseCsvToDirectoryRows(
    csvContent: string,
  ): { items: Array<{ reference: string; brand?: string; classCode?: string }>; duplicateRefsLogged: number } {
    const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return { items: [], duplicateRefsLogged: 0 };
    const sep = /[,;\t]/;
    const findCol = (headerParts: string[], names: string[]): number => {
      for (const name of names) {
        const i = headerParts.findIndex((p) => p === name || p.replace(/\s/g, '') === name);
        if (i >= 0) return i;
      }
      return -1;
    };
    const headerParts = lines[0].split(sep).map((p) => p.replace(/^"|"$/g, '').trim().toLowerCase());
    const refCol = findCol(headerParts, ['refer', 'referencia', 'ref', 'codigo', 'codref']);
    const brandCol = findCol(headerParts, ['marca', 'brand']);
    const classCol = findCol(headerParts, ['clase', 'class', 'classcode', 'codclase']);
    const hasHeader = refCol >= 0 || brandCol >= 0 || classCol >= 0;
    const start = hasHeader ? 1 : 0;
    const items: Array<{ reference: string; brand?: string; classCode?: string }> = [];
    const seen = new Set<string>();
    let duplicateRefsLogged = 0;
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(sep).map((p) => p.replace(/^"|"$/g, '').trim());
      const ref = refCol >= 0 ? parts[refCol] : parts[0];
      const reference = normalizeRefer(ref);
      if (!reference) continue;
      if (seen.has(reference)) duplicateRefsLogged++;
      else seen.add(reference);
      items.push({
        reference,
        brand: brandCol >= 0 ? parts[brandCol] : parts[1],
        classCode: classCol >= 0 ? parts[classCol] : parts[2],
      });
    }
    return { items, duplicateRefsLogged };
  }

  /** Lista entradas del directorio (paginado). */
  async list(
    tenantId: string,
    opts?: { page?: number; pageSize?: number },
  ): Promise<{ items: Array<{ reference: string; brand: string; classCode: string }>; total: number }> {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(500, Math.max(1, opts?.pageSize ?? 100));
    const [items, total] = await Promise.all([
      this.prisma.inventoryDirectory.findMany({
        where: { tenantId },
        select: { reference: true, brand: true, classCode: true },
        orderBy: { reference: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryDirectory.count({ where: { tenantId } }),
    ]);
    return {
      items: items.map((r) => ({ reference: r.reference, brand: r.brand, classCode: r.classCode })),
      total,
    };
  }
}
