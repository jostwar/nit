import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SOURCE_API_CLIENT } from './source.constants';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SOURCE_API_CLIENT) private readonly sourceApi: {
      fetchInvoices: (
        tenantExternalId: string,
        from: string,
        to: string,
        options?: { cedula?: string; vendor?: string },
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
        }>
      >;
    },
  ) {}

  private normalizeNit(value?: string) {
    if (!value) return '';
    return value.replace(/[^\d]/g, '');
  }

  private isInvalidName(name?: string, nit?: string) {
    if (!name) return true;
    const trimmed = name.trim();
    if (!trimmed) return true;
    if (nit && trimmed === nit) return true;
    if (/^\d+$/.test(trimmed)) return true;
    if (/^cliente\s+\d+/i.test(trimmed)) return true;
    return false;
  }

  async syncInvoices(
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
    let synced = 0;
    const processInvoice = async (invoice: {
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
    }) => {
      const normalizedNit = this.normalizeNit(invoice.customerNit) || invoice.customerNit;
      if (!normalizedNit || !invoice.externalId) return 0;
      const existingCustomer = await this.prisma.customer.findFirst({
        where: { tenantId, nit: normalizedNit },
      });
      const customer = existingCustomer
        ? existingCustomer
        : await this.prisma.customer.create({
            data: {
              tenantId,
              nit: normalizedNit,
              name: 'Cliente sin nombre',
            },
          });
      const issuedAt = new Date(invoice.issuedAt);
      const existing = await this.prisma.invoice.findFirst({
        where: {
          tenantId,
          customerId: customer.id,
          invoiceNumber: invoice.externalId,
        },
      });
      const saved = existing
        ? await this.prisma.invoice.update({
            where: { id: existing.id },
            data: {
              issuedAt,
              total: invoice.total,
              margin: invoice.margin,
              units: Math.round(invoice.units),
            },
          })
        : await this.prisma.invoice.create({
            data: {
              tenantId,
              customerId: customer.id,
              invoiceNumber: invoice.externalId,
              issuedAt,
              total: invoice.total,
              margin: invoice.margin,
              units: Math.round(invoice.units),
            },
          });
      await this.prisma.invoiceItem.deleteMany({
        where: { tenantId, invoiceId: saved.id },
      });
      if (invoice.items.length > 0) {
        await this.prisma.invoiceItem.createMany({
          data: invoice.items.map((item) => ({
            tenantId,
            invoiceId: saved.id,
            productName: item.productName,
            brand: item.brand,
            category: item.category,
            quantity: Math.round(item.quantity),
            unitPrice: item.unitPrice,
            total: item.total,
            margin: item.margin,
          })),
        });
      }
      return 1;
    };

    if (!usePerCustomer) {
      const invoices = await this.sourceApi.fetchInvoices(tenantExternalId, from, to);
      if (invoices.length === 0) {
        return { synced: 0 };
      }
      for (const invoice of invoices) {
        synced += await processInvoice(invoice);
      }
      return { synced };
    }

    const customerList = await this.prisma.customer.findMany({
      where: { tenantId },
      select: { id: true, nit: true, vendor: true },
    });
    for (const customer of customerList) {
      const records = await this.sourceApi.fetchInvoices(tenantExternalId, from, to, {
        cedula: customer.nit,
        vendor: customer.vendor ?? '',
      });
      for (const record of records) {
        synced += await processInvoice({
          ...record,
          customerNit: record.customerNit || customer.nit,
        });
      }
    }
    return { synced };
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
    const creditMap = new Map<
      string,
      { balance: number; overdue: number; overdueDaysSum: number; overdueCount: number }
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
    }) => {
      const normalizedNit = this.normalizeNit(payment.customerNit) || payment.customerNit;
      if (!normalizedNit) return 0;
      const existingCustomer = await this.prisma.customer.findFirst({
        where: { tenantId, nit: normalizedNit },
      });
      const customer = existingCustomer
        ? existingCustomer
        : await this.prisma.customer.create({
            data: {
              tenantId,
              nit: normalizedNit,
              name: 'Cliente sin nombre',
            },
          });

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
        if (overdueDays > 0) {
          summary.overdue += balance;
          summary.overdueDaysSum += overdueDays;
          summary.overdueCount += 1;
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

    if (!usePerCustomer) {
      const payments = await this.sourceApi.fetchPayments(tenantExternalId, from, to);
      if (payments.length === 0) {
        return { synced: 0 };
      }
      for (const payment of payments) {
        synced += await processPayment(payment);
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
        for (const record of records) {
          synced += await processPayment({
            ...record,
            customerNit: record.customerNit || customer.nit,
          });
        }
      }
    }

    for (const [customerId, summary] of creditMap.entries()) {
      const dsoDays =
        summary.overdueCount > 0 ? Math.round(summary.overdueDaysSum / summary.overdueCount) : 0;
      await this.prisma.credit.upsert({
        where: { customerId },
        update: {
          balance: summary.balance,
          overdue: summary.overdue,
          dsoDays,
        },
        create: {
          tenantId,
          customerId,
          creditLimit: 0,
          balance: summary.balance,
          overdue: summary.overdue,
          dsoDays,
        },
      });
    }

    return { synced };
  }

  async syncCustomers(tenantId: string, tenantExternalId: string, page = 1, pageSize = 1000) {
    const customers = await this.sourceApi.fetchCustomers(tenantExternalId, page, pageSize);
    if (customers.length === 0) {
      return { synced: 0 };
    }
    for (const customer of customers) {
      const normalizedNit = this.normalizeNit(customer.nit);
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
      const safeName = this.isInvalidName(customer.name, normalizedNit)
        ? 'Cliente sin nombre'
        : customer.name.trim();
      await this.prisma.customer.upsert({
        where: { tenantId_nit: { tenantId, nit: normalizedNit } },
        update: {
          name: safeName,
          segment: customer.segment ?? undefined,
          city: customer.city ?? undefined,
          vendor: customer.vendor ?? undefined,
        },
        create: {
          tenantId,
          nit: normalizedNit,
          name: safeName,
          segment: customer.segment ?? undefined,
          city: customer.city ?? undefined,
          vendor: customer.vendor ?? undefined,
        },
      });
    }
    return { synced: customers.length };
  }
}
