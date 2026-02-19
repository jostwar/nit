import { SourceApiClient, SourceCustomer, SourceInvoice, SourcePayment } from './source-api.client';

export class MockSourceApiClient implements SourceApiClient {
  async fetchInvoices(
    _tenantExternalId: string,
    _from: string,
    _to: string,
    _options?: { cedula?: string; vendor?: string },
  ): Promise<SourceInvoice[]> {
    return [];
  }

  async fetchPayments(
    _tenantExternalId: string,
    _from: string,
    _to: string,
    _options?: { cedula?: string; vendor?: string },
  ): Promise<SourcePayment[]> {
    return [];
  }

  async fetchCustomers(
    _tenantExternalId: string,
    _page: number,
    _pageSize: number,
    _vendor?: string,
    _cedula?: string,
  ): Promise<SourceCustomer[]> {
    return [];
  }
}
