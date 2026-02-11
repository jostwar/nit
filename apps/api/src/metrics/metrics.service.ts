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
        fromListadoClientes: true,
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

  /** Códigos de clase que coinciden con el nombre o código (filtro por clase). Si no hay match en ProductClass, devuelve [trimmed] para permitir filtrar por código que existe en ítems. */
  private async getClassMatchCodes(tenantId: string, classFilter: string): Promise<string[]> {
    const trimmed = classFilter?.trim();
    if (!trimmed) return [];
    const rows = await this.prisma.productClass.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: trimmed, mode: 'insensitive' } },
          { code: { contains: trimmed, mode: 'insensitive' } },
          { code: { equals: trimmed } },
        ],
      },
      select: { code: true },
    });
    const codes = rows.map((r) => r.code.trim()).filter(Boolean);
    if (codes.length > 0) return codes;
    return [trimmed];
  }

  /** Condición Prisma para filtro por clase: por nombre (className) o código (classCode). */
  private async classItemCondition(
    tenantId: string,
    classFilter: string | undefined,
  ): Promise<Prisma.InvoiceItemWhereInput | null> {
    const trimmed = classFilter?.trim();
    if (!trimmed) return null;
    const codes = await this.getClassMatchCodes(tenantId, trimmed);
    return {
      OR: [
        { className: { equals: trimmed } },
        ...(codes.length > 0 ? [{ classCode: { in: codes } }] : []),
      ],
    };
  }

  /** Condición Prisma para filtro por marca (solo el item). */
  private async brandItemCondition(
    tenantId: string,
    brandFilter: string | undefined,
  ): Promise<Prisma.InvoiceItemWhereInput | null> {
    const trimmed = brandFilter?.trim();
    if (!trimmed) return null;
    const values = await this.getBrandMatchValues(tenantId, trimmed);
    return {
      OR: [
        ...(values.length > 0 ? [{ brand: { in: values } }] : []),
        { brand: { contains: trimmed, mode: Prisma.QueryMode.insensitive } },
      ],
    };
  }

  /** Filtro combinado marca + clase: un solo items.some con AND para que no se pisen. */
  private async itemsBrandClassWhere(
    tenantId: string,
    brandFilter: string | undefined,
    classFilter: string | undefined,
  ): Promise<Prisma.InvoiceWhereInput> {
    const [brandCond, classCond] = await Promise.all([
      this.brandItemCondition(tenantId, brandFilter),
      this.classItemCondition(tenantId, classFilter),
    ]);
    if (!brandCond && !classCond) return {};
    if (brandCond && !classCond) return { items: { some: brandCond } };
    if (!brandCond && classCond) return { items: { some: classCond } };
    return { items: { some: { AND: [brandCond!, classCond!] } } };
  }

  /** @deprecated Usar itemsBrandClassWhere para combinar con clase. */
  private async brandFilterWhere(
    tenantId: string,
    brandFilter: string | undefined,
  ): Promise<Prisma.InvoiceWhereInput> {
    return this.itemsBrandClassWhere(tenantId, brandFilter, undefined);
  }

  /** @deprecated Usar itemsBrandClassWhere para combinar con marca. */
  private async classFilterWhere(
    tenantId: string,
    classFilter: string | undefined,
  ): Promise<Prisma.InvoiceWhereInput> {
    return this.itemsBrandClassWhere(tenantId, undefined, classFilter);
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
      const trimmedClass = filters?.class?.trim();
      const cityWhere = this.cityFilterWhere(scopedCustomerIds ?? [], filters?.city);
      const itemsWhere = await this.itemsBrandClassWhere(tenantId, filters?.brand, filters?.class);
      const [brandValues, classCodes] = await Promise.all([
        trimmedBrand ? this.getBrandMatchValues(tenantId, trimmedBrand) : [],
        trimmedClass ? this.getClassMatchCodes(tenantId, trimmedClass) : [],
      ]);
      const currentWhere: Prisma.InvoiceWhereInput = {
        tenantId,
        issuedAt: { gte: from, lte: to },
        ...cityWhere,
        ...(trimmedVendor ? { vendor: { equals: trimmedVendor } } : {}),
        ...itemsWhere,
      };
      const compareWhere: Prisma.InvoiceWhereInput = {
        tenantId,
        issuedAt: { gte: compareFrom, lte: compareTo },
        ...cityWhere,
        ...(trimmedVendor ? { vendor: { equals: trimmedVendor } } : {}),
        ...itemsWhere,
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
        if (trimmedBrand || classCodes.length > 0) {
          const brandPattern = trimmedBrand ? `%${trimmedBrand}%` : '';
          const brandJoinCond = trimmedBrand
            ? (brandValues.length > 0
                ? Prisma.sql` AND (it.brand IN (${Prisma.join(brandValues.map((b) => Prisma.sql`${b}`))}) OR it.brand ILIKE ${brandPattern})`
                : Prisma.sql` AND it.brand ILIKE ${brandPattern}`)
            : Prisma.sql``;
          const classJoinCond =
            classCodes.length > 0
              ? Prisma.sql` AND it."classCode" IN (${Prisma.join(classCodes.map((c) => Prisma.sql`${c}`))})`
              : Prisma.sql``;
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
                  INNER JOIN "InvoiceItem" it ON it."invoiceId" = i.id${brandJoinCond}${classJoinCond}
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
                  INNER JOIN "InvoiceItem" it ON it."invoiceId" = i.id${brandJoinCond}${classJoinCond}
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
    return this.getCached(key, 15000, async () => {
      const [
        citiesFromCustomer,
        citiesFromInvoice,
        vendors,
        _brandFromTable,
        brandsFromItems,
        productClassRows,
        classesFromItems,
      ] =
        await Promise.all([
          this.prisma.customer
            .groupBy({
              by: ['city'],
              where: { tenantId, fromListadoClientes: true, city: { not: null } },
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
        Promise.resolve([] as string[]),
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
        this.prisma.productClass.findMany({
          where: { tenantId },
          select: { code: true, name: true },
          orderBy: { name: 'asc' },
        }),
        Promise.all([
          this.prisma.invoiceItem.groupBy({
            by: ['className'],
            where: { tenantId, className: { not: null } },
          }),
          this.prisma.invoiceItem.groupBy({
            by: ['classCode'],
            where: { tenantId, classCode: { not: null } },
          }),
        ]).then(([byName, byCode]) => ({
          names: byName.map((r) => r.className).filter((c): c is string => c != null && c.trim() !== ''),
          codes: byCode.map((r) => r.classCode).filter((c): c is string => c != null && c.trim() !== ''),
        })),
      ]);
      const cities = [
        ...new Set([...citiesFromCustomer, ...citiesFromInvoice]),
      ].sort((a, b) => a.localeCompare(b, 'es'));
      const classCodeToName = new Map(
        productClassRows.map((r) => [r.code.trim(), r.name?.trim() ?? r.code]),
      );
      const classDisplayNames = new Set<string>();
      productClassRows.forEach((r) => {
        const n = r.name?.trim();
        if (n) classDisplayNames.add(n);
      });
      classesFromItems.names.forEach((name) => {
        if (name && name !== '(SIN MAPEO)') classDisplayNames.add(name);
      });
      classesFromItems.codes.forEach((code) => {
        classDisplayNames.add(classCodeToName.get(code) ?? code);
      });
      const classes = Array.from(classDisplayNames).filter((c) => c && c !== '(SIN MAPEO)').sort((a, b) => a.localeCompare(b, 'es'));
      const [totalItems, itemsWithBrand, itemsWithClass] = await Promise.all([
        this.prisma.invoiceItem.count({ where: { tenantId } }),
        this.prisma.invoiceItem.count({
          where: { tenantId, brand: { notIn: ['', 'Sin marca'] } },
        }),
        this.prisma.invoiceItem.count({
          where: { tenantId, OR: [{ className: { not: null } }, { classCode: { not: null } }] },
        }),
      ]);
      // Marcas solo desde ítems (MARCA/REFER del sync). No usar ProductBrand para el filtro.
      const brandsFromItemsSet = new Set(brandsFromItems);
      const brands =
        brandsFromItemsSet.size > 0
          ? Array.from(brandsFromItemsSet).sort((a, b) => a.localeCompare(b, 'es'))
          : [];
      return {
        cities,
        vendors,
        brands,
        classes,
        itemDiagnostic: {
          totalItems,
          itemsWithBrand,
          itemsWithClass,
        },
      };
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
      const itemsWhere = await this.itemsBrandClassWhere(tenantId, filters?.brand, filters?.class);
      const totals = await this.prisma.invoice.aggregate({
        where: {
          tenantId,
          issuedAt: { gte: from, lte: to },
          ...cityWhere,
          ...(trimmedVendor ? { vendor: { equals: trimmedVendor } } : {}),
          ...itemsWhere,
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
      trimmedClass
        ? classCodes.length > 0
          ? Prisma.sql` AND (it."classCode" IN (${Prisma.join(classCodes.map((c) => Prisma.sql`${c}`))}) OR it."className" = ${trimmedClass})`
          : Prisma.sql` AND it."className" = ${trimmedClass}`
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
      Array<{ className: string | null; classCode: string | null; totalSales: string; lineCount: bigint }>
    >(Prisma.sql`
      SELECT it."className", it."classCode",
        SUM(it.total * i."saleSign")::text as "totalSales",
        COUNT(*)::bigint as "lineCount"
      FROM "InvoiceItem" it
      INNER JOIN "Invoice" i ON i.id = it."invoiceId"
      WHERE it."tenantId" = ${tenantId}
        AND (it."className" IS NOT NULL OR it."classCode" IS NOT NULL)
        AND i."issuedAt" >= ${from}
        AND i."issuedAt" <= ${to}
        ${cityCond}${vendorCond}${brandCond}${classCond}
      GROUP BY it."className", it."classCode"
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
      className: (r.className?.trim() || nameMap.get(r.classCode ?? '') || r.classCode || '').trim(),
      totalSales: Number(r.totalSales ?? 0),
      count: Number(r.lineCount ?? 0),
    })).sort((a, b) => b.totalSales - a.totalSales);
  }

  /** Ventas agregadas por vendedor (Invoice.vendor = NOMVEN de GenerarInfoVentas). */
  async getSalesByVendor(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string; brand?: string; class?: string },
  ) {
    const scopedCustomerIds = await this.resolveCustomerScope(tenantId, { city: filters?.city });
    const trimmedVendor = filters?.vendor?.trim();
    const trimmedBrand = filters?.brand?.trim();
    const trimmedClass = filters?.class?.trim();
    const brandValues = trimmedBrand ? await this.getBrandMatchValues(tenantId, trimmedBrand) : [];
    const classCodes = trimmedClass ? await this.getClassMatchCodes(tenantId, trimmedClass) : [];
    const classCond =
      trimmedClass
        ? classCodes.length > 0
          ? Prisma.sql` AND (it."classCode" IN (${Prisma.join(classCodes.map((c) => Prisma.sql`${c}`))}) OR it."className" = ${trimmedClass})`
          : Prisma.sql` AND it."className" = ${trimmedClass}`
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
      Array<{ vendor: string | null; totalSales: string; lineCount: bigint }>
    >(Prisma.sql`
      SELECT COALESCE(i."vendor", 'Sin vendedor') as "vendor",
        SUM(it.total * i."saleSign")::text as "totalSales",
        COUNT(*)::bigint as "lineCount"
      FROM "InvoiceItem" it
      INNER JOIN "Invoice" i ON i.id = it."invoiceId"
      WHERE it."tenantId" = ${tenantId}
        AND i."issuedAt" >= ${from}
        AND i."issuedAt" <= ${to}
        ${cityCond}${vendorCond}${brandCond}${classCond}
      GROUP BY i."vendor"
      ORDER BY SUM(it.total * i."saleSign") DESC
    `);
    return rows.map((r) => ({
      vendor: r.vendor?.trim() || 'Sin vendedor',
      totalSales: Number(r.totalSales ?? 0),
      count: Number(r.lineCount ?? 0),
    }));
  }

  /** Ventas agregadas por marca (InvoiceItem.brand = MARCA de GenerarInfoVentas). */
  async getSalesByBrand(
    tenantId: string,
    from: Date,
    to: Date,
    filters?: { city?: string; vendor?: string; brand?: string; class?: string },
  ) {
    const scopedCustomerIds = await this.resolveCustomerScope(tenantId, { city: filters?.city });
    const trimmedVendor = filters?.vendor?.trim();
    const trimmedBrand = filters?.brand?.trim();
    const trimmedClass = filters?.class?.trim();
    const brandValues = trimmedBrand ? await this.getBrandMatchValues(tenantId, trimmedBrand) : [];
    const classCodes = trimmedClass ? await this.getClassMatchCodes(tenantId, trimmedClass) : [];
    const classCond =
      trimmedClass
        ? classCodes.length > 0
          ? Prisma.sql` AND (it."classCode" IN (${Prisma.join(classCodes.map((c) => Prisma.sql`${c}`))}) OR it."className" = ${trimmedClass})`
          : Prisma.sql` AND it."className" = ${trimmedClass}`
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
      Array<{ brand: string; totalSales: string; lineCount: bigint }>
    >(Prisma.sql`
      SELECT COALESCE(NULLIF(TRIM(it.brand), ''), 'Sin marca') as "brand",
        SUM(it.total * i."saleSign")::text as "totalSales",
        COUNT(*)::bigint as "lineCount"
      FROM "InvoiceItem" it
      INNER JOIN "Invoice" i ON i.id = it."invoiceId"
      WHERE it."tenantId" = ${tenantId}
        AND i."issuedAt" >= ${from}
        AND i."issuedAt" <= ${to}
        ${cityCond}${vendorCond}${brandCond}${classCond}
      GROUP BY COALESCE(NULLIF(TRIM(it.brand), ''), 'Sin marca')
      ORDER BY SUM(it.total * i."saleSign") DESC
    `);
    return rows.map((r) => ({
      brand: r.brand?.trim() || 'Sin marca',
      totalSales: Number(r.totalSales ?? 0),
      count: Number(r.lineCount ?? 0),
    }));
  }

  /** Tabla TIPOMOV para validar contra ERP: código, concepto, SUMA/RESTA, facturas, total. */
  private static TIPOMOV_CONCEPTS: Record<string, string> = {
    '01': 'Factura de venta',
    '13': 'Factura de caja',
    '04': 'Nota crédito a factura',
    '06': 'Nota crédito independiente',
    '15': 'Devolución independiente caja',
  };

  async getTipomovSummary(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      documentType: string;
      concept: string;
      sign: string;
      count: number;
      totalSigned: number;
      unitsSigned: number;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        documentType: string | null;
        count: bigint;
        totalSigned: string;
        unitsSigned: string;
      }>
    >(Prisma.sql`
      SELECT i."documentType",
        COUNT(*)::bigint as count,
        COALESCE(SUM(i."signedTotal"), 0)::text as "totalSigned",
        COALESCE(SUM(i."signedUnits"), 0)::text as "unitsSigned"
      FROM "Invoice" i
      WHERE i."tenantId" = ${tenantId}
        AND i."issuedAt" >= ${from}
        AND i."issuedAt" <= ${to}
      GROUP BY i."documentType"
      ORDER BY i."documentType"
    `);
    const restaCodes = (process.env.SOURCE_VENTAS_TIPOMOV_RESTA ?? '04,06,15')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const mapped = rows.map((r) => {
      const raw = r.documentType?.trim();
      const code = raw ?? '__NULL__';
      const isResta = code !== '__NULL__' && restaCodes.includes(code);
      return {
        documentType: code,
        concept:
          code === '__NULL__'
            ? 'Sin tipo (ERP no envía TIPMOV/TIPOMOV)'
            : MetricsService.TIPOMOV_CONCEPTS[code] ?? 'Otro',
        sign: isResta ? 'RESTA' : 'SUMA',
        count: Number(r.count ?? 0),
        totalSigned: Number(r.totalSigned ?? 0),
        unitsSigned: Number(r.unitsSigned ?? 0),
      };
    });
    const withNull = mapped.filter((r) => r.documentType === '__NULL__');
    const withoutNull = mapped.filter((r) => r.documentType !== '__NULL__');
    return [
      ...withoutNull.sort((a, b) => (a.documentType < b.documentType ? -1 : 1)),
      ...withNull.map((r) => ({ ...r, documentType: 'N/A' })),
    ];
  }

  /**
   * Detalle línea a línea para una fila TIPOMOV (ej. documentType=N/A para "Sin tipo").
   * Devuelve las facturas que componen esa fila.
   */
  async getTipomovDetail(
    tenantId: string,
    from: Date,
    to: Date,
    documentType: string,
  ): Promise<
    Array<{
      fecha: string;
      invoiceNumber: string;
      customerNit: string;
      customerName: string | null;
      total: number;
      units: number;
    }>
  > {
    const isNull = documentType === 'N/A' || documentType === '__NULL__' || documentType === '';
    const where = {
      tenantId,
      issuedAt: { gte: from, lte: to },
      ...(isNull ? { documentType: null } : { documentType }),
    };
    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        issuedAt: true,
        invoiceNumber: true,
        signedTotal: true,
        signedUnits: true,
        customerId: true,
        customer: { select: { nit: true, name: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 500,
    });
    return invoices.map((i) => ({
      fecha: i.issuedAt.toISOString().slice(0, 10),
      invoiceNumber: i.invoiceNumber,
      customerNit: i.customer?.nit ?? '',
      customerName: i.customer?.name ?? null,
      total: Number(i.signedTotal ?? 0),
      units: Number(i.signedUnits ?? 0),
    }));
  }
}
