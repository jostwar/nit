import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

  private sanitizeName(name?: string | null, nit?: string | null) {
    if (!name) return 'Cliente sin nombre';
    const trimmed = name.trim();
    if (!trimmed) return 'Cliente sin nombre';
    if (nit && trimmed === nit) return 'Cliente sin nombre';
    if (/^\d+$/.test(trimmed)) return 'Cliente sin nombre';
    if (/^cliente\s+\d+/i.test(trimmed)) return 'Cliente sin nombre';
    return trimmed;
  }

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

  async searchCustomers(
    tenantId: string,
    search?: string,
    from?: Date,
    to?: Date,
    page = 1,
    pageSize = 1000,
    city?: string,
    vendor?: string,
    brand?: string,
  ) {
    const trimmedCity = city?.trim();
    const trimmedVendor = vendor?.trim();
    const trimmedBrand = brand?.trim();
    const key = [
      tenantId,
      search ?? '',
      from?.toISOString() ?? '',
      to?.toISOString() ?? '',
      page,
      pageSize,
      trimmedCity ?? '',
      trimmedVendor ?? '',
      trimmedBrand ?? '',
    ].join('|');

    return this.getCached(key, 30000, async () => {
      let scopedCustomerIds: string[] | null = null;
      if (trimmedCity || trimmedVendor) {
        const scopedCustomers = await this.prisma.customer.findMany({
          where: {
            tenantId,
            ...(trimmedCity ? { city: { contains: trimmedCity, mode: 'insensitive' } } : {}),
            ...(trimmedVendor
              ? { vendor: { contains: trimmedVendor, mode: 'insensitive' } }
              : {}),
          },
          select: { id: true },
          take: 20000,
        });
        scopedCustomerIds = scopedCustomers.map((customer) => customer.id);
        if (scopedCustomerIds.length === 0) return [];
      }

      let brandCustomerIds: string[] | null = null;
      if (trimmedBrand) {
        const brandRows = await this.prisma.invoice.groupBy({
          by: ['customerId'],
          where: {
            tenantId,
            issuedAt: { gte: from, lte: to },
            items: { some: { brand: { contains: trimmedBrand, mode: 'insensitive' } } },
            ...(scopedCustomerIds ? { customerId: { in: scopedCustomerIds } } : {}),
          },
        });
        brandCustomerIds = brandRows.map((row) => row.customerId);
        if (brandCustomerIds.length === 0) return [];
      }

      const customers = await this.prisma.customer.findMany({
        where: {
          tenantId,
          ...(brandCustomerIds ? { id: { in: brandCustomerIds } } : {}),
          ...(trimmedCity ? { city: { contains: trimmedCity, mode: 'insensitive' } } : {}),
          ...(trimmedVendor
            ? { vendor: { contains: trimmedVendor, mode: 'insensitive' } }
            : {}),
          OR: search
            ? [
                { nit: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
              ]
            : undefined,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      if (customers.length === 0) {
        return [];
      }

      const metrics = await this.prisma.invoice.groupBy({
        by: ['customerId'],
        where: {
          tenantId,
          customerId: { in: customers.map((customer) => customer.id) },
          issuedAt: { gte: from, lte: to },
          ...(trimmedBrand
            ? { items: { some: { brand: { contains: trimmedBrand, mode: 'insensitive' } } } }
            : {}),
        },
        _sum: { signedTotal: true, signedMargin: true, signedUnits: true },
        _count: { _all: true },
      });

      const metricsMap = new Map(
        metrics.map((row) => [
          row.customerId,
          {
            totalSales: Number(row._sum.signedTotal ?? 0),
            totalMargin: Number(row._sum.signedMargin ?? 0),
            totalUnits: Number(row._sum.signedUnits ?? 0),
            totalInvoices: row._count._all,
          },
        ]),
      );

      return customers.map((customer) => {
        const totals = metricsMap.get(customer.id) ?? {
          totalSales: 0,
          totalMargin: 0,
          totalUnits: 0,
          totalInvoices: 0,
        };
        return {
          id: customer.id,
          nit: customer.nit,
          name: this.sanitizeName(customer.name, customer.nit),
          segment: customer.segment,
          city: customer.city,
          totalSales: totals.totalSales,
          totalMargin: totals.totalMargin,
          totalUnits: totals.totalUnits,
          totalInvoices: totals.totalInvoices,
        };
      });
    });
  }

  async getOverview(
    tenantId: string,
    customerId: string,
    from?: Date,
    to?: Date,
    compareFrom?: Date,
    compareTo?: Date,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const current = await this.prisma.invoice.aggregate({
      where: { tenantId, customerId, issuedAt: { gte: from, lte: to } },
      _sum: { signedTotal: true, signedMargin: true, signedUnits: true },
      _count: { _all: true },
    });
    const compare = await this.prisma.invoice.aggregate({
      where: { tenantId, customerId, issuedAt: { gte: compareFrom, lte: compareTo } },
      _sum: { signedTotal: true, signedMargin: true, signedUnits: true },
      _count: { _all: true },
    });

    const series = await this.prisma.metricsDaily.findMany({
      where: { tenantId, customerId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        totalSales: true,
        totalInvoices: true,
        totalUnits: true,
        totalMargin: true,
        avgTicket: true,
      },
    });

    const lastPurchase = await this.prisma.invoice.aggregate({
      where: { tenantId, customerId, issuedAt: { lte: to } },
      _max: { issuedAt: true },
    });

    return {
      customer: {
        id: customer.id,
        nit: customer.nit,
        name: this.sanitizeName(customer.name, customer.nit),
      },
      lastPurchaseAt: lastPurchase._max.issuedAt,
      current: {
        totalSales: Number(current._sum.signedTotal ?? 0),
        totalMargin: Number(current._sum.signedMargin ?? 0),
        totalUnits: Number(current._sum.signedUnits ?? 0),
        totalInvoices: current._count._all,
      },
      compare: {
        totalSales: Number(compare._sum.signedTotal ?? 0),
        totalMargin: Number(compare._sum.signedMargin ?? 0),
        totalUnits: Number(compare._sum.signedUnits ?? 0),
        totalInvoices: compare._count._all,
      },
      series: series.map((row) => ({
        date: row.date,
        totalSales: Number(row.totalSales),
        totalMargin: Number(row.totalMargin),
        totalUnits: row.totalUnits,
        totalInvoices: row.totalInvoices,
        avgTicket: Number(row.avgTicket),
      })),
    };
  }

  async getBrands(
    tenantId: string,
    customerId: string,
    from?: Date,
    to?: Date,
    compareFrom?: Date,
    compareTo?: Date,
  ) {
    const [current, compare] = await Promise.all([
      this.prisma.$queryRaw<Array<{ brand: string; currentTotal: string }>>(
        Prisma.sql`
          SELECT it.brand, SUM(it.total * i."saleSign")::text as "currentTotal"
          FROM "InvoiceItem" it
          INNER JOIN "Invoice" i ON i.id = it."invoiceId"
          WHERE it."tenantId" = ${tenantId} AND i."customerId" = ${customerId}
            AND i."issuedAt" >= ${from} AND i."issuedAt" <= ${to}
          GROUP BY it.brand
          ORDER BY SUM(it.total * i."saleSign") DESC
        `,
      ),
      this.prisma.$queryRaw<Array<{ brand: string; compareTotal: string }>>(
        Prisma.sql`
          SELECT it.brand, SUM(it.total * i."saleSign")::text as "compareTotal"
          FROM "InvoiceItem" it
          INNER JOIN "Invoice" i ON i.id = it."invoiceId"
          WHERE it."tenantId" = ${tenantId} AND i."customerId" = ${customerId}
            AND i."issuedAt" >= ${compareFrom} AND i."issuedAt" <= ${compareTo}
          GROUP BY it.brand
          ORDER BY SUM(it.total * i."saleSign") DESC
        `,
      ),
    ]);
    const compareMap = new Map(compare.map((row) => [row.brand, Number(row.compareTotal ?? 0)]));
    if (current.length === 0) {
      const [currentTotals, compareTotals] = await Promise.all([
        this.prisma.invoice.aggregate({
          where: { tenantId, customerId, issuedAt: { gte: from, lte: to } },
          _sum: { signedTotal: true },
        }),
        this.prisma.invoice.aggregate({
          where: { tenantId, customerId, issuedAt: { gte: compareFrom, lte: compareTo } },
          _sum: { signedTotal: true },
        }),
      ]);
      const currentTotal = Number(currentTotals._sum.signedTotal ?? 0);
      const compareTotal = Number(compareTotals._sum.signedTotal ?? 0);
      if (currentTotal === 0 && compareTotal === 0) {
        return [];
      }
      return [
        {
          brand: 'Sin detalle',
          currentTotal,
          compareTotal,
        },
      ];
    }
    return current.map((row) => ({
      brand: row.brand,
      currentTotal: Number(row.currentTotal ?? 0),
      compareTotal: compareMap.get(row.brand) ?? 0,
    }));
  }

  async getProducts(
    tenantId: string,
    customerId: string,
    from?: Date,
    to?: Date,
    compareFrom?: Date,
    compareTo?: Date,
    limit = 50,
  ) {
    const [current, compare] = await Promise.all([
      this.prisma.$queryRaw<Array<{ productName: string; currentTotal: string }>>(
        Prisma.sql`
          SELECT it."productName", SUM(it.total * i."saleSign")::text as "currentTotal"
          FROM "InvoiceItem" it
          INNER JOIN "Invoice" i ON i.id = it."invoiceId"
          WHERE it."tenantId" = ${tenantId} AND i."customerId" = ${customerId}
            AND i."issuedAt" >= ${from} AND i."issuedAt" <= ${to}
          GROUP BY it."productName"
          ORDER BY SUM(it.total * i."saleSign") DESC
          LIMIT ${limit}
        `,
      ),
      this.prisma.$queryRaw<Array<{ productName: string; compareTotal: string }>>(
        Prisma.sql`
          SELECT it."productName", SUM(it.total * i."saleSign")::text as "compareTotal"
          FROM "InvoiceItem" it
          INNER JOIN "Invoice" i ON i.id = it."invoiceId"
          WHERE it."tenantId" = ${tenantId} AND i."customerId" = ${customerId}
            AND i."issuedAt" >= ${compareFrom} AND i."issuedAt" <= ${compareTo}
          GROUP BY it."productName"
          ORDER BY SUM(it.total * i."saleSign") DESC
          LIMIT ${limit}
        `,
      ),
    ]);
    const compareMap = new Map(
      compare.map((row) => [row.productName, Number(row.compareTotal ?? 0)]),
    );
    if (current.length === 0) {
      const [currentTotals, compareTotals] = await Promise.all([
        this.prisma.invoice.aggregate({
          where: { tenantId, customerId, issuedAt: { gte: from, lte: to } },
          _sum: { signedTotal: true },
        }),
        this.prisma.invoice.aggregate({
          where: { tenantId, customerId, issuedAt: { gte: compareFrom, lte: compareTo } },
          _sum: { signedTotal: true },
        }),
      ]);
      const currentTotal = Number(currentTotals._sum.signedTotal ?? 0);
      const compareTotal = Number(compareTotals._sum.signedTotal ?? 0);
      if (currentTotal === 0 && compareTotal === 0) {
        return [];
      }
      return [
        {
          product: 'Sin detalle',
          currentTotal,
          compareTotal,
        },
      ];
    }
    return current.map((row) => ({
      product: row.productName,
      currentTotal: Number(row.currentTotal ?? 0),
      compareTotal: compareMap.get(row.productName) ?? 0,
    }));
  }

  async getCollections(tenantId: string, customerId: string) {
    const credit = await this.prisma.credit.findFirst({
      where: { tenantId, customerId },
    });
    const payments = await this.prisma.payment.findMany({
      where: { tenantId, customerId },
      orderBy: { paidAt: 'desc' },
      take: 20,
    });
    return {
      credit: credit
        ? {
            creditLimit: Number(credit.creditLimit),
            balance: Number(credit.balance),
            overdue: Number(credit.overdue),
            dsoDays: credit.dsoDays,
          }
        : null,
      payments: payments.map((p) => ({
        id: p.id,
        paidAt: p.paidAt,
        amount: Number(p.amount),
      })),
    };
  }
}
