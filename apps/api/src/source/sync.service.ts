import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SOURCE_API_CLIENT } from './source.constants';
import { normalizeCustomerId } from '../common/utils/customer-id.util';
import type { FetchInvoicesResult } from './source-api.client';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SOURCE_API_CLIENT) private readonly sourceApi: {
      fetchInvoices: (
        tenantExternalId: string,
        from: string,
        to: string,
        options?: { cedula?: string; vendor?: string; tenantId?: string },
      ) => Promise<
        Array<{
          externalId: string;
          customerNit: string;
          customerName?: string;
          issuedAt: string;
          total: number;
          margin: number;
          units: number;
          items: Array<{
            productName: string;
            brand: string;
            category: string;
            quantity: number;
            unitPrice: number;
            total: number;
            margin: number;
          }>;
        }>
      >;
      fetchPayments: (
        tenantExternalId: string,
        from: string,
        to: string,
        options?: { cedula?: string; vendor?: string },
      ) => Promise<
        Array<{
          externalId: string;
          customerNit: string;
          customerName?: string;
          invoiceExternalId?: string;
          paidAt: string;
          amount: number;
          balance?: number;
          dueAt?: string;
          overdueDays?: number;
        }>
      >;
      fetchCustomers: (
        tenantExternalId: string,
        page: number,
        pageSize: number,
        vendor?: string,
      ) => Promise<
        Array<{
          externalId: string;
          nit: string;
          name: string;
          email?: string;
          phone?: string;
          address?: string;
          city?: string;
          segment?: string;
          vendor?: string;
          creditLimit?: number;
        }>
      >;
    },
  ) {}


  private isInvalidName(name?: string, nit?: string) {
    if (!name) return true;
    const trimmed = name.trim();
    if (!trimmed) return true;
    if (nit && trimmed === nit) return true;
    if (/^\d+$/.test(trimmed)) return true;
    if (/^cliente\s+\d+/i.test(trimmed)) return true;
    return false;
  }

  /** Nombre para cliente usando solo datos de la API: nombre si es válido, si no el NIT. */
  private nameFromApi(apiName: string | undefined, nit: string): string {
    if (apiName && !this.isInvalidName(apiName, nit)) return apiName.trim();
    return nit;
  }

  async syncInvoices(
    tenantId: string,
    tenantExternalId: string,
    from: string,
    to: string,
    opts?: {
      fullRange?: boolean;
      brandCodeToName?: Map<string, string>;
      classCodeToName?: Map<string, string>;
    },
  ): Promise<{ synced: number; unmappedRefsCount: number }> {
    const usePerCustomer =
      !opts?.fullRange &&
      process.env.SOURCE_API_PROVIDER === 'fomplus' &&
      process.env.SOURCE_SYNC_BY_CUSTOMER !== 'false';
    const concurrency = Math.min(10, Math.max(1, Number(process.env.SYNC_INVOICE_CONCURRENCY) || 8));
    let synced = 0;
    let unmappedRefsCount = 0;

    const customerCache = new Map<string, { id: string; city?: string | null }>();
    const existingCustomers = await this.prisma.customer.findMany({
      where: { tenantId },
      select: { id: true, nit: true, city: true },
    });
    for (const c of existingCustomers) {
      customerCache.set(c.nit, { id: c.id, city: c.city });
    }

    const getOrCreateCustomer = async (
      nit: string,
      city?: string | null,
      customerName?: string,
    ): Promise<{ id: string }> => {
      const cached = customerCache.get(nit);
      if (cached) return { id: cached.id };
      try {
        const name = this.nameFromApi(customerName, nit);
        const created = await this.prisma.customer.create({
          data: { tenantId, nit, name, fromListadoClientes: false },
          select: { id: true },
        });
        customerCache.set(nit, { id: created.id, city: null });
        return created;
      } catch {
        const existing = await this.prisma.customer.findFirst({
          where: { tenantId, nit },
          select: { id: true, city: true },
        });
        if (existing) {
          customerCache.set(nit, { id: existing.id, city: existing.city });
          return { id: existing.id };
        }
        throw new Error(`No se pudo obtener cliente NIT ${nit}`);
      }
    };

    const processInvoice = async (invoice: {
      externalId: string;
      customerNit: string;
      customerName?: string;
      issuedAt: string;
      total: number;
      margin: number;
      units: number;
      vendor?: string;
      city?: string;
      documentType?: string;
      saleSign?: number;
      items: Array<{
        productName: string;
        brand: string;
        category: string;
        classCode?: string;
        className?: string;
        quantity: number;
        unitPrice: number;
        total: number;
        margin: number;
      }>;
    }) => {
      const normalizedNit = normalizeCustomerId(invoice.customerNit) || invoice.customerNit;
      if (!normalizedNit || !invoice.externalId) return 0;
      const customer = await getOrCreateCustomer(normalizedNit, invoice.city, invoice.customerName);
      const cityFromInvoice = invoice.city?.trim();
      const cached = customerCache.get(normalizedNit);
      if (cityFromInvoice && cached && !cached.city?.trim()) {
        await this.prisma.customer.update({
          where: { id: customer.id },
          data: { city: cityFromInvoice },
        });
        cached.city = cityFromInvoice;
      }
      const issuedAt = new Date(invoice.issuedAt);
      const vendor = invoice.vendor?.trim() || null;
      const sign = invoice.saleSign === -1 ? -1 : 1;
      const unitsRounded = Math.round(invoice.units);
      const signedTotal = invoice.total * sign;
      const signedMargin = invoice.margin * sign;
      const signedUnits = unitsRounded * sign;
      const documentType = invoice.documentType?.trim() || null;
      const saleSign = sign;
      const city = invoice.city?.trim() || null;
      const saved = await this.prisma.invoice.upsert({
        where: {
          tenantId_customerId_invoiceNumber: {
            tenantId,
            customerId: customer.id,
            invoiceNumber: invoice.externalId,
          },
        },
        create: {
          tenantId,
          customerId: customer.id,
          invoiceNumber: invoice.externalId,
          issuedAt,
          total: invoice.total,
          margin: invoice.margin,
          units: unitsRounded,
          vendor,
          city,
          documentType,
          saleSign,
          signedTotal,
          signedMargin,
          signedUnits,
        },
        update: {
          issuedAt,
          total: invoice.total,
          margin: invoice.margin,
          units: unitsRounded,
          vendor,
          city,
          documentType,
          saleSign,
          signedTotal,
          signedMargin,
          signedUnits,
        },
      });
      await this.prisma.invoiceItem.deleteMany({
        where: { tenantId, invoiceId: saved.id },
      });
      const brandCodeToName = opts?.brandCodeToName;
      const classCodeToName = opts?.classCodeToName;
      if (invoice.items.length > 0) {
        await this.prisma.invoiceItem.createMany({
          data: invoice.items.map((item) => {
            const brand =
              brandCodeToName?.get(item.brand) ?? item.brand;
            const classCode = item.classCode?.trim() || null;
            const className =
              item.className?.trim() ||
              (classCode && classCodeToName?.get(classCode) ? classCodeToName.get(classCode)! : null) ||
              classCode;
            return {
              tenantId,
              invoiceId: saved.id,
              productName: item.productName,
              brand,
              category: item.category,
              classCode,
              className: className ?? null,
              quantity: Math.round(item.quantity),
              unitPrice: item.unitPrice,
              total: item.total,
              margin: item.margin,
            };
          }),
        });
      }
      return 1;
    };

    const unwrap = (r: Awaited<ReturnType<typeof this.sourceApi.fetchInvoices>>) => {
      if (Array.isArray(r)) return { invoices: r, unmapped: 0 };
      const res = r as FetchInvoicesResult;
      return { invoices: res.invoices, unmapped: res.unmappedRefsCount ?? 0 };
    };

    if (!usePerCustomer) {
      const result = await this.sourceApi.fetchInvoices(tenantExternalId, from, to, {
        tenantId,
      });
      const { invoices, unmapped } = unwrap(result);
      unmappedRefsCount += unmapped;
      if (invoices.length === 0) {
        return { synced: 0, unmappedRefsCount };
      }
      for (let i = 0; i < invoices.length; i += concurrency) {
        const batch = invoices.slice(i, i + concurrency);
        const results = await Promise.all(batch.map((inv) => processInvoice(inv)));
        synced += results.reduce((a, b) => a + b, 0);
      }
      return { synced, unmappedRefsCount };
    }

    const customerList = await this.prisma.customer.findMany({
      where: { tenantId },
      select: { id: true, nit: true, vendor: true },
    });
    for (const customer of customerList) {
      const result = await this.sourceApi.fetchInvoices(tenantExternalId, from, to, {
        cedula: customer.nit,
        vendor: customer.vendor ?? '',
        tenantId,
      });
      const { invoices: records, unmapped } = unwrap(result);
      unmappedRefsCount += unmapped;
      for (let i = 0; i < records.length; i += concurrency) {
        const batch = records.slice(i, i + concurrency).map((r) => ({
          ...r,
          customerNit: r.customerNit || customer.nit,
        }));
        const results = await Promise.all(batch.map((inv) => processInvoice(inv)));
        synced += results.reduce((a, b) => a + b, 0);
      }
    }
    return { synced, unmappedRefsCount };
  }

  async syncPayments(
    tenantId: string,
    tenantExternalId: string,
    from: string,
    to: string,
    opts?: { fullRange?: boolean },
  ) {
    const usePerCustomer =
      !opts?.fullRange &&
      process.env.SOURCE_API_PROVIDER === 'fomplus' &&
      process.env.SOURCE_SYNC_BY_CUSTOMER !== 'false';
    const customerCache = new Map<string, { id: string }>();
    const existingCustomers = await this.prisma.customer.findMany({
      where: { tenantId },
      select: { id: true, nit: true },
    });
    for (const c of existingCustomers) {
      customerCache.set(c.nit, { id: c.id });
    }
    const getOrCreateCustomer = async (
      nit: string,
      customerName?: string,
    ): Promise<{ id: string }> => {
      const cached = customerCache.get(nit);
      if (cached) return cached;
      try {
        const name = this.nameFromApi(customerName, nit);
        const created = await this.prisma.customer.create({
          data: { tenantId, nit, name, fromListadoClientes: false },
          select: { id: true },
        });
        customerCache.set(nit, created);
        return created;
      } catch {
        const existing = await this.prisma.customer.findFirst({
          where: { tenantId, nit },
          select: { id: true },
        });
        if (existing) {
          customerCache.set(nit, existing);
          return existing;
        }
        throw new Error(`No se pudo obtener cliente NIT ${nit}`);
      }
    };
    const creditMap = new Map<
      string,
      {
        balance: number;
        overdue: number;
        overdueDaysSum: number;
        overdueCount: number;
        creditLimit?: number;
      }
    >();
    let synced = 0;
    const processPayment = async (payment: {
      externalId: string;
      customerNit: string;
      customerName?: string;
      invoiceExternalId?: string;
      paidAt: string;
      amount: number;
      balance?: number;
      dueAt?: string;
      overdueDays?: number;
      overdueAmount?: number;
      creditLimit?: number;
    }) => {
      const normalizedNit = normalizeCustomerId(payment.customerNit) || payment.customerNit;
      if (!normalizedNit) return 0;
      const customer = await getOrCreateCustomer(normalizedNit, payment.customerName);

      const balance = payment.balance ?? 0;
      if (balance > 0) {
        const dueAt = payment.dueAt ? new Date(payment.dueAt) : null;
        const overdueDays =
          payment.overdueDays ??
          (dueAt ? Math.max(0, Math.ceil((Date.now() - dueAt.getTime()) / 86400000)) : 0);
        const summary = creditMap.get(customer.id) ?? {
          balance: 0,
          overdue: 0,
          overdueDaysSum: 0,
          overdueCount: 0,
        };
        summary.balance += balance;
        const rowOverdue =
          payment.overdueAmount != null && payment.overdueAmount >= 0
            ? Math.min(payment.overdueAmount, balance)
            : overdueDays > 0
              ? balance
              : 0;
        if (rowOverdue > 0) {
          summary.overdue += rowOverdue;
          summary.overdueDaysSum += overdueDays;
          summary.overdueCount += 1;
        }
        if (payment.creditLimit != null && payment.creditLimit >= 0) {
          summary.creditLimit = summary.creditLimit ?? payment.creditLimit;
        }
        creditMap.set(customer.id, summary);
      }

      if (payment.amount > 0) {
        const paidAt = new Date(payment.paidAt);
        const invoice = payment.invoiceExternalId
          ? await this.prisma.invoice.findFirst({
              where: {
                tenantId,
                customerId: customer.id,
                invoiceNumber: payment.invoiceExternalId,
              },
            })
          : null;
        const exists = await this.prisma.payment.findFirst({
          where: {
            tenantId,
            customerId: customer.id,
            invoiceId: invoice?.id ?? null,
            paidAt,
            amount: payment.amount,
          },
        });
        if (!exists) {
          await this.prisma.payment.create({
            data: {
              tenantId,
              customerId: customer.id,
              invoiceId: invoice?.id ?? undefined,
              paidAt,
              amount: payment.amount,
            },
          });
          return 1;
        }
      }
      return 0;
    };

    const payConcurrency = Math.min(5, Math.max(1, Number(process.env.SYNC_PAYMENT_CONCURRENCY) || 4));
    if (!usePerCustomer) {
      const payments = await this.sourceApi.fetchPayments(tenantExternalId, from, to);
      if (payments.length === 0) {
        return { synced: 0 };
      }
      for (let i = 0; i < payments.length; i += payConcurrency) {
        const batch = payments.slice(i, i + payConcurrency);
        const results = await Promise.all(batch.map((p) => processPayment(p)));
        synced += results.reduce((a, b) => a + b, 0);
      }
    } else {
      const customerList = await this.prisma.customer.findMany({
        where: { tenantId },
        select: { id: true, nit: true, vendor: true },
      });
      for (const customer of customerList) {
        const records = await this.sourceApi.fetchPayments(tenantExternalId, from, to, {
          cedula: customer.nit,
          vendor: customer.vendor ?? '',
        });
        for (let i = 0; i < records.length; i += payConcurrency) {
          const batch = records.slice(i, i + payConcurrency).map((r) => ({
            ...r,
            customerNit: r.customerNit || customer.nit,
          }));
          const results = await Promise.all(batch.map((p) => processPayment(p)));
          synced += results.reduce((a, b) => a + b, 0);
        }
      }
    }

    const creditUpdates = Array.from(creditMap.entries()).map(([customerId, summary]) => {
      const dsoDays =
        summary.overdueCount > 0 ? Math.round(summary.overdueDaysSum / summary.overdueCount) : 0;
      const creditLimit = summary.creditLimit ?? 0;
      return this.prisma.credit.upsert({
        where: { customerId },
        update: {
          balance: summary.balance,
          overdue: summary.overdue,
          dsoDays,
          ...(summary.creditLimit !== undefined ? { creditLimit: summary.creditLimit } : {}),
        },
        create: {
          tenantId,
          customerId,
          creditLimit,
          balance: summary.balance,
          overdue: summary.overdue,
          dsoDays,
        },
      });
    });
    if (creditUpdates.length > 0) {
      await Promise.all(creditUpdates);
    }

    return { synced };
  }

  async syncCustomers(tenantId: string, tenantExternalId: string, page = 1, pageSize = 1000) {
    const customers = await this.sourceApi.fetchCustomers(tenantExternalId, page, pageSize);
    if (customers.length === 0) {
      return { synced: 0 };
    }
    for (const customer of customers) {
      const normalizedNit = normalizeCustomerId(customer.nit);
      if (!normalizedNit) continue;
      const existing = await this.prisma.customer.findFirst({
        where: {
          tenantId,
          OR: [{ nit: normalizedNit }, { nit: customer.nit }],
        },
      });
      if (existing && existing.nit !== normalizedNit) {
        const conflict = await this.prisma.customer.findFirst({
          where: { tenantId, nit: normalizedNit },
        });
        if (!conflict) {
          await this.prisma.customer.update({
            where: { id: existing.id },
            data: { nit: normalizedNit },
          });
        }
      }
      const safeName = this.nameFromApi(customer.name, normalizedNit);
      const saved = await this.prisma.customer.upsert({
        where: { tenantId_nit: { tenantId, nit: normalizedNit } },
        update: {
          name: safeName,
          segment: customer.segment ?? undefined,
          city: customer.city ?? undefined,
          vendor: customer.vendor ?? undefined,
          fromListadoClientes: true,
        },
        create: {
          tenantId,
          nit: normalizedNit,
          name: safeName,
          segment: customer.segment ?? undefined,
          city: customer.city ?? undefined,
          vendor: customer.vendor ?? undefined,
          fromListadoClientes: true,
        },
      });
      if (
        customer.creditLimit != null &&
        typeof customer.creditLimit === 'number' &&
        customer.creditLimit >= 0
      ) {
        await this.prisma.credit.upsert({
          where: { customerId: saved.id },
          update: { creditLimit: customer.creditLimit },
          create: {
            tenantId,
            customerId: saved.id,
            creditLimit: customer.creditLimit,
            balance: 0,
            overdue: 0,
            dsoDays: 0,
          },
        });
      }
    }
    return { synced: customers.length };
  }
}
