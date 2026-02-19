import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePeriodText, ResolvedPeriod } from '../common/utils/period-resolver';
import { parseRange } from '../common/utils/date-range';

export type GroupBy = 'customer' | 'brand' | 'class' | 'product' | 'seller';
export type SalesMetric = 'sales' | 'units' | 'margin';
export type ChangeDirection = 'drop' | 'growth';

export interface ResolvePeriodInput {
  text: string;
}

export interface SalesTopInput {
  start: string;
  end: string;
  group_by: GroupBy;
  city?: string;
  vendor?: string;
  brand?: string;
  class?: string;
  limit?: number;
}

export interface SalesChangeInput {
  start: string;
  end: string;
  compare_start: string;
  compare_end: string;
  group_by: GroupBy;
  metric: SalesMetric;
  direction: ChangeDirection;
  city?: string;
  vendor?: string;
  brand?: string;
  class?: string;
  limit?: number;
}

export interface ArSummaryInput {
  start: string;
  end: string;
  group_by?: 'customer' | 'vendor';
  city?: string;
  vendor?: string;
  limit?: number;
  /** Si true, solo clientes con saldo vencido > 0. */
  only_overdue?: boolean;
  /** Ordenar por balance (default) o por vencido (overdue) desc. */
  order_by?: 'balance' | 'overdue';
}

export interface CustomerLookupInput {
  query: string;
}

@Injectable()
export class CopilotToolsService {
  constructor(private readonly prisma: PrismaService) {}

  resolve_period(input: ResolvePeriodInput): ResolvedPeriod | null {
    return resolvePeriodText(input.text);
  }

  private baseWhere(
    tenantId: string,
    start: Date,
    end: Date,
    filters?: { city?: string; vendor?: string; brand?: string; class?: string },
  ) {
    const w: Prisma.InvoiceWhereInput = {
      tenantId,
      issuedAt: { gte: start, lte: end },
      documentType: { not: null },
    };
    if (filters?.city?.trim()) {
      w.city = { contains: filters.city.trim(), mode: 'insensitive' };
    }
    if (filters?.vendor?.trim()) {
      w.vendor = { contains: filters.vendor.trim(), mode: 'insensitive' };
    }
    if (filters?.brand?.trim()) {
      w.items = { some: { brand: { contains: filters.brand.trim(), mode: 'insensitive' } } };
    }
    if (filters?.class?.trim()) {
      w.items = { some: { className: { contains: filters.class.trim(), mode: 'insensitive' } } };
    }
    return w;
  }

  private async resolveCustomerIds(
    tenantId: string,
    filters?: { city?: string; vendor?: string },
  ): Promise<string[] | null> {
    if (!filters?.city?.trim() && !filters?.vendor?.trim()) return null;
    const where: Prisma.CustomerWhereInput = { tenantId };
    if (filters.city?.trim()) where.city = { contains: filters.city.trim(), mode: 'insensitive' };
    if (filters.vendor?.trim()) where.vendor = { contains: filters.vendor.trim(), mode: 'insensitive' };
    const list = await this.prisma.customer.findMany({ where, select: { id: true }, take: 5000 });
    return list.map((c) => c.id);
  }

