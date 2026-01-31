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
      ) => Promise<
        Array<{
          externalId: string;
          customerNit: string;
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
      ) => Promise<
        Array<{
          externalId: string;
          customerNit: string;
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

  async syncInvoices(tenantId: string, tenantExternalId: string, from: string, to: string) {
    const invoices = await this.sourceApi.fetchInvoices(tenantExternalId, from, to);
    if (invoices.length === 0) {
      return { synced: 0 };
    }
    let synced = 0;
    for (const invoice of invoices) {
      if (!invoice.customerNit || !invoice.externalId) continue;
      const customer = await this.prisma.customer.upsert({
        where: { tenantId_nit: { tenantId, nit: invoice.customerNit } },
        update: {},
        create: {
          tenantId,
          nit: invoice.customerNit,
          name: invoice.customerNit,
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
      synced += 1;
    }
    return { synced };
  }

  async syncPayments(tenantId: string, tenantExternalId: string, from: string, to: string) {
    const payments = await this.sourceApi.fetchPayments(tenantExternalId, from, to);
    if (payments.length === 0) {
      return { synced: 0 };
    }
    const creditMap = new Map<
      string,
      { balance: number; overdue: number; overdueDaysSum: number; overdueCount: number }
    >();
    let synced = 0;

    for (const payment of payments) {
      if (!payment.customerNit) continue;
      const customer = await this.prisma.customer.upsert({
        where: { tenantId_nit: { tenantId, nit: payment.customerNit } },
        update: {},
        create: {
          tenantId,
          nit: payment.customerNit,
          name: payment.customerNit,
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
          synced += 1;
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
    await this.prisma.$transaction(
      customers.map((customer) =>
        this.prisma.customer.upsert({
          where: { tenantId_nit: { tenantId, nit: customer.nit } },
          update: {
            name: customer.name,
            segment: customer.segment ?? undefined,
            city: customer.city ?? undefined,
          },
          create: {
            tenantId,
            nit: customer.nit,
            name: customer.name,
            segment: customer.segment ?? undefined,
            city: customer.city ?? undefined,
          },
        }),
      ),
    );
    return { synced: customers.length };
  }
}
