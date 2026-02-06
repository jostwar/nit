import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsScheduler {
  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 1 * * *')
  async recalcDaily() {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
    targetDate.setHours(0, 0, 0, 0);
    const nextDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    for (const tenant of tenants) {
      const customers = await this.prisma.customer.findMany({
        where: { tenantId: tenant.id },
        select: { id: true },
      });
      for (const customer of customers) {
        const agg = await this.prisma.invoice.aggregate({
          where: {
            tenantId: tenant.id,
            customerId: customer.id,
            issuedAt: { gte: targetDate, lt: nextDate },
          },
          _sum: { signedTotal: true, signedMargin: true, signedUnits: true },
          _count: { _all: true },
        });
        await this.prisma.metricsDaily.upsert({
          where: {
            tenantId_customerId_date: {
              tenantId: tenant.id,
              customerId: customer.id,
              date: targetDate,
            },
          },
          create: {
            tenantId: tenant.id,
            customerId: customer.id,
            date: targetDate,
            totalSales: agg._sum.signedTotal ?? 0,
            totalInvoices: agg._count._all,
            totalUnits: agg._sum.signedUnits ?? 0,
            totalMargin: agg._sum.signedMargin ?? 0,
            avgTicket:
              agg._count._all > 0
                ? Number(agg._sum.signedTotal ?? 0) / agg._count._all
                : 0,
          },
          update: {
            totalSales: agg._sum.signedTotal ?? 0,
            totalInvoices: agg._count._all,
            totalUnits: agg._sum.signedUnits ?? 0,
            totalMargin: agg._sum.signedMargin ?? 0,
            avgTicket:
              agg._count._all > 0
                ? Number(agg._sum.signedTotal ?? 0) / agg._count._all
                : 0,
          },
        });
      }
    }
  }
}
