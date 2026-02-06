import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    if (q.includes('riesgo') || q.includes('alerta')) {
      return this.topRisk(tenantId, from, to);
    }
    if (optionalCustomerId) {
      return this.customerSummary(tenantId, optionalCustomerId, from, to);
    }

    // Marcas: más vendida, menos vendida, que más venta perdió, o clientes que dejaron de comprar
    if (q.includes('marca')) {
      if (
        q.includes('más vendida') ||
        q.includes('mas vendida') ||
        q.includes('más vendió') ||
        q.includes('top marcas') ||
        q.includes('mejor marca')
      ) {
        return this.topBrands(tenantId, from, to, filters);
      }
      if (
        q.includes('menos vendida') ||
        q.includes('menos vendió') ||
        q.includes('que menos')
      ) {
        return this.bottomBrands(tenantId, from, to, filters);
      }
      if (
        q.includes('más venta perdió') ||
        q.includes('mas venta perdió') ||
        q.includes('más perdió') ||
        q.includes('que más perdió')
      ) {
        return this.brandMostLost(tenantId, from, to, filters);
      }
      return this.brandLost(tenantId, from, to);
    }

    // Vendedores: que más creció, que más vendió
    if (q.includes('vendedor')) {
      if (
        q.includes('más creció') ||
        q.includes('mas creció') ||
        q.includes('más crecimiento') ||
        q.includes('mejor crecimiento')
      ) {
        return this.topVendorGrowth(tenantId, from, to, filters);
      }
      if (
        q.includes('más vendió') ||
        q.includes('mas vendió') ||
        q.includes('mejor vendedor') ||
        q.includes('top vendedor')
      ) {
        return this.topVendors(tenantId, from, to, filters);
      }
    }

    if (q.includes('caida') || q.includes('caída') || q.includes('drop')) {
      return this.topDrop(tenantId, from, to);
    }

    // Productos: más vendido, top productos
    if (
      q.includes('producto') &&
      (q.includes('más vendido') ||
        q.includes('mas vendido') ||
        q.includes('top producto') ||
        q.includes('mejor producto'))
    ) {
      return this.topProducts(tenantId, from, to, filters);
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

  private async topBrands(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string },
  ): Promise<AiResponse> {
    const scopedIds = await this.resolveCustomerScope(tenantId, filters);
    const vendorCond = filters?.vendor?.trim()
      ? Prisma.sql` AND i."vendor" ILIKE ${`%${filters.vendor.trim()}%`}`
      : Prisma.empty;
    const customerCond =
      scopedIds?.length ? Prisma.sql` AND i."customerId" IN (${Prisma.join(scopedIds)})` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ brand: string; totalSales: string }>
    >(Prisma.sql`
      SELECT it.brand, SUM(it.total * i."saleSign")::text as "totalSales"
      FROM "InvoiceItem" it
      INNER JOIN "Invoice" i ON i.id = it."invoiceId"
      WHERE it."tenantId" = ${tenantId}
        AND i."issuedAt" >= ${from}
        AND i."issuedAt" <= ${to}
        ${customerCond}${vendorCond}
      GROUP BY it.brand
      ORDER BY SUM(it.total * i."saleSign") DESC
      LIMIT 10
    `);
    return {
      template: 'top_brands',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: rows.map((r) => ({
        brand: r.brand,
        totalSales: Number(r.totalSales ?? 0),
      })),
      explanation: 'Marcas con más ventas en el periodo.',
    };
  }

  private async bottomBrands(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string },
  ): Promise<AiResponse> {
    const scopedIds = await this.resolveCustomerScope(tenantId, filters);
    const vendorCond = filters?.vendor?.trim()
      ? Prisma.sql` AND i."vendor" ILIKE ${`%${filters.vendor.trim()}%`}`
      : Prisma.empty;
    const customerCond =
      scopedIds?.length ? Prisma.sql` AND i."customerId" IN (${Prisma.join(scopedIds)})` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ brand: string; totalSales: string }>
    >(Prisma.sql`
      SELECT it.brand, SUM(it.total * i."saleSign")::text as "totalSales"
      FROM "InvoiceItem" it
      INNER JOIN "Invoice" i ON i.id = it."invoiceId"
      WHERE it."tenantId" = ${tenantId}
        AND i."issuedAt" >= ${from}
        AND i."issuedAt" <= ${to}
        ${customerCond}${vendorCond}
      GROUP BY it.brand
      HAVING SUM(it.total * i."saleSign") > 0
      ORDER BY SUM(it.total * i."saleSign") ASC
      LIMIT 10
    `);
    return {
      template: 'bottom_brands',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: rows.map((r) => ({
        brand: r.brand,
        totalSales: Number(r.totalSales ?? 0),
      })),
      explanation: 'Marcas con menos ventas en el periodo.',
    };
  }

  private async brandMostLost(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string },
  ): Promise<AiResponse> {
    const compareFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const compareTo = from;
    const scopedIds = await this.resolveCustomerScope(tenantId, filters);
    const vendorCond = filters?.vendor?.trim()
      ? Prisma.sql` AND i."vendor" ILIKE ${`%${filters.vendor.trim()}%`}`
      : Prisma.empty;
    const customerCond =
      scopedIds?.length ? Prisma.sql` AND i."customerId" IN (${Prisma.join(scopedIds)})` : Prisma.empty;
    const [current, compare] = await Promise.all([
      this.prisma.$queryRaw<Array<{ brand: string; totalSales: string }>>(
        Prisma.sql`
          SELECT it.brand, SUM(it.total * i."saleSign")::text as "totalSales"
          FROM "InvoiceItem" it
          INNER JOIN "Invoice" i ON i.id = it."invoiceId"
          WHERE it."tenantId" = ${tenantId}
            AND i."issuedAt" >= ${from}
            AND i."issuedAt" <= ${to}
            ${customerCond}${vendorCond}
          GROUP BY it.brand
        `,
      ),
      this.prisma.$queryRaw<Array<{ brand: string; totalSales: string }>>(
        Prisma.sql`
          SELECT it.brand, SUM(it.total * i."saleSign")::text as "totalSales"
          FROM "InvoiceItem" it
          INNER JOIN "Invoice" i ON i.id = it."invoiceId"
          WHERE it."tenantId" = ${tenantId}
            AND i."issuedAt" >= ${compareFrom}
            AND i."issuedAt" <= ${compareTo}
            ${customerCond}${vendorCond}
          GROUP BY it.brand
        `,
      ),
    ]);
    const compareMap = new Map(compare.map((r) => [r.brand, Number(r.totalSales ?? 0)]));
    const lost = current
      .map((r) => {
        const currentTotal = Number(r.totalSales ?? 0);
        const compareTotal = compareMap.get(r.brand) ?? 0;
        const lostAmount = compareTotal - currentTotal;
        return { brand: r.brand, lostAmount, currentTotal, compareTotal };
      })
      .filter((row) => row.lostAmount > 0)
      .sort((a, b) => b.lostAmount - a.lostAmount)
      .slice(0, 10);
    return {
      template: 'brand_most_lost',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: lost.map((r) => ({
        brand: r.brand,
        ventaPerdida: r.lostAmount,
        ventaActual: r.currentTotal,
        ventaPeriodoAnterior: r.compareTotal,
      })),
      explanation: 'Marcas que más venta perdieron vs periodo anterior.',
    };
  }

  private async topVendors(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string },
  ): Promise<AiResponse> {
    const scopedIds = await this.resolveCustomerScope(tenantId, filters);
    const rows = await this.prisma.invoice.groupBy({
      by: ['vendor'],
      where: {
        tenantId,
        issuedAt: { gte: from, lte: to },
        vendor: { not: null },
        ...(scopedIds ? { customerId: { in: scopedIds } } : {}),
      },
      _sum: { signedTotal: true },
      orderBy: { _sum: { signedTotal: 'desc' } },
      take: 10,
    });
    return {
      template: 'top_vendors',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: rows.map((r) => ({
        vendor: r.vendor ?? 'N/A',
        totalSales: Number(r._sum.signedTotal ?? 0),
      })),
      explanation: 'Vendedores con más ventas en el periodo.',
    };
  }

  private async topProducts(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string },
  ): Promise<AiResponse> {
    const scopedIds = await this.resolveCustomerScope(tenantId, filters);
    const vendorCond = filters?.vendor?.trim()
      ? Prisma.sql` AND i."vendor" ILIKE ${`%${filters.vendor.trim()}%`}`
      : Prisma.empty;
    const customerCond =
      scopedIds?.length ? Prisma.sql` AND i."customerId" IN (${Prisma.join(scopedIds)})` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ productName: string; totalSales: string; units: string }>
    >(Prisma.sql`
      SELECT it."productName",
        SUM(it.total * i."saleSign")::text as "totalSales",
        SUM(it.quantity * i."saleSign")::text as "units"
      FROM "InvoiceItem" it
      INNER JOIN "Invoice" i ON i.id = it."invoiceId"
      WHERE it."tenantId" = ${tenantId}
        AND i."issuedAt" >= ${from}
        AND i."issuedAt" <= ${to}
        ${customerCond}${vendorCond}
      GROUP BY it."productName"
      ORDER BY SUM(it.total * i."saleSign") DESC
      LIMIT 10
    `);
    return {
      template: 'top_products',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: rows.map((r) => ({
        producto: r.productName,
        totalSales: Number(r.totalSales ?? 0),
        unidades: Number(r.units ?? 0),
      })),
      explanation: 'Productos con más ventas en el periodo.',
    };
  }

  private async topVendorGrowth(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string },
  ): Promise<AiResponse> {
    const compareFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const compareTo = from;
    const scopedIds = await this.resolveCustomerScope(tenantId, filters);
    const [current, compare] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['vendor'],
        where: {
          tenantId,
          issuedAt: { gte: from, lte: to },
          vendor: { not: null },
          ...(scopedIds ? { customerId: { in: scopedIds } } : {}),
        },
        _sum: { signedTotal: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['vendor'],
        where: {
          tenantId,
          issuedAt: { gte: compareFrom, lte: compareTo },
          vendor: { not: null },
          ...(scopedIds ? { customerId: { in: scopedIds } } : {}),
        },
        _sum: { signedTotal: true },
      }),
    ]);
    const compareMap = new Map(
      compare.map((r) => [r.vendor ?? '', Number(r._sum.signedTotal ?? 0)]),
    );
    const growth = current
      .map((r) => {
        const currentTotal = Number(r._sum.signedTotal ?? 0);
        const compareTotal = compareMap.get(r.vendor ?? '') ?? 0;
        const growthPercent =
          compareTotal > 0 ? ((currentTotal - compareTotal) / compareTotal) * 100 : 0;
        return {
          vendor: r.vendor ?? 'N/A',
          growthPercent,
          currentSales: currentTotal,
          compareSales: compareTotal,
        };
      })
      .filter((row) => row.growthPercent > 0)
      .sort((a, b) => b.growthPercent - a.growthPercent)
      .slice(0, 10);
    return {
      template: 'top_vendor_growth',
      period: { from: from.toISOString(), to: to.toISOString() },
      rows: growth.map((r) => ({
        vendor: r.vendor,
        crecimientoPorcentaje: Number(r.growthPercent.toFixed(1)),
        ventaActual: r.currentSales,
        ventaPeriodoAnterior: r.compareSales,
      })),
      explanation: 'Vendedores con mayor crecimiento vs periodo anterior.',
    };
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
