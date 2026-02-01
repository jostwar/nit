import axios from 'axios';
import { SourceApiClient, SourceCustomer, SourceInvoice, SourcePayment } from './source-api.client';

export class HttpSourceApiClient implements SourceApiClient {
  private readonly client = axios.create({
    baseURL: process.env.SOURCE_API_URL,
    headers: {
      Authorization: `Bearer ${process.env.SOURCE_API_TOKEN ?? ''}`,
    },
    timeout: 30000,
  });

  async fetchInvoices(
    tenantExternalId: string,
    from: string,
    to: string,
    options?: { cedula?: string; vendor?: string },
  ): Promise<SourceInvoice[]> {
    const response = await this.client.get('/invoices', {
      params: { tenantExternalId, from, to, ...options },
    });
    return response.data;
  }

  async fetchPayments(
    tenantExternalId: string,
    from: string,
    to: string,
    options?: { cedula?: string; vendor?: string },
  ): Promise<SourcePayment[]> {
    const response = await this.client.get('/payments', {
      params: { tenantExternalId, from, to, ...options },
    });
    return response.data;
  }

  async fetchCustomers(
    tenantExternalId: string,
    page: number,
    pageSize: number,
    vendor?: string,
  ): Promise<SourceCustomer[]> {
    const response = await this.client.get('/customers', {
      params: { tenantExternalId, page, pageSize, vendor },
    });
    return response.data;
  }
}