  async sales_top(tenantId: string, input: SalesTopInput): Promise<{ columns: string[]; rows: (string | number)[][] }> {
    const start = new Date(input.start + 'T00:00:00.000Z');
    const end = new Date(input.end + 'T23:59:59.999Z');
    if (start.getTime() > end.getTime()) {
      return { columns: ['Error'], rows: [['Rango inválido: start debe ser <= end']] };
    }
    const limit = Math.min(input.limit ?? 10, 100);
    const filters = { city: input.city, vendor: input.vendor, brand: input.brand, class: input.class };
    const where = this.baseWhere(tenantId, start, end, filters);
    const customerIds = await this.resolveCustomerIds(tenantId, { city: input.city, vendor: input.vendor });
    if (customerIds && customerIds.length === 0) {
      return { columns: ['info'], rows: [['No hay clientes para los filtros ciudad/vendedor.']] };
    }
    if (customerIds) (where as any).customerId = { in: customerIds };

    switch (input.group_by) {
      case 'customer': {
        const rows = await this.prisma.invoice.groupBy({
          by: ['customerId'],
          where,
          _sum: { signedTotal: true, signedUnits: true, signedMargin: true },
          _count: { id: true },
          orderBy: { _sum: { signedTotal: 'desc' } },
          take: limit,
        });
        const cust = await this.prisma.customer.findMany({
          where: { id: { in: rows.map((r) => r.customerId) } },
        });
        const map = new Map(cust.map((c) => [c.id, c]));
        return {
          columns: ['Cliente', 'NIT', 'Ventas (COP)', 'Facturas', 'Unidades', 'Margen (COP)', 'Margen %'],
          rows: rows.map((r) => {
            const total = Number(r._sum.signedTotal ?? 0);
            const margin = Number(r._sum.signedMargin ?? 0);
            const marginPct = total > 0 ? (margin / total) * 100 : 0;
            return [
              map.get(r.customerId)?.name ?? '',
              map.get(r.customerId)?.nit ?? '',
              total,
              r._count.id,
              Number(r._sum.signedUnits ?? 0),
              margin,
              marginPct,
            ];
          }),
        };
      }
      case 'brand': {
        const rows = await this.prisma.$queryRaw<
          Array<{ brand: string; total: string; units: string; margin: string }>
        >(Prisma.sql`
          SELECT it.brand,
            SUM(i."signedTotal")::text as total,
            SUM(i."signedUnits")::text as units,
            SUM(i."signedMargin")::text as margin
          FROM "InvoiceItem" it
          INNER JOIN "Invoice" i ON i.id = it."invoiceId"
          WHERE i."tenantId" = ${tenantId}
            AND i."issuedAt" >= ${start} AND i."issuedAt" <= ${end}
          GROUP BY it.brand
          ORDER BY SUM(i."signedTotal") DESC
          LIMIT ${limit}
        `);
        return {
          columns: ['Marca', 'Ventas (COP)', 'Unidades', 'Margen (COP)'],
          rows: rows.map((r) => [r.brand, Number(r.total), Number(r.units), Number(r.margin)]),
        };
      }
      case 'class': {
        const rows = await this.prisma.$queryRaw<
          Array<{ className: string; total: string; units: string }>
        >(Prisma.sql`
          SELECT COALESCE(it."className", '(sin clase)') as "className",
            SUM(i."signedTotal")::text as total,
            SUM(i."signedUnits")::text as units
          FROM "InvoiceItem" it
          INNER JOIN "Invoice" i ON i.id = it."invoiceId"
          WHERE i."tenantId" = ${tenantId}
            AND i."issuedAt" >= ${start} AND i."issuedAt" <= ${end}
          GROUP BY it."className"
          ORDER BY SUM(i."signedTotal") DESC
          LIMIT ${limit}
        `);
        return {
          columns: ['Clase', 'Ventas (COP)', 'Unidades'],
          rows: rows.map((r) => [r.className, Number(r.total), Number(r.units)]),
        };
      }
      case 'product': {
        const rows = await this.prisma.$queryRaw<
          Array<{ productName: string; total: string; units: string }>
        >(Prisma.sql`
          SELECT it."productName",
            SUM(i."signedTotal")::text as total,
            SUM(i."signedUnits")::text as units
          FROM "InvoiceItem" it
          INNER JOIN "Invoice" i ON i.id = it."invoiceId"
          WHERE i."tenantId" = ${tenantId}
            AND i."issuedAt" >= ${start} AND i."issuedAt" <= ${end}
          GROUP BY it."productName"
          ORDER BY SUM(i."signedTotal") DESC
          LIMIT ${limit}
        `);
        return {
          columns: ['Producto', 'Ventas (COP)', 'Unidades'],
          rows: rows.map((r) => [r.productName, Number(r.total), Number(r.units)]),
        };
      }
      case 'seller': {
        const rows = await this.prisma.invoice.groupBy({
          by: ['vendor'],
          where: { ...where, vendor: { not: null } },
          _sum: { signedTotal: true, signedUnits: true },
          orderBy: { _sum: { signedTotal: 'desc' } },
          take: limit,
        });
        return {
          columns: ['Vendedor', 'Ventas (COP)', 'Unidades'],
          rows: rows.map((r) => [r.vendor ?? 'N/A', Number(r._sum.signedTotal ?? 0), Number(r._sum.signedUnits ?? 0)]),
        };
      }
      default:
        return { columns: [], rows: [] };
    }
  }

