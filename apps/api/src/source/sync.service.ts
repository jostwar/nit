import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SOURCE_API_CLIENT } from './source.constants';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SOURCE_API_CLIENT) private readonly sourceApi: {
      fetchInvoices: (tenantExternalId: string, from: string, to: string) => Promise<unknown[]>;
      fetchPayments: (tenantExternalId: string, from: string, to: string) => Promise<unknown[]>;
      fetchCustomers: (
        tenantExternalId: string,
        page: number,
        pageSize: number,
        vendor?: string,
      ) => Promise<unknown[]>;
    },
  ) {}

  async syncInvoices(tenantId: string, tenantExternalId: string, from: string, to: string) {
    const invoices = await this.sourceApi.fetchInvoices(tenantExternalId, from, to);
    if (invoices.length === 0) {
      return { synced: 0 };
    }
    // Implementación mínima: por ahora no persiste para evitar inconsistencias en MVP.
    return { synced: invoices.length };
  }

  async syncPayments(tenantId: string, tenantExternalId: string, from: string, to: string) {
    const payments = await this.sourceApi.fetchPayments(tenantExternalId, from, to);
    if (payments.length === 0) {
      return { synced: 0 };
    }
    return { synced: payments.length };
  }

  async syncCustomers(tenantId: string, tenantExternalId: string, page = 1, pageSize = 1000) {
    const customers = await this.sourceApi.fetchCustomers(tenantExternalId, page, pageSize);
    if (customers.length === 0) {
      return { synced: 0 };
    }
    return { synced: customers.length };
  }
}
