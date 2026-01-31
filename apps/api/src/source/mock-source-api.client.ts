import { SourceApiClient, SourceCustomer, SourceInvoice, SourcePayment } from './source-api.client';

export class MockSourceApiClient implements SourceApiClient {
  async fetchInvoices(
    _tenantExternalId: string,
    _from: string,
    _to: string,
  ): Promise<SourceInvoice[]> {
    return [];
  }

  async fetchPayments(
    _tenantExternalId: string,
    _from: string,
    _to: string,
  ): Promise<SourcePayment[]> {
    return [];
  }

  async fetchCustomers(
    _tenantExternalId: string,
    _page: number,
    _pageSize: number,
    _vendor?: string,
  ): Promise<SourceCustomer[]> {
    return [];
  }
}
