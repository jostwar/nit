import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitizeName(name?: string | null, nit?: string | null) {
    if (!name) return 'Cliente sin nombre';
    const trimmed = name.trim();
    if (!trimmed) return 'Cliente sin nombre';
    if (nit && trimmed === nit) return 'Cliente sin nombre';
    if (/^\d+$/.test(trimmed)) return 'Cliente sin nombre';
    if (/^cliente\s+\d+/i.test(trimmed)) return 'Cliente sin nombre';
    return trimmed;
  }

  async searchCustomers(tenantId: string, search?: string, from?: Date, to?: Date) {
    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId,
        OR: search
          ? [
              { nit: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      orderBy: { name: 'asc' },
    });

    const results = await Promise.all(
      customers.map(async (customer) => {
        const metrics = await this.prisma.invoice.aggregate({
          where: {
            tenantId,
            customerId: customer.id,
            issuedAt: { gte: from, lte: to },
          },
          _sum: { total: true, margin: true, units: true },
          _count: { _all: true },
        });
        return {
          id: customer.id,
          nit: customer.nit,
          name: this.sanitizeName(customer.name, customer.nit),
          segment: customer.segment,
          city: customer.city,
          totalSales: Number(metrics._sum.total ?? 0),
          totalMargin: Number(metrics._sum.margin ?? 0),
          totalUnits: Number(metrics._sum.units ?? 0),
          totalInvoices: metrics._count._all,
        };
      }),
    );

    return results;
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
      _sum: { total: true, margin: true, units: true },
      _count: { _all: true },
    });
    const compare = await this.prisma.invoice.aggregate({
      where: { tenantId, customerId, issuedAt: { gte: compareFrom, lte: compareTo } },
      _sum: { total: true, margin: true, units: true },
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
        totalSales: Number(current._sum.total ?? 0),
        totalMargin: Number(current._sum.margin ?? 0),
        totalUnits: Number(current._sum.units ?? 0),
        totalInvoices: current._count._all,
      },
      compare: {
        totalSales: Number(compare._sum.total ?? 0),
        totalMargin: Number(compare._sum.margin ?? 0),
        totalUnits: Number(compare._sum.units ?? 0),
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
    const current = await this.prisma.invoiceItem.groupBy({
      by: ['brand'],
      where: {
        tenantId,
        invoice: { customerId, issuedAt: { gte: from, lte: to } },
      },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
    });
    const compare = await this.prisma.invoiceItem.groupBy({
      by: ['brand'],
      where: {
        tenantId,
        invoice: { customerId, issuedAt: { gte: compareFrom, lte: compareTo } },
      },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
    });

    const compareMap = new Map(compare.map((row) => [row.brand, Number(row._sum.total ?? 0)]));
    if (current.length === 0) {
      const currentTotals = await this.prisma.invoice.aggregate({
        where: { tenantId, customerId, issuedAt: { gte: from, lte: to } },
        _sum: { total: true },
      });
      const compareTotals = await this.prisma.invoice.aggregate({
        where: { tenantId, customerId, issuedAt: { gte: compareFrom, lte: compareTo } },
        _sum: { total: true },
      });
      const currentTotal = Number(currentTotals._sum.total ?? 0);
      const compareTotal = Number(compareTotals._sum.total ?? 0);
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
      currentTotal: Number(row._sum.total ?? 0),
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
    const current = await this.prisma.invoiceItem.groupBy({
      by: ['productName'],
      where: {
        tenantId,
        invoice: { customerId, issuedAt: { gte: from, lte: to } },
      },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });
    const compare = await this.prisma.invoiceItem.groupBy({
      by: ['productName'],
      where: {
        tenantId,
        invoice: { customerId, issuedAt: { gte: compareFrom, lte: compareTo } },
      },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });
    const compareMap = new Map(
      compare.map((row) => [row.productName, Number(row._sum.total ?? 0)]),
    );
    if (current.length === 0) {
      const currentTotals = await this.prisma.invoice.aggregate({
        where: { tenantId, customerId, issuedAt: { gte: from, lte: to } },
        _sum: { total: true },
      });
      const compareTotals = await this.prisma.invoice.aggregate({
        where: { tenantId, customerId, issuedAt: { gte: compareFrom, lte: compareTo } },
        _sum: { total: true },
      });
      const currentTotal = Number(currentTotals._sum.total ?? 0);
      const compareTotal = Number(compareTotals._sum.total ?? 0);
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
      currentTotal: Number(row._sum.total ?? 0),
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
