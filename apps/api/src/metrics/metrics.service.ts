import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

  private async getCached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>) {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }
    const value = await fetcher();
    if (this.cache.size > 1000) {
      this.cache.clear();
    }
    this.cache.set(key, { expiresAt: now + ttlMs, value });
    return value;
  }

  /** Solo ciudad; vendedor se filtra por Invoice.vendor (NOMVEN). */
  private async resolveCustomerScope(
    tenantId: string,
    filters?: { city?: string },
  ) {
    const city = filters?.city?.trim();
    if (!city) return null;
    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId,
        city: { contains: city, mode: 'insensitive' },
      },
      select: { id: true },
      take: 20000,
    });
    return customers.map((customer) => customer.id);
  }

  async getDashboardSummary(
    tenantId: string,
    from: Date,
    to: Date,
    compareFrom: Date,
    compareTo: Date,
    filters?: { city?: string; vendor?: string; brand?: string },
  ) {
    const key = [
      tenantId,
      from.toISOString(),
      to.toISOString(),
      compareFrom.toISOString(),
      compareTo.toISOString(),
      filters?.city?.trim() ?? '',
      filters?.vendor?.trim() ?? '',
      filters?.brand?.trim() ?? '',
    ].join('|');

    return this.getCached(key, 30000, async () => {
      const scopedCustomerIds = await this.resolveCustomerScope(tenantId, {
        city: filters?.city,
      });
      if (scopedCustomerIds && scopedCustomerIds.length === 0) {
        return {
          current: {
            totalSales: 0,
            totalMargin: 0,
            totalUnits: 0,
            totalInvoices: 0,
            uniqueCustomers: 0,
            avgTicket: 0,
          },
          compare: {
            totalSales: 0,
            totalMargin: 0,
            totalUnits: 0,
            totalInvoices: 0,
          },
          series: [],
        };
      }

      const trimmedBrand = filters?.brand?.trim();
      const trimmedVendor = filters?.vendor?.trim();
      const currentWhere: Prisma.InvoiceWhereInput = {
        tenantId,
        issuedAt: { gte: from, lte: to },
        ...(scopedCustomerIds ? { customerId: { in: scopedCustomerIds } } : {}),
        ...(trimmedVendor ? { vendor: { equals: trimmedVendor } } : {}),
        ...(trimmedBrand
          ? {
              items: {
                some: {
                  brand: { contains: trimmedBrand, mode: Prisma.QueryMode.insensitive },
                },
              },
            }
          : {}),
      };
      const compareWhere: Prisma.InvoiceWhereInput = {
        tenantId,
        issuedAt: { gte: compareFrom, lte: compareTo },
        ...(scopedCustomerIds ? { customerId: { in: scopedCustomerIds } } : {}),
        ...(trimmedVendor ? { vendor: { equals: trimmedVendor } } : {}),
        ...(trimmedBrand
          ? {
              items: {
                some: {
                  brand: { contains: trimmedBrand, mode: Prisma.QueryMode.insensitive },
                },
              },
            }
          : {}),
      };

      // Serie por día: siempre desde Invoice para que sum(serie) = total (misma fuente)
      const seriesPromise: Promise<
        Array<{
          date: Date;
          totalSales: number;
          totalInvoices: number;
          totalUnits: number;
          totalMargin: number;
        }>
      > = (async () => {
        const vendorAnd = trimmedVendor
          ? Prisma.sql` AND i."vendor" = ${trimmedVendor}`
          : Prisma.sql``;
        if (trimmedBrand) {
          const brandPattern = `%${trimmedBrand}%`;
          const rows = await this.prisma.$queryRaw<
            Array<{
              date: Date;
              totalSales: string;
              totalInvoices: bigint;
              totalUnits: string;
              totalMargin: string;
            }>
          >(
            scopedCustomerIds?.length
              ? Prisma.sql`
                  SELECT
                    date(i."issuedAt") as "date",
                    SUM(i."signedTotal")::text as "totalSales",
                    COUNT(*)::bigint as "totalInvoices",
                    COALESCE(SUM(i."signedUnits"), 0)::text as "totalUnits",
                    SUM(i."signedMargin")::text as "totalMargin"
                  FROM "Invoice" i
                  INNER JOIN "InvoiceItem" it ON it."invoiceId" = i.id AND it.brand ILIKE ${brandPattern}
                  WHERE i."tenantId" = ${tenantId}
                    AND i."issuedAt" >= ${from}
                    AND i."issuedAt" <= ${to}
                    AND i."customerId" IN (${Prisma.join(scopedCustomerIds)})${vendorAnd}
                  GROUP BY date(i."issuedAt")
                  ORDER BY 1
                `
              : Prisma.sql`
                  SELECT
                    date(i."issuedAt") as "date",
                    SUM(i."signedTotal")::text as "totalSales",
                    COUNT(*)::bigint as "totalInvoices",
                    COALESCE(SUM(i."signedUnits"), 0)::text as "totalUnits",
                    SUM(i."signedMargin")::text as "totalMargin"
                  FROM "Invoice" i
                  INNER JOIN "InvoiceItem" it ON it."invoiceId" = i.id AND it.brand ILIKE ${brandPattern}
                  WHERE i."tenantId" = ${tenantId}
                    AND i."issuedAt" >= ${from}
                    AND i."issuedAt" <= ${to}${vendorAnd}
                  GROUP BY date(i."issuedAt")
                  ORDER BY 1
                `,
          );
          return rows.map((r) => ({
            date: new Date(r.date),
            totalSales: Number(r.totalSales ?? 0),
            totalInvoices: Number(r.totalInvoices ?? 0),
            totalUnits: Number(r.totalUnits ?? 0),
            totalMargin: Number(r.totalMargin ?? 0),
          }));
        }
        // Sin marca: agregar Invoice por día (misma fuente que totales)
        const rows = await this.prisma.$queryRaw<
          Array<{
            date: Date;
            totalSales: string;
            totalInvoices: bigint;
            totalUnits: string;
            totalMargin: string;
          }>
        >(
          scopedCustomerIds?.length
            ? Prisma.sql`
                SELECT
                  date(i."issuedAt") as "date",
                  SUM(i."signedTotal")::text as "totalSales",
                  COUNT(*)::bigint as "totalInvoices",
                  COALESCE(SUM(i."signedUnits"), 0)::text as "totalUnits",
                  SUM(i."signedMargin")::text as "totalMargin"
                FROM "Invoice" i
                WHERE i."tenantId" = ${tenantId}
                  AND i."issuedAt" >= ${from}
                  AND i."issuedAt" <= ${to}
                  AND i."customerId" IN (${Prisma.join(scopedCustomerIds)})${vendorAnd}
                GROUP BY date(i."issuedAt")
                ORDER BY 1
              `
            : Prisma.sql`
                SELECT
                  date(i."issuedAt") as "date",
                  SUM(i."signedTotal")::text as "totalSales",
                  COUNT(*)::bigint as "totalInvoices",
                  COALESCE(SUM(i."signedUnits"), 0)::text as "totalUnits",
                  SUM(i."signedMargin")::text as "totalMargin"
                FROM "Invoice" i
                WHERE i."tenantId" = ${tenantId}
                  AND i."issuedAt" >= ${from}
                  AND i."issuedAt" <= ${to}${vendorAnd}
                GROUP BY date(i."issuedAt")
                ORDER BY 1
              `,
        );
        return rows.map((r) => ({
          date: new Date(r.date),
          totalSales: Number(r.totalSales ?? 0),
          totalInvoices: Number(r.totalInvoices ?? 0),
          totalUnits: Number(r.totalUnits ?? 0),
          totalMargin: Number(r.totalMargin ?? 0),
        }));
      })();

      const [current, compare, distinctCustomers, seriesRows] = await Promise.all([
        this.prisma.invoice.aggregate({
          where: currentWhere,
          _sum: { signedTotal: true, signedMargin: true, signedUnits: true },
          _count: { _all: true },
        }),
        this.prisma.invoice.aggregate({
          where: compareWhere,
          _sum: { signedTotal: true, signedMargin: true, signedUnits: true },
          _count: { _all: true },
        }),
        this.prisma.invoice.findMany({
          where: currentWhere,
          distinct: ['customerId'],
          select: { customerId: true },
        }),
        seriesPromise,
      ]);

      const currentSum = current._sum ?? {};
      const currentCount =
        typeof current._count === 'object' && current._count ? current._count : { _all: 0 };
      const compareSum = compare._sum ?? {};
      const compareCount =
        typeof compare._count === 'object' && compare._count ? compare._count : { _all: 0 };

      return {
        current: {
          totalSales: Number(currentSum.signedTotal ?? 0),
          totalMargin: Number(currentSum.signedMargin ?? 0),
          totalUnits: Number(currentSum.signedUnits ?? 0),
          totalInvoices: currentCount._all ?? 0,
          uniqueCustomers: distinctCustomers.length,
          avgTicket:
            (currentCount._all ?? 0) > 0
              ? Number(currentSum.signedTotal ?? 0) / (currentCount._all ?? 0)
              : 0,
        },
        compare: {
          totalSales: Number(compareSum.signedTotal ?? 0),
          totalMargin: Number(compareSum.signedMargin ?? 0),
          totalUnits: Number(compareSum.signedUnits ?? 0),
          totalInvoices: compareCount._all ?? 0,
        },
        series: seriesRows,
      };
    });
  }

  async getFilterOptions(tenantId: string) {
    const key = `filterOptions:${tenantId}`;
    return this.getCached(key, 60000, async () => {
      const [cities, vendors, brandFromTable, brandsFromItems] = await Promise.all([
        this.prisma.customer
          .groupBy({
            by: ['city'],
            where: { tenantId, city: { not: null } },
          })
          .then((rows) =>
            rows
              .map((r) => r.city)
              .filter((c): c is string => c != null && c.trim() !== '')
              .sort((a, b) => a.localeCompare(b, 'es')),
          ),
        this.prisma.invoice
          .groupBy({
            by: ['vendor'],
            where: { tenantId, vendor: { not: null } },
          })
          .then((rows) =>
            rows
              .map((r) => r.vendor)
              .filter((v): v is string => v != null && v.trim() !== '')
              .sort((a, b) => a.localeCompare(b, 'es')),
          ),
        this.prisma.productBrand
          .findMany({
            where: { tenantId },
            select: { name: true },
            orderBy: { name: 'asc' },
          })
          .then((rows) => rows.map((r) => r.name).filter((n) => n?.trim())),
        this.prisma.invoiceItem
          .groupBy({
            by: ['brand'],
            where: {
              tenantId,
              brand: { notIn: ['', 'Sin marca'] },
            },
          })
          .then((rows) =>
            rows
              .map((r) => r.brand)
              .filter((b): b is string => b != null && b.trim() !== '')
              .sort((a, b) => a.localeCompare(b, 'es')),
          ),
      ]);
      const brands =
        brandFromTable.length > 0 ? brandFromTable : [...new Set(brandsFromItems)];
      return { cities, vendors, brands };
    });
  }

  async getSalesTotal(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string; brand?: string },
  ) {
    const key = [
      tenantId,
      from.toISOString(),
      to.toISOString(),
      filters?.city?.trim() ?? '',
      filters?.vendor?.trim() ?? '',
      filters?.brand?.trim() ?? '',
    ].join('|');
    return this.getCached(key, 30000, async () => {
      const scopedCustomerIds = await this.resolveCustomerScope(tenantId, {
        city: filters?.city,
      });
      if (scopedCustomerIds && scopedCustomerIds.length === 0) {
        return {
          totalSales: 0,
          totalMargin: 0,
          totalUnits: 0,
          totalInvoices: 0,
        };
      }
      const trimmedBrand = filters?.brand?.trim();
      const trimmedVendor = filters?.vendor?.trim();
      const totals = await this.prisma.invoice.aggregate({
        where: {
          tenantId,
          issuedAt: { gte: from, lte: to },
          ...(scopedCustomerIds ? { customerId: { in: scopedCustomerIds } } : {}),
          ...(trimmedVendor ? { vendor: { equals: trimmedVendor } } : {}),
          ...(trimmedBrand
            ? {
                items: {
                  some: {
                    brand: { contains: trimmedBrand, mode: Prisma.QueryMode.insensitive },
                  },
                },
              }
            : {}),
        },
        _sum: { signedTotal: true, signedMargin: true, signedUnits: true },
        _count: { _all: true },
      });
      const totalsSum = totals._sum ?? {};
      const totalsCount =
        typeof totals._count === 'object' && totals._count ? totals._count : { _all: 0 };
      return {
        totalSales: Number(totalsSum.signedTotal ?? 0),
        totalMargin: Number(totalsSum.signedMargin ?? 0),
        totalUnits: Number(totalsSum.signedUnits ?? 0),
        totalInvoices: totalsCount._all ?? 0,
      };
    });
  }

  async getSalesByClass(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string; brand?: string },
  ) {
    const scopedCustomerIds = await this.resolveCustomerScope(tenantId, {
      city: filters?.city,
    });
    const trimmedVendor = filters?.vendor?.trim();
    const trimmedBrand = filters?.brand?.trim();
    const brandCond =
      trimmedBrand ?
        Prisma.sql` AND it.brand ILIKE ${`%${trimmedBrand}%`}` :
        Prisma.empty;
    const vendorCond =
      trimmedVendor ? Prisma.sql` AND i."vendor" = ${trimmedVendor}` : Prisma.empty;
    const customerCond =
      scopedCustomerIds?.length
        ? Prisma.sql` AND i."customerId" IN (${Prisma.join(scopedCustomerIds)})`
        : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ classCode: string | null; totalSales: string; lineCount: bigint }>
    >(Prisma.sql`
      SELECT it."classCode",
        SUM(it.total * i."saleSign")::text as "totalSales",
        COUNT(*)::bigint as "lineCount"
      FROM "InvoiceItem" it
      INNER JOIN "Invoice" i ON i.id = it."invoiceId"
      WHERE it."tenantId" = ${tenantId}
        AND it."classCode" IS NOT NULL
        AND i."issuedAt" >= ${from}
        AND i."issuedAt" <= ${to}
        ${customerCond}${vendorCond}${brandCond}
      GROUP BY it."classCode"
      ORDER BY SUM(it.total * i."saleSign") DESC
    `);
    const codes = (rows.map((r) => r.classCode).filter(Boolean) ?? []) as string[];
    const nameMap = new Map<string, string>();
    if (codes.length > 0) {
      const classes = await this.prisma.productClass.findMany({
        where: { tenantId, code: { in: codes } },
        select: { code: true, name: true },
      });
      classes.forEach((c) => nameMap.set(c.code, c.name));
    }
    return rows.map((r) => ({
      classCode: r.classCode,
      className: nameMap.get(r.classCode ?? '') ?? r.classCode ?? '',
      totalSales: Number(r.totalSales ?? 0),
      count: Number(r.lineCount ?? 0),
    })).sort((a, b) => b.totalSales - a.totalSales);
  }
}
