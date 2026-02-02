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

  private async resolveCustomerScope(
    tenantId: string,
    filters?: { city?: string; vendor?: string },
  ) {
    const city = filters?.city?.trim();
    const vendor = filters?.vendor?.trim();
    if (!city && !vendor) return null;
    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId,
        ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
        ...(vendor ? { vendor: { contains: vendor, mode: 'insensitive' } } : {}),
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
        vendor: filters?.vendor,
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
      const currentWhere: Prisma.InvoiceWhereInput = {
        tenantId,
        issuedAt: { gte: from, lte: to },
        ...(scopedCustomerIds ? { customerId: { in: scopedCustomerIds } } : {}),
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

      const current = await this.prisma.invoice.aggregate({
        where: currentWhere,
        _sum: { total: true, margin: true, units: true },
        _count: { _all: true },
      });
      const compare = await this.prisma.invoice.aggregate({
        where: compareWhere,
        _sum: { total: true, margin: true, units: true },
        _count: { _all: true },
      });
      const distinctCustomers = await this.prisma.invoice.findMany({
        where: currentWhere,
        distinct: ['customerId'],
        select: { customerId: true },
      });

      let seriesRows: Array<{
        date: Date;
        totalSales: number;
        totalInvoices: number;
        totalUnits: number;
        totalMargin: number;
      }> = [];
      if (trimmedBrand) {
        const invoices = await this.prisma.invoice.findMany({
          where: currentWhere,
          select: { issuedAt: true, total: true, margin: true, units: true },
        });
        const seriesMap = new Map<
          string,
          { totalSales: number; totalInvoices: number; totalUnits: number; totalMargin: number }
        >();
        invoices.forEach((invoice) => {
          const key = invoice.issuedAt.toISOString().slice(0, 10);
          const currentEntry = seriesMap.get(key) ?? {
            totalSales: 0,
            totalInvoices: 0,
            totalUnits: 0,
            totalMargin: 0,
          };
          currentEntry.totalSales += Number(invoice.total ?? 0);
          currentEntry.totalMargin += Number(invoice.margin ?? 0);
          currentEntry.totalUnits += Number(invoice.units ?? 0);
          currentEntry.totalInvoices += 1;
          seriesMap.set(key, currentEntry);
        });
        seriesRows = Array.from(seriesMap.entries())
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([date, totals]) => ({
            date: new Date(date),
            totalSales: totals.totalSales,
            totalInvoices: totals.totalInvoices,
            totalUnits: totals.totalUnits,
            totalMargin: totals.totalMargin,
          }));
      } else {
        const series = await this.prisma.metricsDaily.groupBy({
          by: ['date'],
          where: {
            tenantId,
            date: { gte: from, lte: to },
            ...(scopedCustomerIds ? { customerId: { in: scopedCustomerIds } } : {}),
          },
          _sum: {
            totalSales: true,
            totalInvoices: true,
            totalUnits: true,
            totalMargin: true,
          },
          orderBy: { date: 'asc' },
        });
        seriesRows = series.map((row) => ({
          date: row.date,
          totalSales: Number(row._sum.totalSales ?? 0),
          totalInvoices: Number(row._sum.totalInvoices ?? 0),
          totalUnits: Number(row._sum.totalUnits ?? 0),
          totalMargin: Number(row._sum.totalMargin ?? 0),
        }));
      }

      const currentSum = current._sum ?? {};
      const currentCount =
        typeof current._count === 'object' && current._count ? current._count : { _all: 0 };
      const compareSum = compare._sum ?? {};
      const compareCount =
        typeof compare._count === 'object' && compare._count ? compare._count : { _all: 0 };

      return {
        current: {
          totalSales: Number(currentSum.total ?? 0),
          totalMargin: Number(currentSum.margin ?? 0),
          totalUnits: Number(currentSum.units ?? 0),
          totalInvoices: currentCount._all ?? 0,
          uniqueCustomers: distinctCustomers.length,
          avgTicket:
            (currentCount._all ?? 0) > 0
              ? Number(currentSum.total ?? 0) / (currentCount._all ?? 0)
              : 0,
        },
        compare: {
          totalSales: Number(compareSum.total ?? 0),
          totalMargin: Number(compareSum.margin ?? 0),
          totalUnits: Number(compareSum.units ?? 0),
          totalInvoices: compareCount._all ?? 0,
        },
        series: seriesRows,
      };
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
        vendor: filters?.vendor,
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
      const totals = await this.prisma.invoice.aggregate({
        where: {
          tenantId,
          issuedAt: { gte: from, lte: to },
          ...(scopedCustomerIds ? { customerId: { in: scopedCustomerIds } } : {}),
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
        _sum: { total: true, margin: true, units: true },
        _count: { _all: true },
      });
      const totalsSum = totals._sum ?? {};
      const totalsCount =
        typeof totals._count === 'object' && totals._count ? totals._count : { _all: 0 };
      return {
        totalSales: Number(totalsSum.total ?? 0),
        totalMargin: Number(totalsSum.margin ?? 0),
        totalUnits: Number(totalsSum.units ?? 0),
        totalInvoices: totalsCount._all ?? 0,
      };
    });
  }
}
