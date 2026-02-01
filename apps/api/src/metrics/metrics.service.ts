import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardSummary(
    tenantId: string,
    from: Date,
    to: Date,
    compareFrom: Date,
    compareTo: Date,
  ) {
    const current = await this.prisma.invoice.aggregate({
      where: { tenantId, issuedAt: { gte: from, lte: to } },
      _sum: { total: true, margin: true, units: true },
      _count: { _all: true },
    });
    const compare = await this.prisma.invoice.aggregate({
      where: { tenantId, issuedAt: { gte: compareFrom, lte: compareTo } },
      _sum: { total: true, margin: true, units: true },
      _count: { _all: true },
    });
    const distinctCustomers = await this.prisma.invoice.findMany({
      where: { tenantId, issuedAt: { gte: from, lte: to } },
      distinct: ['customerId'],
      select: { customerId: true },
    });

    const series = await this.prisma.metricsDaily.groupBy({
      by: ['date'],
      where: { tenantId, date: { gte: from, lte: to } },
      _sum: {
        totalSales: true,
        totalInvoices: true,
        totalUnits: true,
        totalMargin: true,
      },
      orderBy: { date: 'asc' },
    });

    return {
      current: {
        totalSales: Number(current._sum.total ?? 0),
        totalMargin: Number(current._sum.margin ?? 0),
        totalUnits: Number(current._sum.units ?? 0),
        totalInvoices: current._count._all,
        uniqueCustomers: distinctCustomers.length,
        avgTicket:
          current._count._all > 0
            ? Number(current._sum.total ?? 0) / current._count._all
            : 0,
      },
      compare: {
        totalSales: Number(compare._sum.total ?? 0),
        totalMargin: Number(compare._sum.margin ?? 0),
        totalUnits: Number(compare._sum.units ?? 0),
        totalInvoices: compare._count._all,
      },
      series: series.map((row) => ({
        date: row.date,
        totalSales: Number(row._sum.totalSales ?? 0),
        totalInvoices: Number(row._sum.totalInvoices ?? 0),
        totalUnits: Number(row._sum.totalUnits ?? 0),
        totalMargin: Number(row._sum.totalMargin ?? 0),
      })),
    };
  }

  async getSalesTotal(tenantId: string, from: Date, to: Date) {
    const totals = await this.prisma.invoice.aggregate({
      where: { tenantId, issuedAt: { gte: from, lte: to } },
      _sum: { total: true, margin: true, units: true },
      _count: { _all: true },
    });
    return {
      totalSales: Number(totals._sum.total ?? 0),
      totalMargin: Number(totals._sum.margin ?? 0),
      totalUnits: Number(totals._sum.units ?? 0),
      totalInvoices: totals._count._all,
    };
  }
}
