import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeRefer } from '../common/utils/refer.util';
import { parseCsvSemicolon, findColumnIndex } from '../common/utils/csv-parse.util';

@Injectable()
export class InventoryDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mapas referencia → Nombre MARCA y referencia → Nombre CLASE para enriquecer ventas.
   */
  async getRefBrandClassMap(
    tenantId: string,
  ): Promise<{ brandMap: Map<string, string>; classMap: Map<string, string> }> {
    const rows = await this.prisma.inventoryDirectory.findMany({
      where: { tenantId },
      select: { reference: true, brand: true, classCode: true, className: true },
    });
    const brandMap = new Map<string, string>();
    const classMap = new Map<string, string>();
    for (const row of rows) {
      const ref = normalizeRefer(row.reference);
      if (!ref) continue;
      if (row.brand?.trim()) brandMap.set(ref, row.brand.trim());
      const classVal = row.className?.trim() || row.classCode?.trim();
      if (classVal) classMap.set(ref, classVal);
    }
    return { brandMap, classMap };
  }

  /**
   * Carga o actualiza catálogo (refer_norm → marca_nombre, clase_nombre).
   * Última fila gana si REFERENCIA duplicada.
   */
  async upsertBulk(
    tenantId: string,
    items: Array<{ reference: string; brand?: string; classCode?: string; className?: string }>,
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
      const classCode = item.classCode?.trim() || null;
      const className = item.className?.trim() || null;
      await this.prisma.inventoryDirectory.upsert({
        where: { tenantId_reference: { tenantId, reference } },
        create: { tenantId, reference, brand, classCode, className },
        update: { brand, classCode, className },
      });
      count++;
    }
    return { count, duplicateRefsLogged };
  }

  /**
   * Parsea CSV con delimiter ;, BOM, header, trim, campos entre comillas (multiline).
   * Columnas: REFERENCIA, Nombre CLASE, Nombre MARCA (y opc. CLASE, MARCA como código).
   * Última fila gana para REFERENCIA duplicada.
   */
  parseCsvToDirectoryRows(content: string): {
    items: Array<{ reference: string; brand?: string; classCode?: string; className?: string }>;
    duplicateRefsLogged: number;
  } {
    const { headers, rows } = parseCsvSemicolon(content);
    if (headers.length === 0) return { items: [], duplicateRefsLogged: 0 };

    const refCol = findColumnIndex(headers, ['referencia', 'refer', 'ref', 'codigo', 'codref']);
    const marcaNombreCol = findColumnIndex(headers, ['nombre marca', 'marca nombre', 'marca', 'brand']);
    const claseNombreCol = findColumnIndex(headers, ['nombre clase', 'clase nombre', 'clase']);
    const marcaCodeCol = findColumnIndex(headers, ['marca code', 'codmar']);
    const claseCodeCol = findColumnIndex(headers, ['clase code', 'codclase']);

    const items: Array<{ reference: string; brand?: string; classCode?: string; className?: string }> = [];
    const seen = new Set<string>();
    let duplicateRefsLogged = 0;

    for (const row of rows) {
      const ref = refCol >= 0 ? (row[refCol] ?? '') : row[0] ?? '';
      const reference = normalizeRefer(ref);
      if (!reference) continue;
      if (seen.has(reference)) duplicateRefsLogged++;
      else seen.add(reference);
      items.push({
        reference,
        brand: marcaNombreCol >= 0 ? row[marcaNombreCol]?.trim() : marcaCodeCol >= 0 ? row[marcaCodeCol]?.trim() : undefined,
        className: claseNombreCol >= 0 ? row[claseNombreCol]?.trim() : undefined,
        classCode: claseCodeCol >= 0 ? row[claseCodeCol]?.trim() : undefined,
      });
    }
    return { items, duplicateRefsLogged };
  }

  async list(
    tenantId: string,
    opts?: { page?: number; pageSize?: number },
  ): Promise<{ items: Array<{ reference: string; brand: string; classCode: string | null; className: string | null }>; total: number }> {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(500, Math.max(1, opts?.pageSize ?? 100));
    const [items, total] = await Promise.all([
      this.prisma.inventoryDirectory.findMany({
        where: { tenantId },
        select: { reference: true, brand: true, classCode: true, className: true },
        orderBy: { reference: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryDirectory.count({ where: { tenantId } }),
    ]);
    return {
      items: items.map((r) => ({ reference: r.reference, brand: r.brand, classCode: r.classCode, className: r.className })),
      total,
    };
  }
}