  async sales_change(tenantId: string, input: SalesChangeInput): Promise<{ columns: string[]; rows: (string | number)[][] }> {
    const start = new Date(input.start + 'T00:00:00.000Z');
    const end = new Date(input.end + 'T23:59:59.999Z');
    const compareStart = new Date(input.compare_start + 'T00:00:00.000Z');
    const compareEnd = new Date(input.compare_end + 'T23:59:59.999Z');
    const limit = Math.min(input.limit ?? 10, 100);
    const filters = { city: input.city, vendor: input.vendor, brand: input.brand, class: input.class };
    const customerIds = await this.resolveCustomerIds(tenantId, { city: input.city, vendor: input.vendor });
    const whereCurr = this.baseWhere(tenantId, start, end, filters);
    const whereCompare = this.baseWhere(tenantId, compareStart, compareEnd, filters);
    if (customerIds?.length === 0) {
      return { columns: ['info'], rows: [['No hay clientes para los filtros.']] };
    }
    if (customerIds) {
      (whereCurr as any).customerId = { in: customerIds };
      (whereCompare as any).customerId = { in: customerIds };
    }

    const getAgg = async (w: Prisma.InvoiceWhereInput, by: 'customerId' | 'vendor') => {
      const g = await this.prisma.invoice.groupBy({
        by: [by],
        where: by === 'vendor' ? { ...w, vendor: { not: null } } : w,
        _sum: { signedTotal: true, signedUnits: true, signedMargin: true },
      });
      return new Map(g.map((r) => [r[by] ?? '', { sales: Number(r._sum.signedTotal ?? 0), units: Number(r._sum.signedUnits ?? 0), margin: Number(r._sum.signedMargin ?? 0) }]));
    };

    if (input.group_by === 'customer') {
      const [curr, compare] = await Promise.all([
        this.prisma.invoice.groupBy({ by: ['customerId'], where: whereCurr, _sum: { signedTotal: true, signedUnits: true, signedMargin: true } }),
        this.prisma.invoice.groupBy({ by: ['customerId'], where: whereCompare, _sum: { signedTotal: true, signedUnits: true, signedMargin: true } }),
      ]);
      const compareMap = new Map(compare.map((r) => [r.customerId, { sales: Number(r._sum.signedTotal ?? 0), units: Number(r._sum.signedUnits ?? 0), margin: Number(r._sum.signedMargin ?? 0) }]));
      const metricKey = input.metric === 'sales' ? 'sales' : input.metric === 'units' ? 'units' : 'margin';
      const withChange = curr.map((r) => {
        const c = Number(r._sum.signedTotal ?? 0);
        const u = Number(r._sum.signedUnits ?? 0);
        const m = Number(r._sum.signedMargin ?? 0);
        const prev = compareMap.get(r.customerId) ?? { sales: 0, units: 0, margin: 0 };
        const currVal = input.metric === 'sales' ? c : input.metric === 'units' ? u : m;
        const prevVal = prev[metricKey];
        const pct = prevVal > 0 ? ((currVal - prevVal) / prevVal) * 100 : 0;
        return { customerId: r.customerId, currVal, prevVal, pct };
      });
      const filtered = input.direction === 'drop' ? withChange.filter((x) => x.pct < 0) : withChange.filter((x) => x.pct > 0);
      const sorted = filtered.sort((a, b) => (input.direction === 'drop' ? a.pct - b.pct : b.pct - a.pct)).slice(0, limit);
      const customers = await this.prisma.customer.findMany({ where: { id: { in: sorted.map((s) => s.customerId) } } });
      const custMap = new Map(customers.map((c) => [c.id, c]));
      return {
        columns: ['Cliente', 'NIT', '% cambio', 'Actual', 'Anterior'],
        rows: sorted.map((s) => [
          custMap.get(s.customerId)?.name ?? '',
          custMap.get(s.customerId)?.nit ?? '',
          s.pct.toFixed(1) + '%',
          s.currVal,
          s.prevVal,
        ]),
      };
    }

    if (input.group_by === 'seller') {
      const [curr, compare] = await Promise.all([
        this.prisma.invoice.groupBy({ by: ['vendor'], where: { ...whereCurr, vendor: { not: null } }, _sum: { signedTotal: true, signedUnits: true, signedMargin: true } }),
        this.prisma.invoice.groupBy({ by: ['vendor'], where: { ...whereCompare, vendor: { not: null } }, _sum: { signedTotal: true, signedUnits: true, signedMargin: true } }),
      ]);
      const compareMap = new Map(compare.map((r) => [r.vendor ?? '', { sales: Number(r._sum.signedTotal ?? 0), units: Number(r._sum.signedUnits ?? 0), margin: Number(r._sum.signedMargin ?? 0) }]));
      const metricKey = input.metric === 'sales' ? 'sales' : input.metric === 'units' ? 'units' : 'margin';
      const withChange = curr.map((r) => {
        const v = r.vendor ?? '';
        const c = Number(r._sum.signedTotal ?? 0);
        const u = Number(r._sum.signedUnits ?? 0);
        const m = Number(r._sum.signedMargin ?? 0);
        const prev = compareMap.get(v) ?? { sales: 0, units: 0, margin: 0 };
        const currVal = input.metric === 'sales' ? c : input.metric === 'units' ? u : m;
        const prevVal = prev[metricKey];
        const pct = prevVal > 0 ? ((currVal - prevVal) / prevVal) * 100 : 0;
        return { vendor: v, currVal, prevVal, pct };
      });
      const filtered = input.direction === 'drop' ? withChange.filter((x) => x.pct < 0) : withChange.filter((x) => x.pct > 0);
      const sorted = filtered.sort((a, b) => (input.direction === 'drop' ? a.pct - b.pct : b.pct - a.pct)).slice(0, limit);
      return {
        columns: ['Vendedor', '% cambio', 'Actual', 'Anterior'],
        rows: sorted.map((s) => [s.vendor, s.pct.toFixed(1) + '%', s.currVal, s.prevVal]),
      };
    }

    return { columns: [], rows: [] };
  }

