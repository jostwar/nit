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

  /** Valores de marca a considerar (nombre o código) para filtrar por nombre seleccionado. */
  private async getBrandMatchValues(tenantId: string, brandFilter: string): Promise<string[]> {
    const trimmed = brandFilter?.trim();
    if (!trimmed) return [];
    const rows = await this.prisma.productBrand.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: trimmed, mode: 'insensitive' } },
          { code: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: { code: true, name: true },
    });
    const values = new Set<string>([trimmed]);
    rows.forEach((r) => {
      if (r.code?.trim()) values.add(r.code.trim());
      if (r.name?.trim()) values.add(r.name.trim());
    });
    return Array.from(values);
  }

  /** Códigos de clase que coinciden con el nombre (filtro por clase). */
  private async getClassMatchCodes(tenantId: string, classFilter: string): Promise<string[]> {
    const trimmed = classFilter?.trim();
    if (!trimmed) return [];
    const rows = await this.prisma.productClass.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: trimmed, mode: 'insensitive' } },
          { code: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: { code: true },
    });
    return rows.map((r) => r.code.trim()).filter(Boolean);
  }

  /** Condición Prisma para filtro por clase. */
  private async classFilterWhere(
    tenantId: string,
    classFilter: string | undefined,
  ): Promise<Prisma.InvoiceWhereInput> {
    const codes = classFilter?.trim()
      ? await this.getClassMatchCodes(tenantId, classFilter.trim())
      : [];
    if (codes.length === 0) return {};
    return {
      items: {
        some: { classCode: { in: codes } },
      },
    };
  }

  /** Condición Prisma para filtro por marca (nombre o código). */
  private async brandFilterWhere(
    tenantId: string,
    brandFilter: string | undefined,
  ): Promise<Prisma.InvoiceWhereInput> {
    const trimmed = brandFilter?.trim();
    if (!trimmed) return {};
    const values = await this.getBrandMatchValues(tenantId, trimmed);
    return {
      items: {
        some: {
          OR: [
            ...(values.length > 0 ? [{ brand: { in: values } }] : []),
            { brand: { contains: trimmed, mode: Prisma.QueryMode.insensitive } },
          ],
        },
      },
    };
  }

  /** Where para filtro ciudad: Customer.city O Invoice.city (NOMSEC, etc.). */
  private cityFilterWhere(
    scopedCustomerIds: string[] | null,
    cityFilter: string | undefined,
  ): Prisma.InvoiceWhereInput {
    const city = cityFilter?.trim();
    if (!city) {
      return scopedCustomerIds?.length
        ? { customerId: { in: scopedCustomerIds } }
        : {};
    }
    return {
      OR: [
        ...(scopedCustomerIds?.length
          ? [{ customerId: { in: scopedCustomerIds } }]
          : []),
        { city: { contains: city, mode: Prisma.QueryMode.insensitive } },
      ],
    };
  }

  async getDashboardSummary(
    tenantId: string,
    from: Date,
    to: Date,
    compareFrom: Date,
    compareTo: Date,
    filters?: { city?: string; vendor?: string; brand?: string; class?: string },
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
      filters?.class?.trim() ?? '',
    ].join('|');

    return this.getCached(key, 30000, async () => {
      const scopedCustomerIds = await this.resolveCustomerScope(tenantId, {
        city: filters?.city,
      });
      const trimmedVendor = filters?.vendor?.trim();
      const trimmedBrand = filters?.brand?.trim();
      const cityWhere = this.cityFilterWhere(scopedCustomerIds ?? [], filters?.city);
      const brandWhere = await this.brandFilterWhere(tenantId, filters?.brand);
      const classWhere = await this.classFilterWhere(tenantId, filters?.class);
      const brandValues = trimmedBrand ? await this.getBrandMatchValues(tenantId, trimmedBrand) : [];
      const currentWhere: Prisma.InvoiceWhereInput = {
        tenantId,
        issuedAt: { gte: from, lte: to },
        ...cityWhere,
        ...(trimmedVendor ? { vendor: { equals: trimmedVendor } } : {}),
        ...brandWhere,
        ...classWhere,
      };
      const compareWhere: Prisma.InvoiceWhereInput = {
        tenantId,
        issuedAt: { gte: compareFrom, lte: compareTo },
        ...cityWhere,
        ...(trimmedVendor ? { vendor: { equals: trimmedVendor } } : {}),
        ...brandWhere,
        ...classWhere,
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
          const brandJoinCond =
            brandValues.length > 0
              ? Prisma.sql` AND (it.brand IN (${Prisma.join(brandValues.map((b) => Prisma.sql`${b}`))}) OR it.brand ILIKE ${brandPattern})`
              : Prisma.sql` AND it.brand ILIKE ${brandPattern}`;
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
                  INNER JOIN "InvoiceItem" it ON it."invoiceId" = i.id${brandJoinCond}
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
                  INNER JOIN "InvoiceItem" it ON it."invoiceId" = i.id${brandJoinCond}
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
      const [
        citiesFromCustomer,
        citiesFromInvoice,
        vendors,
        brandFromTable,
        brandsFromItems,
        classesFromTable,
      ] =
        await Promise.all([
          this.prisma.customer
            .groupBy({
              by: ['city'],
              where: { tenantId, city: { not: null } },
            })
            .then((rows) =>
              rows
                .map((r) => r.city)
                .filter((c): c is string => c != null && c.trim() !== ''),
            ),
          this.prisma.invoice
            .groupBy({
              by: ['city'],
              where: { tenantId, city: { not: null } },
            })
            .then((rows) =>
              rows
                .map((r) => r.city)
                .filter((c): c is string => c != null && c.trim() !== ''),
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
          this.prisma.productClass
            .findMany({
              where: { tenantId },
              select: { name: true },
              orderBy: { name: 'asc' },
            })
            .then((rows) => rows.map((r) => r.name).filter((n) => n?.trim())),
        ]);
      const cities = [
        ...new Set([...citiesFromCustomer, ...citiesFromInvoice]),
      ].sort((a, b) => a.localeCompare(b, 'es'));
      const brands =
        brandFromTable.length > 0 ? brandFromTable : [...new Set(brandsFromItems)];
      const classes = [...new Set(classesFromTable)].sort((a, b) => a.localeCompare(b, 'es'));
      return { cities, vendors, brands, classes };
    });
  }

  async getSalesTotal(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string; brand?: string; class?: string },
  ) {
    const key = [
      tenantId,
      from.toISOString(),
      to.toISOString(),
      filters?.city?.trim() ?? '',
      filters?.vendor?.trim() ?? '',
      filters?.brand?.trim() ?? '',
      filters?.class?.trim() ?? '',
    ].join('|');
    return this.getCached(key, 30000, async () => {
      const scopedCustomerIds = await this.resolveCustomerScope(tenantId, {
        city: filters?.city,
      });
      const trimmedVendor = filters?.vendor?.trim();
      const cityWhere = this.cityFilterWhere(scopedCustomerIds ?? [], filters?.city);
      const brandWhere = await this.brandFilterWhere(tenantId, filters?.brand);
      const classWhere = await this.classFilterWhere(tenantId, filters?.class);
      const totals = await this.prisma.invoice.aggregate({
        where: {
          tenantId,
          issuedAt: { gte: from, lte: to },
          ...cityWhere,
          ...(trimmedVendor ? { vendor: { equals: trimmedVendor } } : {}),
          ...brandWhere,
          ...classWhere,
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
    filters?: { city?: string; vendor?: string; brand?: string; class?: string },
  ) {
    const scopedCustomerIds = await this.resolveCustomerScope(tenantId, {
      city: filters?.city,
    });
    const trimmedVendor = filters?.vendor?.trim();
    const trimmedBrand = filters?.brand?.trim();
    const trimmedClass = filters?.class?.trim();
    const brandValues = trimmedBrand ? await this.getBrandMatchValues(tenantId, trimmedBrand) : [];
    const classCodes = trimmedClass ? await this.getClassMatchCodes(tenantId, trimmedClass) : [];
    const classCond =
      classCodes.length > 0
        ? Prisma.sql` AND it."classCode" IN (${Prisma.join(classCodes.map((c) => Prisma.sql`${c}`))})`
        : Prisma.empty;
    const brandCond =
      trimmedBrand ?
        (brandValues.length > 0
          ? Prisma.sql` AND (it.brand IN (${Prisma.join(brandValues.map((b) => Prisma.sql`${b}`))}) OR it.brand ILIKE ${`%${trimmedBrand}%`})`
          : Prisma.sql` AND it.brand ILIKE ${`%${trimmedBrand}%`}`) :
        Prisma.empty;
    const vendorCond =
      trimmedVendor ? Prisma.sql` AND i."vendor" = ${trimmedVendor}` : Prisma.empty;
    const city = filters?.city?.trim();
    const cityCond =
      city ?
        scopedCustomerIds?.length
          ? Prisma.sql` AND (i."customerId" IN (${Prisma.join(scopedCustomerIds)}) OR i."city" ILIKE ${`%${city}%`})`
          : Prisma.sql` AND i."city" ILIKE ${`%${city}%`}`
      : scopedCustomerIds?.length
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
        ${cityCond}${vendorCond}${brandCond}${classCond}
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
