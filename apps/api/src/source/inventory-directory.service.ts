import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Normaliza referencia para cruce (trim + mayúsculas), igual que en ventas/inventario. */
function normalizeRef(ref: string | undefined): string {
  if (!ref || typeof ref !== 'string') return '';
  return ref.trim().toUpperCase();
}

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
      const ref = normalizeRef(row.reference);
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
   */
  async upsertBulk(
    tenantId: string,
    items: Array<{ reference: string; brand?: string; classCode?: string }>,
  ): Promise<{ count: number }> {
    let count = 0;
    for (const item of items) {
      const reference = normalizeRef(item.reference);
      if (!reference) continue;
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
    return { count };
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