  async ar_summary(tenantId: string, input: ArSummaryInput): Promise<{ columns: string[]; rows: (string | number)[][] }> {
    const onlyOverdue = input.only_overdue === true;
    const orderByOverdue = input.order_by === 'overdue';
    const credits = await this.prisma.credit.findMany({
      where: {
        tenantId,
        ...(onlyOverdue ? { overdue: { gt: 0 } } : {}),
      },
      orderBy: orderByOverdue ? { overdue: 'desc' } : { balance: 'desc' },
      take: Math.min(input.limit ?? 20, 100),
    });
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: credits.map((c) => c.customerId) } },
    });
    const custMap = new Map(customers.map((c) => [c.id, c]));
    return {
      columns: ['Cliente', 'NIT', 'Saldo', 'Vencido', 'DSO (días)', 'Cupo'],
      rows: credits.map((c) => [
        custMap.get(c.customerId)?.name ?? '',
        custMap.get(c.customerId)?.nit ?? '',
        Number(c.balance),
        Number(c.overdue),
        c.dsoDays,
        Number(c.creditLimit),
      ]),
    };
  }

  async customer_lookup(tenantId: string, input: CustomerLookupInput): Promise<{ columns: string[]; rows: (string | number)[][] }> {
    const q = (input.query ?? '').trim();
    if (!q) return { columns: ['NIT', 'Nombre', 'Ciudad', 'Vendedor'], rows: [] };
    const list = await this.prisma.customer.findMany({
      where: {
        tenantId,
        fromListadoClientes: true,
        OR: [
          { nit: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
    return {
      columns: ['NIT', 'Nombre', 'Ciudad', 'Vendedor'],
      rows: list.map((c) => [c.nit, c.name, c.city ?? '', c.vendor ?? '']),
    };
  }

  async sync_status(tenantId: string): Promise<{ lastSyncAt: string | null; lastSyncDurationMs: number | null; lastSyncError: string | null }> {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { lastSyncAt: true, lastSyncDurationMs: true, lastSyncError: true },
    });
    return {
      lastSyncAt: t?.lastSyncAt?.toISOString() ?? null,
      lastSyncDurationMs: t?.lastSyncDurationMs ?? null,
      lastSyncError: t?.lastSyncError ?? null,
    };
  }
}
