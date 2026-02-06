import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AiResponse = {
  template: string;
  period: { from: string; to: string };
  rows: Array<Record<string, unknown>>;
  explanation: string;
};

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  async answer(
    tenantId: string,
    question: string,
    from: Date,
    to: Date,
    optionalCustomerId?: string,
    optionalCity?: string,
    optionalVendor?: string,
  ): Promise<AiResponse> {
    const q = question.toLowerCase();
    const filters = this.mergeFilters(this.extractFilters(question), {
      city: optionalCity,
      vendor: optionalVendor,
    });

    if (q.includes('dso') || q.includes('cartera')) {
      return this.dsoHigh(tenantId, from, to);
    }
    if (q.includes('marca')) {
      return this.brandLost(tenantId, from, to);
    }
    if (q.includes('caida') || q.includes('caída') || q.includes('drop')) {
      return this.topDrop(tenantId, from, to);
    }
    if (q.includes('riesgo') || q.includes('alerta')) {
      return this.topRisk(tenantId, from, to);
    }
    if (optionalCustomerId) {
      return this.customerSummary(tenantId, optionalCustomerId, from, to);
    }

    return this.topCustomers(tenantId, from, to, filters);
  }

  private extractFilters(question: string) {
    const cityMatch = question.match(/ciudad\s+([a-záéíóúñ\s]+)/i);
    const vendorMatch = question.match(/vendedor\s+([a-z0-9]+)/i);
    return {
      city: cityMatch ? cityMatch[1].trim() : undefined,
      vendor: vendorMatch ? vendorMatch[1].trim() : undefined,
    };
  }

  private mergeFilters(
    parsed: { city?: string; vendor?: string },
    explicit: { city?: string; vendor?: string },
  ) {
    return {
      city: explicit.city?.trim() || parsed.city,
      vendor: explicit.vendor?.trim() || parsed.vendor,
    };
  }

  private async resolveCustomerScope(
    tenantId: string,
    filters?: { city?: string; vendor?: string },
  ) {
    if (!filters?.city && !filters?.vendor) return null;
    const where: { tenantId: string; city?: object; vendor?: object } = { tenantId };
    if (filters.city) {
      where.city = { contains: filters.city, mode: 'insensitive' };
    }
    if (filters.vendor) {
      where.vendor = { contains: filters.vendor, mode: 'insensitive' };
    }
    const customers = await this.prisma.customer.findMany({
      where,
      select: { id: true },
      take: 2000,
    });
    return customers.map((c) => c.id);
  }

  private async topCustomers(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string },
  ): Promise<AiResponse> {
    const scopedIds = await this.resolveCustomerScope(tenantId, filters);
    if (scopedIds && scopedIds.length === 0) {
      return {
        template: 'top_customers',
        period: { from: from.toISOString(), to: to.toISOString() },
        rows: [],
        explanation: 'No se encontraron clientes para los filtros solicitados.',
      };
    }
    const rows = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        tenantId,
        issuedAt: { gte: from, lte: to },
        ...(scopedIds ? { customerId: { in: scopedIds } } : {}),
      },
      _sum: { signedTotal: true },
      orderBy: { _sum: { signedTotal: 'desc' } },
      take: 10,
    });
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: rows.map((r) => r.customerId) } },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    return {
      template: 'top_customers',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: rows.map((row) => ({
        customerId: row.customerId,
        customerName: customerMap.get(row.customerId)?.name ?? 'N/A',
        customerNit: customerMap.get(row.customerId)?.nit ?? 'N/A',
        totalSales: Number(row._sum.signedTotal ?? 0),
      })),
      explanation: 'Top clientes por ventas en el periodo consultado.',
    };
  }

  private async topRisk(tenantId: string, from: Date, to: Date): Promise<AiResponse> {
    const events = await this.prisma.alertEvent.findMany({
      where: { tenantId, status: 'OPEN' },
      include: { customer: true, rule: true },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    return {
      template: 'top_risk_customers',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: events.map((event) => ({
        customerId: event.customerId,
        customerName: event.customer.name,
        customerNit: event.customer.nit,
        rule: event.rule.name,
        message: event.message,
      })),
      explanation: 'Clientes con alertas abiertas más recientes.',
    };
  }

  private async topDrop(tenantId: string, from: Date, to: Date): Promise<AiResponse> {
    const compareFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const compareTo = from;
    const current = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: { tenantId, issuedAt: { gte: from, lte: to } },
      _sum: { signedTotal: true },
    });
    const compare = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: { tenantId, issuedAt: { gte: compareFrom, lte: compareTo } },
      _sum: { signedTotal: true },
    });
    const compareMap = new Map(
      compare.map((row) => [row.customerId, Number(row._sum.signedTotal ?? 0)]),
    );
    const drops = current
      .map((row) => {
        const currentTotal = Number(row._sum.signedTotal ?? 0);
        const compareTotal = compareMap.get(row.customerId) ?? 0;
        const dropPercent =
          compareTotal > 0 ? ((compareTotal - currentTotal) / compareTotal) * 100 : 0;
        return { customerId: row.customerId, dropPercent, currentTotal };
      })
      .filter((row) => row.dropPercent > 0)
      .sort((a, b) => b.dropPercent - a.dropPercent)
      .slice(0, 10);

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: drops.map((d) => d.customerId) } },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    return {
      template: 'top_drop_customers',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: drops.map((row) => ({
        customerId: row.customerId,
        customerName: customerMap.get(row.customerId)?.name ?? 'N/A',
        customerNit: customerMap.get(row.customerId)?.nit ?? 'N/A',
        dropPercent: Number(row.dropPercent.toFixed(1)),
        currentSales: row.currentTotal,
      })),
      explanation: 'Clientes con mayor caída vs periodo anterior.',
    };
  }

  private async brandLost(tenantId: string, from: Date, to: Date): Promise<AiResponse> {
    const compareFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const compareTo = from;
    const current = await this.prisma.invoiceItem.findMany({
      where: { tenantId, invoice: { issuedAt: { gte: from, lte: to } } },
      select: { brand: true, invoice: { select: { customerId: true } } },
    });
    const compare = await this.prisma.invoiceItem.findMany({
      where: { tenantId, invoice: { issuedAt: { gte: compareFrom, lte: compareTo } } },
      select: { brand: true, invoice: { select: { customerId: true } } },
    });
    const currentSet = new Set(current.map((r) => `${r.invoice.customerId}:${r.brand}`));
    const lost = compare
      .map((r) => ({
        customerId: r.invoice.customerId,
        brand: r.brand,
        key: `${r.invoice.customerId}:${r.brand}`,
      }))
      .filter((row) => !currentSet.has(row.key))
      .slice(0, 10);

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: lost.map((row) => row.customerId) } },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    return {
      template: 'brand_lost',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: lost.map((row) => ({
        customerId: row.customerId,
        customerName: customerMap.get(row.customerId)?.name ?? 'N/A',
        customerNit: customerMap.get(row.customerId)?.nit ?? 'N/A',
        brand: row.brand,
      })),
      explanation: 'Clientes que dejaron de comprar marcas vs periodo anterior.',
    };
  }

  private async dsoHigh(tenantId: string, from: Date, to: Date): Promise<AiResponse> {
    const credits = await this.prisma.credit.findMany({
      where: { tenantId },
      orderBy: { dsoDays: 'desc' },
      take: 10,
    });
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: credits.map((c) => c.customerId) } },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    return {
      template: 'dso_high',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: credits.map((credit) => ({
        customerId: credit.customerId,
        customerName: customerMap.get(credit.customerId)?.name ?? 'N/A',
        customerNit: customerMap.get(credit.customerId)?.nit ?? 'N/A',
        dsoDays: credit.dsoDays,
        overdue: Number(credit.overdue),
      })),
      explanation: 'Clientes con DSO alto y mayor saldo vencido.',
    };
  }

  private async customerSummary(
    tenantId: string,
    customerId: string,
    from: Date,
    to: Date,
  ): Promise<AiResponse> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    const metrics = await this.prisma.invoice.aggregate({
      where: { tenantId, customerId, issuedAt: { gte: from, lte: to } },
      _sum: { signedTotal: true, signedMargin: true, signedUnits: true },
      _count: { _all: true },
    });
    return {
      template: 'customer_summary',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: [
        {
          customerId,
          customerName: customer?.name ?? 'N/A',
          customerNit: customer?.nit ?? 'N/A',
          totalSales: Number(metrics._sum.signedTotal ?? 0),
          totalMargin: Number(metrics._sum.signedMargin ?? 0),
          totalUnits: Number(metrics._sum.signedUnits ?? 0),
          totalInvoices: metrics._count._all,
        },
      ],
      explanation: 'Resumen del cliente para el periodo solicitado.',
    };
  }
}
